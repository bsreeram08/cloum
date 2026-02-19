import { findCluster } from "../config/loader.ts";
import { connectGcp } from "../providers/gcp.ts";
import { connectAws } from "../providers/aws.ts";
import { connectAzure } from "../providers/azure.ts";
import { blue, green, cyan } from "../utils/colors.ts";

const PROVIDER_ICON: Record<string, string> = {
  gcp: "🔵 GCP/GKE",
  aws: "🟠 AWS/EKS",
  azure: "🔵 Azure/AKS",
};

/**
 * Connect to a named cluster by fetching credentials into kubeconfig.
 * Routes to the appropriate cloud provider based on cluster type.
 */
export async function connectCommand(name: string): Promise<void> {
  const cluster = await findCluster(name);
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
  console.log(
    green(`\n✅ Successfully connected to cluster "${cluster.name}"`),
  );
  console.log(cyan(`   Run: kubectl get nodes`));
}
