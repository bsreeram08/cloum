import { createInterface } from "readline";
import { findCluster, loadClusters } from "../config/loader.ts";
import { connectGcp } from "../providers/gcp.ts";
import { connectAws } from "../providers/aws.ts";
import { connectAzure } from "../providers/azure.ts";
import { runCommandSilent } from "../utils/shell.ts";
import { blue, green, cyan, yellow, gray } from "../utils/colors.ts";
import type { ClusterConfig } from "../config/types.ts";

const PROVIDER_ICON: Record<string, string> = {
  gcp: "🔵 GCP/GKE",
  aws: "🟠 AWS/EKS",
  azure: "🔵 Azure/AKS",
};

/** Prompt the user to pick a cluster interactively when no name is given */
async function pickCluster(clusters: ClusterConfig[]): Promise<ClusterConfig> {
  const PROVIDER_LABELS: Record<string, string> = {
    gcp: "GCP (GKE)",
    aws: "AWS (EKS)",
    azure: "Azure (AKS)",
  };

  console.log(cyan(`\n📋 Available clusters:\n`));
  console.log(
    gray(
      `  ${"#".padEnd(4)} ${"NAME".padEnd(24)} ${"PROVIDER".padEnd(14)} REGION`,
    ),
  );
  console.log(gray(`  ${"─".repeat(60)}`));
  clusters.forEach((c, i) => {
    const label = PROVIDER_LABELS[c.provider] ?? c.provider;
    console.log(
      `  ${String(i + 1).padEnd(4)} ${c.name.padEnd(24)} ${label.padEnd(14)} ${c.region}`,
    );
  });
  console.log("");

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question(
      yellow(`  Enter number or cluster name: `),
      (answer) => {
        rl.close();
        const trimmed = answer.trim();
        // Try numeric selection first
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= clusters.length) {
          resolve(clusters[num - 1]!);
          return;
        }
        // Try name match
        const match = clusters.find((c) => c.name === trimmed);
        if (match) {
          resolve(match);
          return;
        }
        reject(
          new Error(
            `Invalid selection "${trimmed}". Enter a number (1–${clusters.length}) or exact cluster name.`,
          ),
        );
      },
    );
  });
}

/** Set the active kubectl namespace for the current context */
async function setNamespace(namespace: string): Promise<void> {
  console.log(yellow(`  🗂️  Setting namespace → ${namespace}...`));
  const result = await runCommandSilent("kubectl", [
    "config",
    "set-context",
    "--current",
    `--namespace=${namespace}`,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to set namespace: ${result.stderr}`);
  }
  console.log(green(`  ✅ Namespace set to "${namespace}"`));
}

/**
 * Connect to a named cluster by fetching credentials into kubeconfig.
 * If name is omitted, displays an interactive cluster picker.
 * Routes to the appropriate cloud provider based on cluster type.
 * Optionally sets the kubectl namespace via --namespace.
 */
export async function connectCommand(
  name?: string,
  namespace?: string,
): Promise<void> {
  let cluster: ClusterConfig;

  if (!name) {
    const clusters = await loadClusters();
    if (clusters.length === 0) {
      throw new Error(
        "No clusters configured. Add one with: cloum add <provider> --help",
      );
    }
    cluster = await pickCluster(clusters);
  } else {
    cluster = await findCluster(name);
  }

  const icon =
    PROVIDER_ICON[cluster.provider] ?? cluster.provider.toUpperCase();
  console.log(blue(`\n🔄 Connecting to ${icon} cluster: ${cluster.name}\n`));
  switch (cluster.provider) {
    case "gcp":
      await connectGcp(cluster);
      break;
    case "aws":
      await connectAws(cluster);
      break;
    case "azure":
      await connectAzure(cluster);
      break;
  }

  if (namespace) {
    await setNamespace(namespace);
  }

  console.log(
    green(`\n✅ Successfully connected to cluster "${cluster.name}"`),
  );
  console.log(cyan(`   Run: kubectl get nodes`));
}
