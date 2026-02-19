import { loadClusters, saveClusters } from "../config/loader.ts";

/**
 * Remove a cluster definition from the config file by name.
 * Throws if the cluster does not exist.
 */
export async function removeCommand(name: string): Promise<void> {
  const clusters = await loadClusters();
  const index = clusters.findIndex((c) => c.name === name);
  if (index === -1) {
    const names = clusters.map((c) => c.name).join(", ") || "(none configured)";
    throw new Error(`Cluster "${name}" not found. Available: ${names}`);
  }
  const updated = clusters.filter((c) => c.name !== name);
  await saveClusters(updated);
  console.log(`\n✓ Removed cluster "${name}" from config.`);
}
