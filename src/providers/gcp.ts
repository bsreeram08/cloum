import type {
  GcpCluster,
  CommandResult,
  ProviderStatus,
} from "../config/types.ts";
import { runCommand, runCommandSilent } from "../utils/shell.ts";
import { green, yellow, blue, red, cyan, gray } from "../utils/colors.ts";

/** Switch active gcloud account if needed, triggering login if token is missing */
async function ensureAccount(account: string): Promise<void> {
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
    // Check if the token is still valid; if not, trigger interactive login
    const token = await runCommandSilent("gcloud", [
      "auth",
      "print-access-token",
    ]);
    if (token.exitCode !== 0) {
      console.log(
        yellow(
          `  🔐 Token expired — launching gcloud auth login for ${account}...`,
        ),
      );
      await runCommand("gcloud", ["auth", "login", "--account", account]);
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

  if (cluster.account) {
    await ensureAccount(cluster.account);
  }

  console.log(yellow(`  🏗️  Setting GCP project...`));
  const projSet = await runCommandSilent("gcloud", [
    "config",
    "set",
    "project",
    cluster.project,
  ]);
  if (projSet.exitCode !== 0) {
    throw new Error(`Failed to set project: ${projSet.stderr}`);
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
