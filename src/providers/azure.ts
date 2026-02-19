import type {
  AzureCluster,
  CommandResult,
  ProviderStatus,
} from "../config/types.ts";
import { runCommand, runCommandSilent } from "../utils/shell.ts";
import { green, yellow, blue, red, cyan, gray } from "../utils/colors.ts";
import { parseAzureError, printError } from "../utils/errors.ts";

/** Optionally set the active Azure subscription before connecting */
async function ensureSubscription(subscription: string): Promise<void> {
  console.log(yellow(`  🔐 Setting Azure subscription → ${subscription}`));
  const result = await runCommandSilent("az", [
    "account",
    "set",
    "--subscription",
    subscription,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to set subscription: ${result.stderr}`);
  }
}

/** Fetch AKS credentials and merge into kubeconfig with verbose status output */
export async function connectAzure(cluster: AzureCluster): Promise<void> {
  console.log(blue(`  Target cluster:        ${cluster.clusterName}`));
  console.log(blue(`  Target resource group: ${cluster.resourceGroup}`));
  if (cluster.subscription)
    console.log(blue(`  Target subscription:   ${cluster.subscription}`));
  console.log("");

  // Verify Azure is authenticated
  console.log(yellow(`  🔐 Verifying Azure authentication...`));
  const account = await runCommandSilent("az", [
    "account",
    "show",
    "--query",
    "name",
    "--output",
    "tsv",
  ]);
  if (account.exitCode !== 0) {
    console.log(yellow(`  🔐 Not authenticated — launching az login...`));
    const login = await runCommand("az", ["login"]);
    if (login.exitCode !== 0) {
      throw new Error(`Azure login failed`);
    }
  } else {
    console.log(green(`  ✅ Azure subscription: ${account.stdout.trim()}`));
  }

  if (cluster.subscription) {
    await ensureSubscription(cluster.subscription);
  }

  // Verify the cluster exists before fetching credentials
  console.log(yellow(`  🔍 Verifying AKS cluster exists...`));
  const clusterCheck = await runCommandSilent("az", [
    "aks",
    "show",
    "--resource-group",
    cluster.resourceGroup,
    "--name",
    cluster.clusterName,
    "--query",
    "name",
    "--output",
    "tsv",
  ]);
  if (clusterCheck.exitCode !== 0) {
    throw new Error(
      `AKS cluster "${cluster.clusterName}" not found in resource group "${cluster.resourceGroup}".\n` +
        `Run: az aks list --resource-group ${cluster.resourceGroup} --query "[].name" --output tsv`,
    );
  }
  console.log(
    green(`  ✅ AKS cluster verified: ${clusterCheck.stdout.trim()}`),
  );

  console.log(yellow(`  ⚙️  Fetching kubeconfig credentials...`));
  const result = await runCommand("az", [
    "aks",
    "get-credentials",
    "--resource-group",
    cluster.resourceGroup,
    "--name",
    cluster.clusterName,
    "--overwrite-existing",
  ]);
  if (result.exitCode !== 0) {
    // Note: result.stderr is empty because runCommand uses inherit
    throw new Error(`az aks get-credentials failed (exit ${result.exitCode})`);
  }

  // Verify auth alignment
  console.log(yellow(`  🔍 Verifying authentication alignment...`));
  const finalSub = await runCommandSilent("az", [
    "account",
    "show",
    "--query",
    "name",
    "--output",
    "tsv",
  ]);
  const finalTenant = await runCommandSilent("az", [
    "account",
    "show",
    "--query",
    "tenantId",
    "--output",
    "tsv",
  ]);
  if (finalSub.exitCode === 0) {
    console.log(green(`  ✅ Authentication properly aligned`));
  } else {
    console.log(yellow(`  ⚠️  Could not verify auth alignment`));
  }

  // Test reachability
  console.log(yellow(`  🔍 Testing cluster connection...`));
  const nodes = await runCommandSilent("kubectl", [
    "get",
    "nodes",
    "--no-headers",
  ]);
  const nodeCount = nodes.stdout.trim().split("\n").filter(Boolean).length;
  if (nodes.exitCode === 0 && nodeCount > 0) {
    console.log(
      green(`  ✅ Cluster reachable — ${nodeCount} node(s) available`),
    );
  } else {
    console.log(
      yellow(
        `  ⚠️  Cluster not immediately reachable (may still be propagating)`,
      ),
    );
  }

  // Final status summary
  const ctx = await runCommandSilent("kubectl", ["config", "current-context"]);
  console.log("");
  console.log(cyan(`  📊 Final Status:`));
  console.log(gray(`     Azure Subscription : ${finalSub.stdout.trim()}`));
  console.log(gray(`     Azure Tenant       : ${finalTenant.stdout.trim()}`));
  console.log(gray(`     Resource Group     : ${cluster.resourceGroup}`));
  console.log(gray(`     K8s Context        : ${ctx.stdout.trim()}`));
}

/** Check current Azure authentication status */
export async function statusAzure(): Promise<ProviderStatus> {
  try {
    const result = await runCommandSilent("az", [
      "account",
      "show",
      "--query",
      "user.name",
      "--output",
      "tsv",
    ]);
    if (result.exitCode !== 0 || !result.stdout.trim()) {
      return { provider: "azure", isAuthenticated: false };
    }
    const subResult = await runCommandSilent("az", [
      "account",
      "show",
      "--query",
      "name",
      "--output",
      "tsv",
    ]);
    return {
      provider: "azure",
      isAuthenticated: true,
      identity: result.stdout.trim(),
      details:
        subResult.exitCode === 0
          ? `subscription: ${subResult.stdout.trim()}`
          : undefined,
    };
  } catch {
    return {
      provider: "azure",
      isAuthenticated: false,
      details: "az CLI not installed",
    };
  }
}

/** Discover AKS clusters in the current subscription */
export async function discoverAzure(resourceGroup?: string): Promise<void> {
  const args = ["aks", "list", "--output", "table"];
  if (resourceGroup) args.push("--resource-group", resourceGroup);
  const result = await runCommand("az", args);
  if (result.exitCode !== 0) {
    throw new Error(`Discovery failed (exit ${result.exitCode})`);
  }
}

/** Login to Azure Container Registry via Docker */
export async function registryAzure(registryName: string): Promise<void> {
  console.log(yellow(`  🐳 Logging Docker into ${registryName}.azurecr.io...`));
  const result = await runCommand("az", [
    "acr",
    "login",
    "--name",
    registryName,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`ACR login failed (exit ${result.exitCode})`);
  }
  console.log(green(`  ✅ Authenticated to ${registryName}.azurecr.io`));
}

/** List ACR repositories in a registry */
export async function listRegistriesAzure(): Promise<void> {
  console.log(yellow(`  📋 Listing Azure Container Registries...`));
  const result = await runCommand("az", [
    "acr",
    "list",
    "--query",
    "[].{name:name, resourceGroup:resourceGroup, loginServer:loginServer}",
    "--output",
    "table",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to list ACR registries: ${result.stderr}`);
  }
}

/** Authenticate Azure interactively */
export async function loginAzure(): Promise<CommandResult> {
  return runCommand("az", ["login"]);
}
