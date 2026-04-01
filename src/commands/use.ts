import { findCluster } from "../config/loader.ts";
import { runCommandSilent } from "../utils/shell.ts";
import { green, yellow, cyan, gray } from "../utils/colors.ts";
import type { ClusterConfig } from "../config/types.ts";

/**
 * Derive the canonical kubectl context name for a cluster config.
 * GCP:   gke_<project>_<region>_<clusterName>
 * AWS:   arn:aws:eks:<region>:<accountId>:cluster/<clusterName>  (account unknown here)
 * Azure: <clusterName>
 */
function canonicalContextName(cluster: ClusterConfig): string | undefined {
  switch (cluster.provider) {
    case "gcp":
      return `gke_${cluster.project}_${cluster.region}_${cluster.clusterName}`;
    case "azure":
      return cluster.clusterName;
    case "aws":
      // Account ID is not stored in config, so we cannot build the full ARN.
      // Return undefined and rely on substring matching instead.
      return undefined;
  }
}

/**
 * Switch the kubectl current-context to the context for an already-connected
 * cluster without re-fetching credentials from the cloud provider.
 * Tries an exact match first, then a substring match on the cloud cluster name.
 */
export async function useCommand(name: string, namespace?: string): Promise<void> {
  const cluster = await findCluster(name);

  // List all contexts known to kubectl
  const contextsResult = await runCommandSilent("kubectl", [
    "config",
    "get-contexts",
    "--output=name",
  ]);

  if (contextsResult.exitCode !== 0) {
    throw new Error(
      "Failed to list kubectl contexts. Is kubectl installed and configured?",
    );
  }

  const contexts = contextsResult.stdout.trim().split("\n").filter(Boolean);

  if (contexts.length === 0) {
    throw new Error(
      `No kubectl contexts found.\n` +
        `Run 'cloum connect ${name}' first to fetch credentials.`,
    );
  }

  // 1. Try exact canonical name
  const canonical = canonicalContextName(cluster);
  if (canonical) {
    const exact = contexts.find((ctx) => ctx === canonical);
    if (exact) {
      await switchContext(exact, name);
      return;
    }
  }

  // 2. Exact match on the cloum alias itself (user may have renamed it manually)
  const aliasDirect = contexts.find((ctx) => ctx === name);
  if (aliasDirect) {
    await switchContext(aliasDirect, name);
    return;
  }

  // 3. Substring match on the cloud cluster name
  const matches = contexts.filter((ctx) =>
    ctx.includes(cluster.clusterName),
  );

  if (matches.length === 0) {
    throw new Error(
      `No kubectl context found for cluster "${name}" (cloud name: "${cluster.clusterName}").\n` +
        `Run 'cloum connect ${name}' first to fetch credentials.`,
    );
  }

  if (matches.length === 1) {
    const ctx = matches[0];
    if (!ctx) throw new Error("Unexpected empty match");
    await switchContext(ctx, name);
    return;
  }

  // 4. Multiple substring matches — use the first one and show the others
  console.log(
    yellow(
      `  ⚠️  Multiple contexts match "${cluster.clusterName}" — using the first:`,
    ),
  );
  matches.forEach((ctx, i) =>
    console.log(gray(`    ${i + 1}. ${ctx}`)),
  );
  const first = matches[0];
  if (!first) throw new Error("Unexpected empty match list");
  await switchContext(first, name);
}

async function switchContext(
  contextName: string,
  clusterAlias: string,
): Promise<void> {
  const result = await runCommandSilent("kubectl", [
    "config",
    "use-context",
    contextName,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(`Failed to switch context: ${result.stderr.trim()}`);
  }

  console.log(green(`\n✅ Switched to context: ${contextName}`));
  console.log(cyan(`   Cluster alias : ${clusterAlias}`));
  console.log(cyan(`   Run           : kubectl get nodes`));
}
