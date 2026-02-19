/** Supported cloud providers */
export type Provider = "gcp" | "aws" | "azure";

/** Base fields shared by all cluster definitions */
interface BaseCluster {
  readonly name: string;
  readonly provider: Provider;
  readonly region: string;
}

/** GKE cluster configuration */
export interface GcpCluster extends BaseCluster {
  readonly provider: "gcp";
  readonly project: string;
  readonly clusterName: string;
  readonly account?: string; // gcloud account to activate before connecting
}

/** EKS cluster configuration */
export interface AwsCluster extends BaseCluster {
  readonly provider: "aws";
  readonly clusterName: string;
  readonly profile?: string; // AWS_PROFILE to use
  readonly roleArn?: string; // Optional IAM role to assume
}

/** AKS cluster configuration */
export interface AzureCluster extends BaseCluster {
  readonly provider: "azure";
  readonly resourceGroup: string;
  readonly clusterName: string;
  readonly subscription?: string; // Azure subscription ID or name
}

/** Union of all cluster types */
export type ClusterConfig = GcpCluster | AwsCluster | AzureCluster;

/** Root structure of the clusters.json config file */
export interface ClustersFile {
  readonly clusters: ClusterConfig[];
}

/** Result of a shell command execution */
export interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Auth status for a single provider */
export interface ProviderStatus {
  readonly provider: Provider;
  readonly isAuthenticated: boolean;
  readonly identity?: string;
  readonly details?: string;
}
