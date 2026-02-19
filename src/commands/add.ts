import type {
  Provider,
  ClusterConfig,
  GcpCluster,
  AwsCluster,
  AzureCluster,
} from "../config/types.ts";
import { loadClusters, saveClusters } from "../config/loader.ts";

export interface AddOptions {
  readonly name: string;
  readonly region: string;
  readonly clusterName: string;
  // GCP
  readonly project?: string;
  readonly account?: string;
  // AWS
  readonly profile?: string;
  readonly roleArn?: string;
  // Azure
  readonly resourceGroup?: string;
  readonly subscription?: string;
}

/** Validate that required options are present, throwing with a clear message */
function requireOption(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`--${flag} is required for this provider`);
  return value;
}

/** Build a typed cluster config from CLI options */
function buildCluster(provider: Provider, opts: AddOptions): ClusterConfig {
  switch (provider) {
    case "gcp": {
      const cluster: GcpCluster = {
        name: opts.name,
        provider: "gcp",
        region: opts.region,
        clusterName: opts.clusterName,
        project: requireOption(opts.project, "project"),
        ...(opts.account && { account: opts.account }),
      };
      return cluster;
    }
    case "aws": {
      const cluster: AwsCluster = {
        name: opts.name,
        provider: "aws",
        region: opts.region,
        clusterName: opts.clusterName,
        ...(opts.profile && { profile: opts.profile }),
        ...(opts.roleArn && { roleArn: opts.roleArn }),
      };
      return cluster;
    }
    case "azure": {
      const cluster: AzureCluster = {
        name: opts.name,
        provider: "azure",
        region: opts.region,
        clusterName: opts.clusterName,
        resourceGroup: requireOption(opts.resourceGroup, "resource-group"),
        ...(opts.subscription && { subscription: opts.subscription }),
      };
      return cluster;
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Add a new cluster definition to the config file.
 * Fails if a cluster with the same name already exists.
 */
export async function addCommand(
  provider: Provider,
  opts: AddOptions,
): Promise<void> {
  const clusters = await loadClusters();
  if (clusters.some((c) => c.name === opts.name)) {
    throw new Error(
      `Cluster "${opts.name}" already exists. Remove it first or choose a different name.`,
    );
  }
  const newCluster = buildCluster(provider, opts);
  await saveClusters([...clusters, newCluster]);
  console.log(`\n✓ Added cluster "${opts.name}" (${provider}) to config.`);
  console.log(`  Connect with: cloum connect ${opts.name}`);
}
