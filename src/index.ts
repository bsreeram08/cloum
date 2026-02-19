#!/usr/bin/env bun
import { green, yellow, red, cyan } from "./utils/colors.ts";
import { connectCommand } from "./commands/connect.ts";
import { listCommand } from "./commands/list.ts";
import { statusCommand } from "./commands/status.ts";
import { discoverCommand } from "./commands/discover.ts";
import { registryCommand } from "./commands/registry.ts";
import { addCommand } from "./commands/add.ts";
import { cleanCommand } from "./commands/clean.ts";
import { removeCommand } from "./commands/remove.ts";
import { aiCommand } from "./commands/ai.ts";
import { importCommand } from "./commands/import.ts";
import { updateCommand } from "./commands/update.ts";
import { VERSION } from "./commands/version.ts";
import type { Provider } from "./config/types.ts";

const VALID_PROVIDERS: Provider[] = ["gcp", "aws", "azure"];

const HELP = `
cloum — Cloud Manager CLI v${VERSION}

Usage:
  cloum connect <name>                     Connect to a configured cluster
  cloum list                               List all configured clusters
  cloum status                             Show cloud provider auth status
  cloum add <provider> [options]           Add a cluster to config
  cloum remove <name>                      Remove a cluster from config
  cloum import <file.json>                 Import multiple clusters from JSON file
  cloum discover <provider> [options]      Discover clusters from cloud
  cloum registry <provider> [options]      Login to container registry
  cloum clean [gcp|aws|azure] [--all]       Clear cached sessions (provider or all)
  cloum ai [--open]                        Print AI setup prompt (--open launches Claude)
  cloum update [--force]                   Check and install latest version
  cloum uninstall                          Uninstall cloum CLI
  cloum --version                          Show version
  cloum help                               Show this help message

Providers: gcp | aws | azure

cloum add options:
  --name <name>             Cluster alias (required)
  --cluster-name <name>     Cloud cluster name (required)
  --region <region>         Cloud region (required)
  --project <id>            GCP project ID (gcp only)
  --account <email>         gcloud account to activate (gcp only)
  --profile <name>          AWS profile name (aws only)
  --role-arn <arn>          IAM role ARN to assume (aws only)
  --resource-group <rg>     Azure resource group (azure only)
  --subscription <id>       Azure subscription (azure only)

cloum discover options:
  --project <id>            GCP project (gcp)
  --region <region>         AWS region (aws)
  --profile <name>          AWS profile (aws)
  --resource-group <rg>     Azure resource group (azure)

cloum registry options:
  --region <region>         Cloud region (gcp, aws)
  --project <id>            GCP project (gcp)
  --profile <name>          AWS profile (aws)
  --registry <name>         ACR registry name (azure)

Examples:
  cloum add gcp --name prod-gke --cluster-name my-cluster --region us-central1 --project my-project
  cloum add aws --name staging-eks --cluster-name staging --region us-east-1 --profile staging
  cloum add azure --name dev-aks --cluster-name dev --region eastus --resource-group dev-rg
  cloum connect prod-gke
  cloum remove prod-gke
  cloum discover gcp --project my-project
  cloum registry aws --region us-east-1 --profile prod
  cloum registry all --region us-east-1 --project my-proj --registry myacr
  cloum clean --all
  cloum clean gcp
  cloum ai --open
`;

/** Parse --flag value pairs from argv into a flat record */
function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    }
  }
  return flags;
}

/** Validate that a string is a known provider, throw otherwise */
function parseProvider(raw: string | undefined): Provider {
  if (!raw || !VALID_PROVIDERS.includes(raw as Provider)) {
    throw new Error(
      `Invalid provider "${raw ?? ""}". Must be one of: ${VALID_PROVIDERS.join(", ")}`,
    );
  }
  return raw as Provider;
}

/** Resolve a flag value as a string, returning undefined if absent or boolean */
function flagStr(
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  // Show help when invoked with no arguments
  if (!command) {
    console.log(HELP);
    process.exit(0);
  }

  try {
    switch (command) {
      case "help":
      case "--help":
      case "-h": {
        console.log(HELP);
        break;
      }

      case "connect": {
        const name = rest[0];
        if (!name) throw new Error("Usage: cloum connect <name>");
        await connectCommand(name);
        break;
      }

      case "list": {
        await listCommand();
        break;
      }

      case "status": {
        await statusCommand();
        break;
      }

      case "add": {
        const provider = parseProvider(rest[0]);
        const flags = parseFlags(rest.slice(1));
        await addCommand(provider, {
          name:
            flagStr(flags, "name") ??
            (() => {
              throw new Error("--name is required");
            })(),
          region:
            flagStr(flags, "region") ??
            (() => {
              throw new Error("--region is required");
            })(),
          clusterName:
            flagStr(flags, "cluster-name") ??
            (() => {
              throw new Error("--cluster-name is required");
            })(),
          project: flagStr(flags, "project"),
          account: flagStr(flags, "account"),
          profile: flagStr(flags, "profile"),
          roleArn: flagStr(flags, "role-arn"),
          resourceGroup: flagStr(flags, "resource-group"),
          subscription: flagStr(flags, "subscription"),
        });
        break;
      }

      case "discover": {
        const provider = parseProvider(rest[0]);
        const flags = parseFlags(rest.slice(1));
        await discoverCommand(provider, {
          project: flagStr(flags, "project"),
          region: flagStr(flags, "region"),
          profile: flagStr(flags, "profile"),
          resourceGroup: flagStr(flags, "resource-group"),
        });
        break;
      }

      case "registry": {
        const rawProvider = rest[0];
        const flags = parseFlags(rest.slice(1));
        // "all" is a special value — login to every provider at once
        const provider =
          rawProvider === "all" ? "all" : parseProvider(rawProvider);
        await registryCommand(provider, {
          region: flagStr(flags, "region"),
          project: flagStr(flags, "project"),
          profile: flagStr(flags, "profile"),
          registry: flagStr(flags, "registry"),
          all: flags["all"] === true,
        });
        break;
      }

      case "clean": {
        // Supports: clean | clean --all | clean gcp | clean aws | clean azure
        const rawProvider = rest[0];
        const flags = parseFlags(rest);
        const isProvider =
          rawProvider && VALID_PROVIDERS.includes(rawProvider as Provider);
        await cleanCommand({
          all: flags["all"] === true,
          provider: isProvider ? (rawProvider as Provider) : undefined,
        });
        break;
      }

      case "remove": {
        const name = rest[0];
        if (!name) throw new Error("Usage: cloum remove <name>");
        await removeCommand(name);
        break;
      }

      case "ai": {
        const flags = parseFlags(rest);
        await aiCommand({ open: flags["open"] === true });
        break;
      }

      case "import": {
        const filePath = rest[0];
        if (!filePath) throw new Error("Usage: cloum import <file.json>");
        await importCommand(filePath);
        break;
      }

      case "update": {
        const flags = parseFlags(rest);
        await updateCommand(flags["force"] === true);
        break;
      }

      case "uninstall": {
        const { REPO } = await import("./commands/version.ts");
        console.log(yellow(`\n🗑️  Uninstalling cloum...`));
        
        const proc = Bun.spawn(
          [
            "bash",
            "-c",
            `curl -sL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- uninstall`,
          ],
          {
            stdout: "inherit",
            stderr: "inherit",
          },
        );
        await proc.exited;
        
        if (proc.exitCode === 0) {
          console.log(green(`\n✅ Uninstall complete!`));
        } else {
          console.log(red(`\n❌ Uninstall failed with code ${proc.exitCode}`));
        }
        break;
      }

      case "version":
      case "--version":
      case "-v": {
        console.log(`cloum v${VERSION}`);
        break;
      }

      default:
        console.error(`Unknown command: "${command}"\n`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${message}\n`);
    process.exit(1);
  }
}

main();
