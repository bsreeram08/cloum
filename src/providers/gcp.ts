import type {
  GcpCluster,
  CommandResult,
  ProviderStatus,
} from "../config/types.ts";
import { runCommand, runCommandSilent } from "../utils/shell.ts";
import { green, yellow, blue, red, cyan, gray } from "../utils/colors.ts";
import { parseGcpError, printError } from "../utils/errors.ts";

/** Validate gcloud authentication before any operations, triggering login if needed */
async function ensureAuthenticated(account?: string): Promise<void> {
  // First, check if we can get a valid token with current credentials
  const token = await runCommandSilent("gcloud", [
    "auth",
    "print-access-token",
  ]);
  
  if (token.exitCode !== 0) {
    // Token is invalid/expired, need to login
    console.log(yellow(`  🔐 Authentication expired — launching gcloud auth login...`));
    const loginArgs = account ? ["auth", "login", "--account", account] : ["auth", "login"];
    await runCommand("gcloud", loginArgs);
    return;
  }
  
  // Token is valid, but if a specific account is requested, ensure we're using it
  if (account) {
    const current = await runCommandSilent("gcloud", [
      "config",
      "get-value",
      "account",
    ]);
    if (current.stdout.trim() !== account) {
      console.log(yellow(`  🔐 Switching gcloud account → ${account}`));
      const set = await runCommandSilent("gcloud", [
        "config",
        "set",
        "account",
        account,
      ]);
      if (set.exitCode !== 0) {
        throw new Error(`Failed to switch gcloud account: ${set.stderr}`);
      }
      // After switching accounts, verify the new token is valid
      const newToken = await runCommandSilent("gcloud", [
        "auth",
        "print-access-token",
      ]);
      if (newToken.exitCode !== 0) {
        console.log(
          yellow(
            `  🔐 Token expired for ${account} — launching gcloud auth login...`,
          ),
        );
        await runCommand("gcloud", ["auth", "login", "--account", account]);
      }
    }
  }
}

/** Fetch GKE credentials and update kubeconfig with verbose status output */
export async function connectGcp(cluster: GcpCluster): Promise<void> {
  console.log(blue(`  Target account:  ${cluster.account ?? "(active)"}`));
  console.log(blue(`  Target project:  ${cluster.project}`));
  console.log(blue(`  Target cluster:  ${cluster.clusterName}`));
  console.log(blue(`  Target region:   ${cluster.region}`));
  console.log("");

  // Ensure we have valid authentication before any operations
  await ensureAuthenticated(cluster.account);

  console.log(yellow(`  🏗️  Setting GCP project...`));
  const projSet = await runCommandSilent("gcloud", [
    "config",
    "set",
    "project",
    cluster.project,
  ]);
  if (projSet.exitCode !== 0) {
    const err = parseGcpError(projSet.stderr);
    printError(err);
    throw new Error(`Failed to set project: ${err.message}`);
  }

  console.log(yellow(`  ⚙️  Fetching kubeconfig credentials...`));
  const creds = await runCommand("gcloud", [
    "container",
    "clusters",
    "get-credentials",
    cluster.clusterName,
    "--region",
    cluster.region,
    "--project",
    cluster.project,
  ]);
  if (creds.exitCode !== 0) {
    // Note: creds.stderr is empty because runCommand uses inherit for stdout/stderr
    // We can't parse the error here, but this is a terminal operation anyway
    throw new Error(`gcloud get-credentials failed (exit ${creds.exitCode})`);
  }

  // Verify auth alignment
  console.log(yellow(`  🔍 Verifying authentication alignment...`));
  const finalAccount = await runCommandSilent("gcloud", [
    "config",
    "get-value",
    "account",
  ]);
  const finalProject = await runCommandSilent("gcloud", [
    "config",
    "get-value",
    "project",
  ]);
  const accountOk =
    !cluster.account || finalAccount.stdout.trim() === cluster.account;
  const projectOk = finalProject.stdout.trim() === cluster.project;
  if (accountOk && projectOk) {
    console.log(green(`  ✅ Authentication properly aligned`));
  } else {
    console.log(yellow(`  ⚠️  Authentication may not be fully aligned`));
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
  console.log(gray(`     GCP Account : ${finalAccount.stdout.trim()}`));
  console.log(gray(`     GCP Project : ${finalProject.stdout.trim()}`));
  console.log(gray(`     K8s Context : ${ctx.stdout.trim()}`));
}

/** Check current gcloud authentication status */
export async function statusGcp(): Promise<ProviderStatus> {
  try {
    const result = await runCommandSilent("gcloud", [
      "auth",
      "list",
      "--filter=status:ACTIVE",
      "--format=value(account)",
    ]);
    if (result.exitCode !== 0 || !result.stdout.trim()) {
      return { provider: "gcp", isAuthenticated: false };
    }
    const project = await runCommandSilent("gcloud", [
      "config",
      "get-value",
      "project",
    ]);
    return {
      provider: "gcp",
      isAuthenticated: true,
      identity: result.stdout.trim(),
      details:
        project.exitCode === 0 && project.stdout.trim()
          ? `project: ${project.stdout.trim()}`
          : undefined,
    };
  } catch {
    return {
      provider: "gcp",
      isAuthenticated: false,
      details: "gcloud not installed",
    };
  }
}

/** Discover GKE clusters in a given project (or active project) */
export async function discoverGcp(project?: string): Promise<void> {
  const args = [
    "container",
    "clusters",
    "list",
    "--format=table(name,location,status,currentNodeCount)",
  ];
  if (project) args.push("--project", project);
  const result = await runCommand("gcloud", args);
  if (result.exitCode !== 0) {
    throw new Error(`Discovery failed:\n${result.stderr}`);
  }
}

/** Login to GCP Artifact Registry via Docker */
export async function registryGcp(
  region: string,
  project: string,
): Promise<void> {
  const registry = `${region}-docker.pkg.dev`;
  console.log(yellow(`  🐳 Configuring Docker for ${registry}...`));
  const result = await runCommand("gcloud", [
    "auth",
    "configure-docker",
    registry,
    "--quiet",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Registry login failed:\n${result.stderr}`);
  }
  console.log(green(`  ✅ Authenticated to ${registry} (project: ${project})`));
}

/** List GCP Artifact Registry repositories in a project */
export async function listRegistriesGcp(project: string): Promise<void> {
  console.log(yellow(`  📋 Listing repositories in project ${project}...`));
  const result = await runCommand("gcloud", [
    "artifacts",
    "repositories",
    "list",
    "--project",
    project,
    "--format=table(name,format,location)",
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to list repositories: ${result.stderr}`);
  }
}

/** Authenticate gcloud interactively */
export async function loginGcp(): Promise<CommandResult> {
  return runCommand("gcloud", ["auth", "login"]);
}
