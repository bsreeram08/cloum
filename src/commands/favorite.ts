/**
 * cloum favorite — toggle cluster favorites
 *
 * Usage:
 *   cloum favorite <name>       Toggle favorite on/off for a cluster
 *   cloum favorites             List all favorites
 */

import { loadClusters, saveClusters, findCluster } from "../config/loader.ts";
import { jsonSuccess, jsonError } from "../utils/output.ts";
import { green, yellow, cyan, red } from "../utils/colors.ts";

export interface FavoriteOptions {
  readonly json: boolean;
  readonly list: boolean;
}

/** Toggle favorite status for a cluster */
export async function favoriteCommand(
  name: string | undefined,
  opts: FavoriteOptions,
): Promise<void> {
  const start = Date.now();

  if (opts.list || !name) {
    // List all favorites
    const clusters = await loadClusters();
    const favorites = clusters.filter(
      (c) => (c as { isFavorite?: boolean }).isFavorite === true,
    );

    if (opts.json) {
      console.log(jsonSuccess({
        favorites: favorites.map((c) => ({
          name: c.name,
          provider: c.provider,
          region: c.region,
        })),
        total: favorites.length,
      }, "favorites", start));
      return;
    }

    console.log(cyan(`\n★ Favorites (${favorites.length}):\n`));
    if (favorites.length === 0) {
      console.log(`  ${yellow("No favorites yet.")}`);
      console.log(`  Run: cloum favorite <name>\n`);
      return;
    }
    for (const c of favorites) {
      const icon = c.provider === "gcp" ? "🔵" : c.provider === "aws" ? "🟠" : "🔷";
      console.log(`  ${icon} ${c.name.padEnd(24)} ${c.region}`);
    }
    console.log("");
    return;
  }

  // Toggle favorite for named cluster
  const clusters = await loadClusters();
  const cluster = clusters.find((c) => c.name === name);

  if (!cluster) {
    if (opts.json) {
      console.log(jsonError("NOT_FOUND", `Cluster "${name}" not found`, "favorite", start));
      return;
    }
    console.error(red(`\n  ❌ Cluster "${name}" not found.\n`));
    return;
  }

  const current = (cluster as { isFavorite?: boolean }).isFavorite ?? false;
  const updated = clusters.map((c) =>
    c.name === name
      ? { ...c, isFavorite: !current } as typeof c
      : c,
  );
  await saveClusters(updated);

  if (opts.json) {
    console.log(jsonSuccess({
      name,
      isFavorite: !current,
      action: !current ? "added" : "removed",
    }, "favorite", start));
    return;
  }

  if (!current) {
    console.log(green(`\n  ★ Added "${name}" to favorites.\n`));
  } else {
    console.log(yellow(`\n  ☆ Removed "${name}" from favorites.\n`));
  }
}
