import { loadClusters, getConfigPath } from "../config/loader.ts";
import type { ClusterConfig } from "../config/types.ts";

const PROVIDER_LABELS: Record<string, string> = {
  gcp: "GCP (GKE)",
  aws: "AWS (EKS)",
  azure: "Azure (AKS)",
};

/** Format a cluster row for table display */
function formatRow(cluster: ClusterConfig): string {
  const provider = PROVIDER_LABELS[cluster.provider] ?? cluster.provider;
  let detail = "";
  switch (cluster.provider) {
    case "gcp":
      detail = `project=${cluster.project}`;
      break;
    case "aws":
      detail = cluster.profile
        ? `profile=${cluster.profile}`
        : "default profile";
      break;
    case "azure":
      detail = `rg=${cluster.resourceGroup}`;
      break;
  }
  return `  ${cluster.name.padEnd(24)} ${provider.padEnd(16)} ${cluster.region.padEnd(20)} ${detail}`;
}

/** List all configured clusters in a formatted table */
export async function listCommand(): Promise<void> {
  const clusters = await loadClusters();
  if (clusters.length === 0) {
    console.log(`\nNo clusters configured.`);
    console.log(`Config file: ${getConfigPath()}`);
    console.log(`\nAdd a cluster with: cloum add <provider> --help`);
    return;
  }
  console.log(`\nConfigured clusters (${clusters.length}):`);
  console.log(
    `  ${"NAME".padEnd(24)} ${"PROVIDER".padEnd(16)} ${"REGION".padEnd(20)} DETAILS`,
  );
  console.log(`  ${"-".repeat(80)}`);
  for (const cluster of clusters) {
    console.log(formatRow(cluster));
  }
  console.log(`\nConfig: ${getConfigPath()}`);
}
