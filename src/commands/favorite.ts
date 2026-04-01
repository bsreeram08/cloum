import { loadClusters, saveClusters, getFavorites } from "../config/loader.ts";
import { green, yellow, cyan, gray } from "../utils/colors.ts";

/**
 * Mark a cluster as a favourite.  Re-marking an already-favourite cluster is
 * a no-op (prints a gentle notice instead of erroring).
 */
export async function favoriteAddCommand(name: string): Promise<void> {
  const clusters = await loadClusters();
  const idx = clusters.findIndex((c) => c.name === name);
  if (idx === -1) {
    const names = clusters.map((c) => c.name).join(", ") || "(none configured)";
    throw new Error(`Cluster "${name}" not found. Available: ${names}`);
  }
  if (clusters[idx]!.favorite === true) {
    console.log(yellow(`  ⭐ "${name}" is already a favourite.`));
    return;
  }
  const updated = clusters.map((c, i) => (i === idx ? { ...c, favorite: true } : c));
  await saveClusters(updated);
  const rank = updated.filter((c) => c.favorite === true).length;
  console.log(green(`\n  ⭐ Added "${name}" to favourites (quick-connect: cloum quick ${rank})`));
}

/**
 * Remove a cluster from favourites.  Removing a cluster that isn't a
 * favourite is a no-op.
 */
export async function favoriteRemoveCommand(name: string): Promise<void> {
  const clusters = await loadClusters();
  const idx = clusters.findIndex((c) => c.name === name);
  if (idx === -1) {
    const names = clusters.map((c) => c.name).join(", ") || "(none configured)";
    throw new Error(`Cluster "${name}" not found. Available: ${names}`);
  }
  if (!clusters[idx]!.favorite) {
    console.log(yellow(`  "${name}" is not in your favourites.`));
    return;
  }
  const updated = clusters.map((c, i) =>
    i === idx ? { ...c, favorite: false } : c,
  );
  await saveClusters(updated);
  console.log(yellow(`\n  Removed "${name}" from favourites.`));
}

/** List all clusters that have been marked as favourites */
export async function favoriteListCommand(): Promise<void> {
  const favorites = await getFavorites();
  if (favorites.length === 0) {
    console.log(yellow("\n  No favourites configured."));
    console.log(`  Add one with: ${cyan("cloum favorite add <name>")}\n`);
    return;
  }
  console.log(cyan("\n  ⭐ Favourites (quick-connect shortcuts):\n"));
  console.log(
    gray(`  ${"#".padEnd(4)} ${"NAME".padEnd(24)} ${"PROVIDER".padEnd(10)} REGION`),
  );
  console.log(gray(`  ${"─".repeat(56)}`));
  favorites.forEach((c, i) => {
    console.log(
      `  ${String(i + 1).padEnd(4)} ${c.name.padEnd(24)} ${c.provider.padEnd(10)} ${c.region}`,
    );
  });
  console.log(
    gray(`\n  Use ${cyan("cloum quick <number>")} or just ${cyan("cloum <number>")} to connect instantly.\n`),
  );
}
