import type { Provider } from "../config/types.ts";
import { registryGcp, listRegistriesGcp } from "../providers/gcp.ts";
import { registryAws } from "../providers/aws.ts";
import { registryAzure, listRegistriesAzure } from "../providers/azure.ts";
import {
  green,
  yellow,
  blue,
  orange,
  cyan,
  red,
  gray,
} from "../utils/colors.ts";

export interface RegistryOptions {
  readonly region?: string;
  readonly project?: string; // GCP project
  readonly profile?: string; // AWS profile
  readonly registry?: string; // Azure ACR registry name
  readonly all?: boolean; // Login to all providers at once
}

/** Login to GCP Artifact Registry */
async function loginGcp(opts: RegistryOptions): Promise<boolean> {
  console.log(blue(`\n  🔵 GCP Artifact Registry`));
  if (!opts.region || !opts.project) {
    console.log(yellow(`     ⚠️  Skipped — requires --region and --project`));
    return false;
  }
  try {
    await registryGcp(opts.region, opts.project);
    return true;
  } catch (err) {
    console.log(
      red(
        `     ❌ Failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return false;
  }
}

/** Login to AWS ECR */
async function loginAws(opts: RegistryOptions): Promise<boolean> {
  console.log(orange(`\n  🟠 AWS ECR`));
  if (!opts.region) {
    console.log(yellow(`     ⚠️  Skipped — requires --region`));
    return false;
  }
  try {
    await registryAws(opts.region, opts.profile);
    return true;
  } catch (err) {
    console.log(
      red(
        `     ❌ Failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return false;
  }
}

/** Login to Azure ACR */
async function loginAzure(opts: RegistryOptions): Promise<boolean> {
  console.log(blue(`\n  🔵 Azure ACR`));
  if (!opts.registry) {
    // No registry specified — list available ones instead
    try {
      await listRegistriesAzure();
      console.log(
        gray(`     Use --registry <name> to login to a specific registry.`),
      );
    } catch {
      console.log(
        yellow(`     ⚠️  Could not list registries (az not authenticated?)`),
      );
    }
    return false;
  }
  try {
    await registryAzure(opts.registry);
    return true;
  } catch (err) {
    console.log(
      red(
        `     ❌ Failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return false;
  }
}

/**
 * Login to container registry for a provider, or all providers at once.
 * When called with no specific target (e.g. no --registry for azure), lists available repos.
 */
export async function registryCommand(
  provider: Provider | "all",
  opts: RegistryOptions,
): Promise<void> {
  console.log(cyan(`\n🐳 Container Registry Login\n`));

  if (provider === "all" || opts.all) {
    console.log(yellow(`  Logging into all cloud registries...\n`));
    const [gcpOk, awsOk, azureOk] = await Promise.all([
      loginGcp(opts),
      loginAws(opts),
      loginAzure(opts),
    ]);
    const count = [gcpOk, awsOk, azureOk].filter(Boolean).length;
    console.log(
      count === 3
        ? green(`\n  🎉 All 3 registries authenticated successfully!`)
        : yellow(
            `\n  ⚠️  ${count}/3 registries authenticated. Check output above for details.`,
          ),
    );
    return;
  }

  switch (provider) {
    case "gcp": {
      if (!opts.project) {
        // No project — list repos in current project
        const { runCommandSilent } = await import("../utils/shell.ts");
        const proj = await runCommandSilent("gcloud", [
          "config",
          "get-value",
          "project",
        ]);
        if (proj.exitCode === 0 && proj.stdout.trim()) {
          await listRegistriesGcp(proj.stdout.trim());
          console.log(
            gray(`\n  Use --project <id> --region <region> to login.`),
          );
        } else {
          throw new Error(
            "--project and --region are required for GCP registry login",
          );
        }
        return;
      }
      if (!opts.region)
        throw new Error("--region is required for GCP registry login");
      await registryGcp(opts.region, opts.project);
      break;
    }
    case "aws": {
      if (!opts.region)
        throw new Error("--region is required for AWS registry login");
      await registryAws(opts.region, opts.profile);
      break;
    }
    case "azure": {
      await loginAzure(opts);
      break;
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}
