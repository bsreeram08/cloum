import { loadClusters, getConfigPath } from "../config/loader.ts";
import type { ClusterConfig, Provider } from "../config/types.ts";

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
    case "gcp": {
      const gcpCluster = cluster as { project: string; account?: string };
      detail = `project=${gcpCluster.project}`;
      if (gcpCluster.account) {
        detail += `, account=${gcpCluster.account}`;
      }
      break;
    }
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

export interface ListOptions {
  provider?: Provider;
  namesOnly?: boolean;
}

/** List all configured clusters in a formatted table */
export async function listCommand(opts: ListOptions = {}): Promise<void> {
  let clusters = await loadClusters();

  if (opts.provider) {
    clusters = clusters.filter((c) => c.provider === opts.provider);
  }

  // --names-only: plain newline-separated names (used by shell completion)
  if (opts.namesOnly) {
    for (const c of clusters) {
      console.log(c.name);
    }
    return;
  }

  if (clusters.length === 0) {
    if (opts.provider) {
      console.log(`\nNo clusters configured for provider "${opts.provider}".`);
    } else {
      console.log(`\nNo clusters configured.`);
      console.log(`Config file: ${getConfigPath()}`);
      console.log(`\nAdd a cluster with: cloum add <provider> --help`);
    }
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
