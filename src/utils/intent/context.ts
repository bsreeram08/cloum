/**
 * Build the LLM context payload for cloum ask — the "brain dump"
 * that gives the LLM full visibility into the cloum state.
 */

import type { ClusterConfig, ProviderStatus } from "../../config/types.ts";
import { loadClusters } from "../../config/loader.ts";

export interface AskContext {
  clusters: AskCluster[];
  auth: Record<string, AskAuthStatus>;
  kubectl?: {
    context: string;
    namespace: string;
    reachable: boolean;
    nodeCount: number;
  };
  config: {
    configFile: string;
    cloudSyncEnabled: boolean;
  };
  availableCommands: string[];
  timestamp: string;
}

export interface AskCluster {
  name: string;
  provider: string;
  region: string;
  isFavorite: boolean;
  /** Extra fields depending on provider */
  detail: string;
}

export interface AskAuthStatus {
  authenticated: boolean;
  identity?: string;
  detail?: string;
}

/** Probe kubectl for current context info */
async function probeKubectl(): Promise<AskContext["kubectl"] | undefined> {
  try {
    const { runCommandSilent } = await import("../../utils/shell.ts");

    const [ctxResult, nsResult, nodesResult] = await Promise.all([
      runCommandSilent("kubectl", ["config", "current-context"]),
      runCommandSilent("kubectl", [
        "config",
        "view",
        "--minify",
        "--output", "jsonpath={..namespace}",
      ]),
      runCommandSilent("kubectl", ["get", "nodes", "--no-headers"]),
    ]);

    if (ctxResult.exitCode !== 0 || !ctxResult.stdout.trim()) {
      return undefined;
    }

    const nodes = nodesResult.stdout
      .trim()
      .split("\n")
      .filter(Boolean).length;

    return {
      context: ctxResult.stdout.trim(),
      namespace: nsResult.stdout.trim() || "default",
      reachable: nodesResult.exitCode === 0,
      nodeCount: nodes,
    };
  } catch {
    return undefined;
  }
}

/** Map provider auth status to AskAuthStatus */
function mapAuthStatus(s: ProviderStatus): AskAuthStatus {
  return {
    authenticated: s.isAuthenticated,
    identity: s.identity,
    detail: s.details,
  };
}

/**
 * Build the full context object passed to the LLM router.
 * Expensive calls (kubectl probe) are done in parallel.
 */
export async function buildAskContext(
  gcpStatus: ProviderStatus,
  awsStatus: ProviderStatus,
  azureStatus: ProviderStatus,
): Promise<AskContext> {
  const clusters = await loadClusters();
  const kubectl = await probeKubectl();

  // Check for cloud sync config
  let cloudSyncEnabled = false;
  try {
    const { homedir } = await import("os");
    const { join } = await import("path");
    const { existsSync } = await import("fs");
    const cloudConfigPath = join(homedir(), ".config", "cloum", "cloud.json");
    cloudSyncEnabled = existsSync(cloudConfigPath);
  } catch {
    // ignore
  }

  return {
    clusters: clusters.map((c): AskCluster => {
      let detail = "";
      switch (c.provider) {
        case "gcp":
          detail = `project=${(c as { project: string }).project}`;
          break;
        case "aws":
          detail = (c as { profile?: string }).profile
            ? `profile=${(c as { profile: string }).profile}`
            : "default";
          break;
        case "azure":
          detail = `rg=${c.resourceGroup}`;
          break;
      }
      return {
        name: c.name,
        provider: c.provider,
        region: c.region,
        isFavorite: !!(c as { isFavorite?: boolean }).isFavorite,
        detail,
      };
    }),
    auth: {
      gcp: mapAuthStatus(gcpStatus),
      aws: mapAuthStatus(awsStatus),
      azure: mapAuthStatus(azureStatus),
    },
    kubectl,
    config: {
      configFile: "~/.config/cloum/clusters.json",
      cloudSyncEnabled,
    },
    availableCommands: [
      "connect <name> [--namespace <ns>]",
      "list [--provider gcp|aws|azure]",
      "status",
      "discover <provider>",
      "describe <name>",
      "add <provider> ...",
      "remove <name>",
      "rename <old> <new>",
      "use <name> [--namespace <ns>]",
      "registry <provider>",
      "clean [--all]",
      "import <file.json>",
    ],
    timestamp: new Date().toISOString(),
  };
}

/** Build the system prompt that instructs the LLM how to interpret intents */
export function buildSystemPrompt(ctx: AskContext): string {
  return `You are a cloud kubectl cluster assistant. The user speaks naturally about what they want to do with their Kubernetes clusters.

Given the current cloum state below, interpret their natural-language request and produce the correct cloum CLI command.

## Current State

**Clusters (${ctx.clusters.length}):**
${ctx.clusters.map((c) => {
  const fav = c.isFavorite ? " ★" : "";
  return `  ${c.name}${fav}  [${c.provider.toUpperCase()}]  ${c.region}  ${c.detail}`;
}).join("\n")}

**Auth Status:**
${Object.entries(ctx.auth).map(([p, s]) => {
  const icon = s.authenticated ? "✅" : "❌";
  const id = s.identity ? ` (${s.identity})` : "";
  return `  ${icon} ${p.toUpperCase()}: ${s.authenticated ? "authenticated" + id : "NOT authenticated" + (s.detail ? ` — ${s.detail}` : "")}`;
}).join("\n")}

**Kubectl:**
${ctx.kubectl
  ? `  Context: ${ctx.kubectl.context}  Namespace: ${ctx.kubectl.namespace}  Nodes: ${ctx.kubectl.nodeCount}  Reachable: ${ctx.kubectl.reachable ? "✅" : "❌"}`
  : "  No active context"}

**Config:** ${ctx.config.configFile}  CloudSync: ${ctx.config.cloudSyncEnabled ? "enabled" : "disabled"}

## Your Task

1. Identify the **intent** (connect, list, status, discover, describe, remove, registry, use)
2. Match it to the **closest cluster name** from the list above (fuzzy match on partial names like "prod" → "prod-gke")
3. Produce the exact cloum CLI command with all required flags
4. If multiple clusters match, list the options for disambiguation

## Output Format

Return a JSON object:
{
  "intent": "connect" | "list" | "status" | "discover" | "describe" | "remove" | "registry" | "use" | "unknown",
  "confidence": 0.0-1.0,
  "command": "cloum connect prod-gke",
  "args": { "name": "prod-gke", "namespace": "payments" },
  "cluster": { "name": "prod-gke", "provider": "gcp", "region": "us-central1" } | null,
  "disambiguation": {
    "reason": "multiple clusters match 'prod'",
    "options": [{ "name": "...", "provider": "...", "region": "..." }]
  } | null,
  "requiresConfirmation": false,
  "warnings": []
}

Rules:
- Always prefer exact name matches over fuzzy ones
- If a cluster name is ambiguous, return disambiguation with all matching options
- "connect to prod" → if only one "prod" cluster exists, use it
- Unknown intent → confidence 0, explain what you couldn't understand
- Never make up cluster names not in the list above`;
}
