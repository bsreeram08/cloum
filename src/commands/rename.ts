import { loadClusters, saveClusters } from "../config/loader.ts";
import { green } from "../utils/colors.ts";

/** Rename a cluster alias in the config file */
export async function renameCommand(
  oldName: string,
  newName: string,
): Promise<void> {
  const clusters = await loadClusters();

  const idx = clusters.findIndex((c) => c.name === oldName);
  if (idx === -1) {
    const names = clusters.map((c) => c.name).join(", ") || "(none configured)";
    throw new Error(
      `Cluster "${oldName}" not found. Available: ${names}`,
    );
  }

  if (clusters.some((c) => c.name === newName)) {
    throw new Error(
      `Cluster "${newName}" already exists. Choose a different name.`,
    );
  }

  const updated = clusters.map((c, i) =>
    i === idx ? { ...c, name: newName } : c,
  );
  await saveClusters(updated);
  console.log(green(`\n✅ Renamed cluster "${oldName}" → "${newName}"`));
}
