import type { Provider } from "../config/types.ts";
import { discoverGcp } from "../providers/gcp.ts";
import { discoverAws } from "../providers/aws.ts";
import { discoverAzure } from "../providers/azure.ts";

export interface DiscoverOptions {
  readonly project?: string; // GCP project
  readonly region?: string; // AWS region
  readonly profile?: string; // AWS profile
  readonly resourceGroup?: string; // Azure resource group
}

/**
 * Discover clusters from a cloud provider and print them.
 * Results can be used to manually populate the config file.
 */
export async function discoverCommand(
  provider: Provider,
  opts: DiscoverOptions,
): Promise<void> {
  console.log(`\nDiscovering ${provider.toUpperCase()} clusters...\n`);
  switch (provider) {
    case "gcp":
      await discoverGcp(opts.project);
      break;
    case "aws":
      await discoverAws(opts.region, opts.profile);
      break;
    case "azure":
      await discoverAzure(opts.resourceGroup);
      break;
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
  console.log(
    `\nUse "cloum add <provider> ..." to add discovered clusters to your config.`,
  );
}
