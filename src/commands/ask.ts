/**
 * cloum ask — Natural Language Command Builder
 *
 * Usage:
 *   cloum ask "connect to my production cluster"
 *   cloum ask "list aws clusters" --json
 *   cloum ask "connect to prod" --execute
 *   cloum ask "which cluster should I use?" --plan
 *
 * Two-path architecture:
 *   1. Fast-path: regex/keyword matching (instant, no LLM)
 *   2. LLM-path: MiniMax API for ambiguous / complex prompts
 */

import { green, yellow, cyan, red, dim } from "../utils/colors.ts";
import { jsonSuccess, jsonError } from "../utils/output.ts";
import { fastPath } from "../utils/intent/fast_path.ts";
import { llmRoute } from "../utils/intent/llm_router.ts";
import { buildSystemPrompt, buildAskContext } from "../utils/intent/context.ts";
import { statusGcp } from "../providers/gcp.ts";
import { statusAws } from "../providers/aws.ts";
import { statusAzure } from "../providers/azure.ts";
import { loadClusters } from "../config/loader.ts";
import { MINIMAX_API_KEY } from "../consts.ts";

export interface AskOptions {
  readonly execute: boolean;   // auto-run the resolved command
  readonly plan: boolean;       // return command without running
  readonly json: boolean;       // JSON output
  readonly noInteractive: boolean;
  readonly prompt: string;
}

export interface AskResult {
  intent: string;
  confidence: number;
  fastPath: boolean;
  command: string;
  args: Record<string, string | boolean | undefined>;
  cluster: {
    name: string;
    provider: string;
    region: string;
    isFavorite: boolean;
  } | null;
  disambiguation: {
    reason: string;
    options: Array<{
      name: string;
      provider: string;
      region: string;
      isFavorite: boolean;
    }>;
  } | null;
  requiresConfirmation: boolean;
  warnings: string[];
  executed?: boolean;
  executeResult?: unknown;
}

// ---------------------------------------------------------------------------
// Resolve a fast-path result against actual cluster names
// ---------------------------------------------------------------------------

interface ResolvedAskResult extends AskResult {
  /** True if a single cluster was unambiguously matched */
  clusterResolved: boolean;
}

async function resolveFastPath(
  prompt: string,
): Promise<ResolvedAskResult | null> {
  const fp = fastPath(prompt);
  if (!fp) return null;

  const clusters = await loadClusters();

  // If the command references a cluster name, try to match it
  const rawName = fp.args["name"] as string | undefined;
  let matchedCluster = null;
  let clusterResolved = false;

  if (rawName && (fp.command === "connect" || fp.command === "describe" || fp.command === "remove")) {
    const lower = rawName.toLowerCase();
    const exact = clusters.find(
      (c) => c.name.toLowerCase() === lower,
    );
    const fuzzy = clusters.find(
      (c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()),
    );
    const match = exact ?? fuzzy;
    if (match) {
      matchedCluster = {
        name: match.name,
        provider: match.provider,
        region: match.region,
        isFavorite: !!(match as { isFavorite?: boolean }).isFavorite,
      };
      clusterResolved = !!exact;
    }
  }

  // Build the command string
  const cmdStr = buildCommand(fp.command, fp.args);

  return {
    intent: fp.command,
    confidence: fp.confidence,
    fastPath: true,
    command: cmdStr,
    args: fp.args,
    cluster: matchedCluster,
    disambiguation: null,
    requiresConfirmation: false,
    warnings: [],
    clusterResolved,
  };
}

/** Build a command string from parsed intent args */
function buildCommand(
  cmd: string,
  args: Record<string, string | boolean | undefined>,
): string {
  const parts = [`cloum ${cmd}`];
  if (args["name"]) parts.push(String(args["name"]));
  if (args["namespace"]) parts.push(`--namespace ${args["namespace"]}`);
  if (args["provider"]) parts.push(`--provider ${args["provider"]}`);
  if (args["region"]) parts.push(`--region ${args["region"]}`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Disambiguation when multiple clusters match
// ---------------------------------------------------------------------------

async function disambiguate(
  prompt: string,
  fragment: string,
): Promise<AskResult> {
  const clusters = await loadClusters();
  const lower = fragment.toLowerCase();
  const matches = clusters.filter(
    (c) =>
      c.name.toLowerCase().includes(lower) ||
      lower.includes(c.name.toLowerCase()),
  );

  return {
    intent: "connect",
    confidence: 0.6,
    fastPath: false,
    command: "",
    args: {},
    cluster: null,
    disambiguation: {
      reason: `multiple clusters match '${fragment}'`,
      options: matches.map((c) => ({
        name: c.name,
        provider: c.provider,
        region: c.region,
        isFavorite: !!(c as { isFavorite?: boolean }).isFavorite,
      })),
    },
    requiresConfirmation: true,
    warnings: [],
  };
}

// ---------------------------------------------------------------------------
// Execute the resolved command
// ---------------------------------------------------------------------------

async function executeCommand(cmdStr: string): Promise<unknown> {
  // Dynamically import the command registry and run the subcommand
  // We re-parse the command string and invoke the appropriate command function
  const parts = cmdStr.trim().split(/\s+/);
  // parts[0] = "cloum", parts[1] = command, parts[2...] = args
  const command = parts[1];
  const args = parts.slice(2);

  switch (command) {
    case "connect": {
      const name = args.find((a) => !a.startsWith("--")) ?? undefined;
      const ns = extractFlag(args, "namespace");
      const { connectCommand } = await import("./connect.ts");
      await connectCommand(name, ns);
      return { connected: true, name };
    }
    case "list": {
      const provider = extractFlag(args, "provider");
      const { listCommand } = await import("./list.ts");
      await listCommand({ provider: provider as any });
      return { listed: true };
    }
    case "status": {
      const { statusCommand } = await import("./status.ts");
      await statusCommand();
      return { statusShown: true };
    }
    case "describe": {
      const name = args[0];
      if (!name) throw new Error("describe requires a cluster name");
      const { describeCommand } = await import("./describe.ts");
      await describeCommand(name);
      return { described: name };
    }
    case "remove": {
      const name = args[0];
      if (!name) throw new Error("remove requires a cluster name");
      const { removeCommand } = await import("./remove.ts");
      await removeCommand(name);
      return { removed: name };
    }
    case "use": {
      const name = args[0];
      if (!name) throw new Error("use requires a cluster name");
      const ns = extractFlag(args, "namespace");
      const { useCommand } = await import("./use.ts");
      await useCommand(name, ns);
      return { used: name, namespace: ns };
    }
    case "discover": {
      const provider = args[0];
      if (!provider) throw new Error("discover requires a provider");
      const { discoverCommand } = await import("./discover.ts");
      await discoverCommand(provider as any, {});
      return { discovered: provider };
    }
    case "registry": {
      const provider = args[0];
      if (!provider) throw new Error("registry requires a provider");
      const region = extractFlag(args, "region");
      const project = extractFlag(args, "project");
      const { registryCommand } = await import("./registry.ts");
      await registryCommand(provider as any, { region, project });
      return { registryLogged: provider };
    }
    default:
      throw new Error(`Cannot execute unknown command: ${command}`);
  }
}

function extractFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

// ---------------------------------------------------------------------------
// Human-readable ask display
// ---------------------------------------------------------------------------

function printAskResult(result: AskResult, prompt: string): void {
  if (result.disambiguation) {
    console.log(yellow(`\n  ⚠️  ${result.disambiguation.reason}:\n`));
    result.disambiguation.options.forEach((opt, i) => {
      const fav = opt.isFavorite ? " ★" : "";
      const icon = providerIcon(opt.provider);
      console.log(
        `    [${i + 1}] ${icon} ${opt.name}${fav}  ${opt.region}`,
      );
    });
    console.log(
      `\n  ${dim("Run: cloum ask 'connect <name>' with the full cluster name")}`,
    );
    return;
  }

  console.log(cyan(`\n  🔵 Interpreting: "${prompt}"`));
  console.log(`\n  Detected:  ${green(result.command)}`);
  if (result.cluster) {
    const fav = result.cluster.isFavorite ? " ★" : "";
    console.log(
      `  Cluster:  ${providerIcon(result.cluster.provider)} ${result.cluster.name}${fav}  ${result.cluster.region}`,
    );
  }

  for (const warning of result.warnings) {
    console.log(yellow(`  ⚠️  ${warning}`));
  }
}

function providerIcon(provider: string): string {
  switch (provider) {
    case "gcp":
      return "🔵 GCP/GKE";
    case "aws":
      return "🟠 AWS/EKS";
    case "azure":
      return "🔷 Azure/AKS";
    default:
      return "☁️";
  }
}

// ---------------------------------------------------------------------------
// Main ask command
// ---------------------------------------------------------------------------

export async function askCommand(opts: AskOptions): Promise<void> {
  const start = Date.now();

  if (opts.json) {
    await askCommandJson(opts, start);
    return;
  }

  // Human-readable path
  await askCommandHuman(opts);
}

async function askCommandHuman(opts: AskOptions): Promise<void> {
  const { prompt, execute, plan } = opts;

  // Try fast-path first
  let result = await resolveFastPath(prompt);

  // If fast-path matched but cluster is ambiguous, run disambiguation
  if (result && !result.clusterResolved && result.cluster === null) {
    const rawName = result.args["name"] as string | undefined;
    if (rawName) {
      const disambig = await disambiguate(prompt, rawName);
      if (disambig.disambiguation && disambig.disambiguation.options.length > 1) {
        printAskResult(disambig, prompt);
        return;
      }
    }
  }

  // Fast-path miss → try LLM
  if (!result || result.confidence < 0.8) {
    if (!MINIMAX_API_KEY) {
      if (!result) {
        console.error(
          red(`\n  ❌ I couldn't understand: "${prompt}"\n`),
        );
        console.error(
          dim(`  No LLM available. Try being more specific, e.g.: cloum ask "connect prod-gke"`),
        );
        return;
      }
      // Low confidence but we have something
      console.log(
        yellow(`\n  ⚠️  Low confidence for: "${prompt}"`),
      );
      console.log(
        dim(`  Set MINIMAX_API_KEY for better interpretation, or use: cloum ask "connect prod-gke"\n`),
      );
      printAskResult(result, prompt);
      return;
    }

    // LLM fallback
    const [gcp, aws, azure] = await Promise.all([
      statusGcp(),
      statusAws(),
      statusAzure(),
    ]);
    const ctx = await buildAskContext(gcp, aws, azure);
    const llmResult = await llmRoute(prompt, ctx);

    if (llmResult.disambiguation) {
      printAskResult(
        {
          ...result ?? {
            intent: llmResult.intent,
            confidence: llmResult.confidence,
            fastPath: false,
            command: llmResult.command,
            args: llmResult.args,
            cluster: llmResult.cluster,
            disambiguation: null,
            requiresConfirmation: false,
            warnings: [],
          },
          disambiguation: llmResult.disambiguation,
          requiresConfirmation: true,
        },
        prompt,
      );
      return;
    }

    result = {
      intent: llmResult.intent,
      confidence: llmResult.confidence,
      fastPath: false,
      command: llmResult.command,
      args: llmResult.args,
      cluster: llmResult.cluster,
      disambiguation: null,
      requiresConfirmation: llmResult.requiresConfirmation,
      warnings: llmResult.warnings,
      clusterResolved: !!llmResult.cluster,
    };
  }

  // result is guaranteed non-null after the above block
  const r = result!;
  printAskResult(r, prompt);

  if (plan || r.requiresConfirmation) {
    console.log(
      dim(`\n  Run with --execute to auto-run, or run the command above directly.`),
    );
    return;
  }

  if (execute) {
    console.log(green(`\n  ⚡ Executing: ${r.command}`));
    try {
      const execResult = await executeCommand(r.command);
      r.executed = true;
      r.executeResult = execResult;
      console.log(green(`\n  ✅ Done.`));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(red(`\n  ❌ Execution failed: ${msg}`));
    }
  } else {
    console.log(
      dim(`\n  [Enter] Execute   [--execute] Skip prompt   [q] Cancel`),
    );
  }
}

async function askCommandJson(opts: AskOptions, start: number): Promise<void> {
  const { prompt, execute, plan } = opts;

  const result = await resolveFastPath(prompt);

  if (!result || result.confidence < 0.8) {
    if (result) {
      // Low confidence but workable — return it
      console.log(jsonSuccess({ ...result }, "ask", start));
      return;
    }

    if (!MINIMAX_API_KEY) {
      console.log(
        jsonError("UNKNOWN", `Could not interpret: "${prompt}"`, "ask", start),
      );
      return;
    }

    // LLM fallback
    const [gcp, aws, azure] = await Promise.all([
      statusGcp(),
      statusAws(),
      statusAzure(),
    ]);
    const ctx = await buildAskContext(gcp, aws, azure);
    const llmResult = await llmRoute(prompt, ctx);

    const askResult: AskResult = {
      intent: llmResult.intent,
      confidence: llmResult.confidence,
      fastPath: false,
      command: llmResult.command,
      args: llmResult.args,
      cluster: llmResult.cluster,
      disambiguation: llmResult.disambiguation,
      requiresConfirmation: llmResult.requiresConfirmation,
      warnings: llmResult.warnings,
    };

    console.log(jsonSuccess(askResult, "ask", start));

    if (execute && !askResult.requiresConfirmation && askResult.command) {
      try {
        const execResult = await executeCommand(askResult.command);
        console.log(jsonSuccess({ ...askResult, executed: true, executeResult: execResult }, "ask", start));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(jsonError("CLOUD_ERROR", `Execution failed: ${msg}`, "ask", start));
      }
    }
    return;
  }

  // Execute or plan
  if (plan) {
    console.log(jsonSuccess({ ...result }, "ask", start));
    return;
  }

  if (execute) {
    try {
      const execResult = await executeCommand(result.command);
      console.log(
        jsonSuccess(
          { ...result, executed: true, executeResult: execResult },
          "ask",
          start,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(jsonError("CLOUD_ERROR", `Execution failed: ${msg}`, "ask", start));
    }
    return;
  }

  // Default: show result in JSON
  console.log(jsonSuccess({ ...result }, "ask", start));
}
