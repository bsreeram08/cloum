import { getFavorites } from "../config/loader.ts";
import { connectCommand } from "./connect.ts";
import { red, cyan, yellow } from "../utils/colors.ts";

/**
 * Quick-connect to a favourite cluster by its 1-based position in the
 * favourites list.
 *
 * Usage:  cloum quick <number>   or the shorthand   cloum <number>
 */
export async function quickCommand(
  indexStr: string,
  namespace?: string,
): Promise<void> {
  const index = parseInt(indexStr, 10);

  if (isNaN(index) || index < 1) {
    throw new Error(
      `Invalid quick-connect index "${indexStr}". ` +
        `Use a positive number, e.g.: ${cyan("cloum quick 1")}`,
    );
  }

  const favorites = await getFavorites();

  if (favorites.length === 0) {
    console.log(red("\n  No favourites configured."));
    console.log(`  Mark a cluster as a favourite with: ${cyan("cloum favorite add <name>")}\n`);
    process.exit(1);
  }

  if (index > favorites.length) {
    throw new Error(
      `Favourite #${index} not found. You have ${favorites.length} favourite(s).\n` +
        `  Run ${cyan("cloum favorite list")} to see them.`,
    );
  }

  const cluster = favorites[index - 1]!;
  console.log(
    yellow(`\n  ⚡ Quick connect #${index} → ${cyan(cluster.name)} (${cluster.provider} / ${cluster.region})`),
  );
  await connectCommand(cluster.name, namespace);
}
