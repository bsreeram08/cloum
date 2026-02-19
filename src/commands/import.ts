import type {
  ClusterConfig,
  GcpCluster,
  AwsCluster,
  AzureCluster,
  Provider,
} from "../config/types.ts";
import { loadClusters, saveClusters, getConfigPath } from "../config/loader.ts";

/** Validate a cluster config entry */
function validateCluster(
  entry: Record<string, unknown>,
  index: number,
): ClusterConfig {
  const name = entry.name;
  const provider = entry.provider;
  const region = entry.region;
  const clusterName = entry.clusterName;

  if (!name || typeof name !== "string") {
    throw new Error(`Cluster at index ${index}: missing or invalid "name"`);
  }
  if (!provider || typeof provider !== "string" || !["gcp", "aws", "azure"].includes(provider)) {
    throw new Error(
      `Cluster "${name}": missing or invalid "provider" (must be gcp, aws, or azure)`,
    );
  }
  if (!region || typeof region !== "string") {
    throw new Error(`Cluster "${name}": missing or invalid "region"`);
  }
  if (!clusterName || typeof clusterName !== "string") {
    throw new Error(`Cluster "${name}": missing or invalid "clusterName"`);
  }

  const providerStr = provider as Provider;

  switch (providerStr) {
    case "gcp": {
      const project = entry.project;
      if (!project || typeof project !== "string") {
        throw new Error(
          `Cluster "${name}": missing "project" for GCP cluster`,
        );
      }
      const cluster: GcpCluster = {
        name,
        provider: "gcp",
        region,
        clusterName,
        project,
      };
      if (entry.account && typeof entry.account === "string") {
        return { ...cluster, account: entry.account };
      }
      return cluster;
    }
    case "aws": {
      const cluster: AwsCluster = {
        name,
        provider: "aws",
        region,
        clusterName,
      };
      if (entry.profile && typeof entry.profile === "string") {
        return { ...cluster, profile: entry.profile };
      }
      if (entry.roleArn && typeof entry.roleArn === "string") {
        return { ...cluster, roleArn: entry.roleArn };
      }
      return cluster;
    }
    case "azure": {
      const resourceGroup = entry.resourceGroup;
      if (!resourceGroup || typeof resourceGroup !== "string") {
        throw new Error(
          `Cluster "${name}": missing "resourceGroup" for Azure cluster`,
        );
      }
      const cluster: AzureCluster = {
        name,
        provider: "azure",
        region,
        clusterName,
        resourceGroup,
      };
      if (entry.subscription && typeof entry.subscription === "string") {
        return { ...cluster, subscription: entry.subscription };
      }
      return cluster;
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Import clusters from a JSON file.
 * Merges with existing clusters (skipping duplicates by name).
 */
export async function importCommand(filePath: string): Promise<void> {
  // Check if file exists using Bun's file API
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`File not found: ${filePath}`);
  }

  // Read and parse the JSON
  const content = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error(`Invalid JSON in file: ${filePath}`);
  }

  // Validate structure
  if (!data || typeof data !== "object") {
    throw new Error(`Invalid format: expected JSON object with "clusters" array`);
  }

  const obj = data as Record<string, unknown>;
  const entries = obj.clusters;
  if (!Array.isArray(entries)) {
    throw new Error(`Invalid format: expected "clusters" array in JSON`);
  }

  // Validate and convert each entry
  const newClusters: ClusterConfig[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== "object") {
      throw new Error(`Invalid cluster at index ${i}: expected object`);
    }
    const validated = validateCluster(entry as Record<string, unknown>, i);
    newClusters.push(validated);
  }

  // Load existing clusters
  const existingClusters = await loadClusters();
  const existingNames = new Set(existingClusters.map((c) => c.name));

  // Merge, skipping duplicates
  const toAdd: ClusterConfig[] = [];
  const skipped: string[] = [];

  for (const cluster of newClusters) {
    if (existingNames.has(cluster.name)) {
      skipped.push(cluster.name);
    } else {
      toAdd.push(cluster);
      existingNames.add(cluster.name);
    }
  }

  // Save merged list
  await saveClusters([...existingClusters, ...toAdd]);

  // Print summary
  console.log(`\n📥 Import Summary:`);
  console.log(`   Added: ${toAdd.length} cluster(s)`);
  if (skipped.length > 0) {
    console.log(`   Skipped (already exist): ${skipped.length}`);
    for (const name of skipped) {
      console.log(`      - ${name}`);
    }
  }
  console.log(`\n✅ Clusters saved to: ${getConfigPath()}`);
  console.log(`   Total configured: ${existingClusters.length + toAdd.length}`);
}
