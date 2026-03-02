import { findCluster } from "../config/loader.ts";
import { cyan, green, gray } from "../utils/colors.ts";

/** Show detailed info for a single cluster config */
export async function describeCommand(name: string): Promise<void> {
  const cluster = await findCluster(name);

  const PROVIDER_LABEL: Record<string, string> = {
    gcp: "🔵 GCP (GKE)",
    aws: "🟠 AWS (EKS)",
    azure: "🔵 Azure (AKS)",
  };

  const label =
    PROVIDER_LABEL[cluster.provider] ?? cluster.provider.toUpperCase();

  console.log(cyan(`\n📋 Cluster: ${cluster.name}\n`));
  console.log(gray(`  ${"─".repeat(40)}`));
  console.log(`  ${green("Provider")}   : ${label}`);
  console.log(`  ${green("Region")}     : ${cluster.region}`);

  switch (cluster.provider) {
    case "gcp":
      console.log(`  ${green("Project")}     : ${cluster.project}`);
      console.log(`  ${green("Cluster")}     : ${cluster.clusterName}`);
      console.log(`  ${green("Account")}     : ${cluster.account}`);
      break;
    case "aws":
      console.log(`  ${green("Cluster")}     : ${cluster.clusterName}`);
      console.log(
        `  ${green("Profile")}     : ${cluster.profile ?? "(default)"}`,
      );
      if (cluster.roleArn) {
        console.log(`  ${green("Role ARN")}    : ${cluster.roleArn}`);
      }
      break;
    case "azure":
      console.log(`  ${green("Cluster")}     : ${cluster.clusterName}`);
      console.log(`  ${green("Res. Group")}  : ${cluster.resourceGroup}`);
      if (cluster.subscription) {
        console.log(
          `  ${green("Subscription")}: ${cluster.subscription}`,
        );
      }
      break;
  }
  console.log(gray(`  ${"─".repeat(40)}`));
  console.log("");
}
