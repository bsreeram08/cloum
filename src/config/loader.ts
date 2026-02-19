import type { ClusterConfig, ClustersFile } from "./types.ts";
import { homedir } from "os";
import { join } from "path";

const CONFIG_DIR = join(homedir(), ".config", "cloum");
const CONFIG_PATH = join(CONFIG_DIR, "clusters.json");

/** Ensure the config directory and file exist, creating them if necessary */
async function ensureConfigFile(): Promise<void> {
  const dir = Bun.file(CONFIG_DIR);
  const file = Bun.file(CONFIG_PATH);
  if (!(await file.exists())) {
    await Bun.spawn(["mkdir", "-p", CONFIG_DIR]).exited;
    await Bun.write(CONFIG_PATH, JSON.stringify({ clusters: [] }, null, 2));
  }
}

/** Load all cluster definitions from the config file */
export async function loadClusters(): Promise<ClusterConfig[]> {
  await ensureConfigFile();
  const file = Bun.file(CONFIG_PATH);
  const data = (await file.json()) as ClustersFile;
  return data.clusters ?? [];
}

/** Persist the full clusters list back to the config file */
export async function saveClusters(clusters: ClusterConfig[]): Promise<void> {
  await ensureConfigFile();
  const payload: ClustersFile = { clusters };
  await Bun.write(CONFIG_PATH, JSON.stringify(payload, null, 2) + "\n");
}

/** Find a single cluster by name, throws if not found */
export async function findCluster(name: string): Promise<ClusterConfig> {
  const clusters = await loadClusters();
  const match = clusters.find((c) => c.name === name);
  if (!match) {
    const names = clusters.map((c) => c.name).join(", ") || "(none configured)";
    throw new Error(`Cluster "${name}" not found. Available: ${names}`);
  }
  return match;
}

/** Return the resolved config file path for display purposes */
export function getConfigPath(): string {
  return CONFIG_PATH;
}
