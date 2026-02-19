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
  --project <id>            GCP project ID (gcp only, required)
  --account <email>         gcloud account to activate (gcp only, required)
  --profile <name>          AWS profile name (aws only)
  --role-arn <arn>          IAM role ARN to assume (aws only)
  --resource-group <rg>     Azure resource group (azure only, required)
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
  cloum add gcp --name prod-gke --cluster-name my-cluster --region us-central1 --project my-project --account user@example.com
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

// Subcommand help messages
const ADD_HELP = `
cloum add — Add a cluster to configuration

Usage:
  cloum add <provider> [options]

Providers: gcp | aws | azure

Options:
  --name <name>             Cluster alias (required)
  --cluster-name <name>     Cloud cluster name (required)
  --region <region>         Cloud region (required)
  --project <id>            GCP project ID (gcp only, required)
  --account <email>         gcloud account to activate (gcp only, required)
  --profile <name>          AWS profile name (aws only)
  --role-arn <arn>          IAM role ARN to assume (aws only)
  --resource-group <rg>     Azure resource group (azure only, required)
  --subscription <id>       Azure subscription (azure only)

Examples:
  cloum add gcp --name prod-gke --cluster-name my-cluster --region us-central1 --project my-project --account user@example.com
  cloum add aws --name staging-eks --cluster-name staging --region us-east-1 --profile staging
  cloum add azure --name dev-aks --cluster-name dev --region eastus --resource-group dev-rg
`;

const DISCOVER_HELP = `
cloum discover — Discover clusters from cloud providers

Usage:
  cloum discover <provider> [options]

Providers: gcp | aws | azure

Options:
  --project <id>            GCP project (gcp only)
  --region <region>         AWS region (aws only)
  --profile <name>          AWS profile (aws only)
  --resource-group <rg>     Azure resource group (azure only)

Examples:
  cloum discover gcp --project my-project
  cloum discover aws --region us-east-1
  cloum discover azure --resource-group my-rg
`;

const REGISTRY_HELP = `
cloum registry — Login to container registry

Usage:
  cloum registry <provider> [options]

Providers: gcp | aws | azure | all

Options:
  --region <region>         Cloud region (gcp, aws)
  --project <id>            GCP project (gcp)
  --profile <name>          AWS profile (aws)
  --registry <name>         ACR registry name (azure)

Examples:
  cloum registry gcp --region us-central1 --project my-project
  cloum registry aws --region us-east-1 --profile prod
  cloum registry azure --registry myregistry
  cloum registry all --region us-east-1 --project my-proj --registry myacr
`;

const CLEAN_HELP = `
cloum clean — Clear cached kubectl sessions and/or cloud credentials

Usage:
  cloum clean [provider] [options]

Providers: gcp | aws | azure

Options:
  --all                      Revoke all cloud credentials and clear contexts

Examples:
  cloum clean                # Clear kubectl contexts only
  cloum clean gcp            # Revoke GCP credentials + clear contexts
  cloum clean aws            # Logout AWS SSO + clear contexts
  cloum clean azure          # Logout Azure + clear contexts
  cloum clean --all          # Revoke all providers + clear contexts
`;

const UPDATE_HELP = `
cloum update — Check for and install latest version

Usage:
  cloum update [options]

Options:
  --force                    Force reinstall latest version

Examples:
  cloum update
  cloum update --force
`;

const CONNECT_HELP = `
cloum connect — Connect to a configured cluster

Usage:
  cloum connect <name>

Examples:
  cloum connect prod-gke
`;

const LIST_HELP = `
cloum list — List all configured clusters

Usage:
  cloum list
`;

const STATUS_HELP = `
cloum status — Show cloud provider auth status

Usage:
  cloum status
`;

const REMOVE_HELP = `
cloum remove — Remove a cluster from config

Usage:
  cloum remove <name>

Examples:
  cloum remove prod-gke
`;

const IMPORT_HELP = `
cloum import — Import multiple clusters from JSON file

Usage:
  cloum import <file.json>

Examples:
  cloum import clusters.json
`;

const AI_HELP = `
cloum ai — Print AI setup prompt

Usage:
  cloum ai [options]

Options:
  --open                      Launch Claude in browser with prompt

Examples:
  cloum ai
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
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(CONNECT_HELP);
          return;
        }
        const name = rest[0];
        if (!name) throw new Error("Usage: cloum connect <name>");
        await connectCommand(name);
        break;
      }

      case "list": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(LIST_HELP);
          return;
        }
        await listCommand();
        break;
      }

      case "status": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(STATUS_HELP);
          return;
        }
        await statusCommand();
        break;
      }

      case "add": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(ADD_HELP);
          return;
        }
        const provider = parseProvider(rest[0]);
        const addFlags = parseFlags(rest.slice(1));
        await addCommand(provider, {
          name:
            flagStr(addFlags, "name") ??
            (() => {
              throw new Error("--name is required");
            })(),
          region:
            flagStr(addFlags, "region") ??
            (() => {
              throw new Error("--region is required");
            })(),
          clusterName:
            flagStr(addFlags, "cluster-name") ??
            (() => {
              throw new Error("--cluster-name is required");
            })(),
          project: flagStr(addFlags, "project"),
          account: flagStr(addFlags, "account"),
          profile: flagStr(addFlags, "profile"),
          roleArn: flagStr(addFlags, "role-arn"),
          resourceGroup: flagStr(addFlags, "resource-group"),
          subscription: flagStr(addFlags, "subscription"),
        });
        break;
      }

      case "discover": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(DISCOVER_HELP);
          return;
        }
        const provider = parseProvider(rest[0]);
        const discoverFlags = parseFlags(rest.slice(1));
        await discoverCommand(provider, {
          project: flagStr(discoverFlags, "project"),
          region: flagStr(discoverFlags, "region"),
          profile: flagStr(discoverFlags, "profile"),
          resourceGroup: flagStr(discoverFlags, "resource-group"),
        });
        break;
      }

      case "registry": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(REGISTRY_HELP);
          return;
        }
        const rawProvider = rest[0];
        const registryFlags = parseFlags(rest.slice(1));
        // "all" is a special value — login to every provider at once
        const provider =
          rawProvider === "all" ? "all" : parseProvider(rawProvider);
        await registryCommand(provider, {
          region: flagStr(registryFlags, "region"),
          project: flagStr(registryFlags, "project"),
          profile: flagStr(registryFlags, "profile"),
          registry: flagStr(registryFlags, "registry"),
          all: registryFlags["all"] === true,
        });
        break;
      }

      case "clean": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(CLEAN_HELP);
          return;
        }
        // Supports: clean | clean --all | clean gcp | clean aws | clean azure
        const rawProvider = rest[0];
        const cleanFlags = parseFlags(rest);
        const isProvider =
          rawProvider && VALID_PROVIDERS.includes(rawProvider as Provider);
        await cleanCommand({
          all: cleanFlags["all"] === true,
          provider: isProvider ? (rawProvider as Provider) : undefined,
        });
        break;
      }

      case "remove": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(REMOVE_HELP);
          return;
        }
        const name = rest[0];
        if (!name) throw new Error("Usage: cloum remove <name>");
        await removeCommand(name);
        break;
      }

      case "ai": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(AI_HELP);
          return;
        }
        await aiCommand({ open: flags["open"] === true });
        break;
      }

      case "import": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(IMPORT_HELP);
          return;
        }
        const filePath = rest[0];
        if (!filePath) throw new Error("Usage: cloum import <file.json>");
        await importCommand(filePath);
        break;
      }

      case "update": {
        const flags = parseFlags(rest);
        if (flags["help"] === true || flags["h"] === true) {
          console.log(UPDATE_HELP);
          return;
        }
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
