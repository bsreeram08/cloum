/**
 * LLM router — fallback for cloum ask when fast-path confidence is low
 * or when fast-path returns null.
 *
 * Uses MiniMax API (via inference.sh or direct) to interpret ambiguous prompts.
 */

import { MINIMAX_API_KEY, MINIMAX_BASE_URL } from "../../../src/consts.ts";
import type { AskContext } from "./context.ts";

export interface LlmRouterResult {
  intent: string;
  confidence: number;
  command: string;
  args: Record<string, string | boolean | undefined>;
  cluster: { name: string; provider: string; region: string; isFavorite: boolean } | null;
  disambiguation: {
    reason: string;
    options: Array<{ name: string; provider: string; region: string; isFavorite: boolean }>;
  } | null;
  requiresConfirmation: boolean;
  warnings: string[];
  rawResponse?: string;
}

const MINIMAX_MODELS = [
  "MiniMax/MiniMax-Text-01",
  "MiniMax/MiniMax-M2.7",
  "MiniMax/MiniMax-M1.7",
];

const SYSTEM_PROMPT = `You are a cloud kubectl cluster assistant. The user speaks naturally about what they want to do with their Kubernetes clusters. Respond ONLY with a JSON object matching this schema:

{
  "intent": "connect" | "list" | "status" | "discover" | "describe" | "remove" | "registry" | "use" | "unknown",
  "confidence": 0.0-1.0,
  "command": "cloum ...",
  "args": {},
  "cluster": { "name": "...", "provider": "...", "region": "..." } | null,
  "disambiguation": { "reason": "...", "options": [...] } | null,
  "requiresConfirmation": false,
  "warnings": []
}

Never say anything except the JSON object.`;

/** Call MiniMax chat API */
async function callMiniMax(
  prompt: string,
  context: AskContext,
): Promise<LlmRouterResult | null> {
  // Build context dump
  const contextDump = buildContextDump(context);

  for (const model of MINIMAX_MODELS) {
    try {
      const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${MINIMAX_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "system", content: contextDump },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 512,
        }),
      });

      if (!response.ok) continue;

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        content?: string[];
      };

      const content =
        data.choices?.[0]?.message?.content ?? data.content?.[0] ?? "";

      return parseLlmResponse(content as string);
    } catch {
      // Try next model
    }
  }

  return null;
}

function buildContextDump(ctx: AskContext): string {
  return `## Cloum State (as of ${ctx.timestamp})

Clusters (${ctx.clusters.length}):
${ctx.clusters.map((c) => `${c.name} [${c.provider.toUpperCase()}] ${c.region} ${c.detail}${c.isFavorite ? " ★" : ""}`).join("\n")}

Auth: ${Object.entries(ctx.auth).map(([p, s]) => `${p}:${s.authenticated ? "✅" : "❌"}`).join(" ")}
Kubectl: ${ctx.kubectl ? `${ctx.kubectl.context} ns=${ctx.kubectl.namespace}` : "none"}
Config: ${ctx.config.configFile}`;
}

function parseLlmResponse(raw: string): LlmRouterResult {
  // Try to extract JSON from the response
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      intent: "unknown",
      confidence: 0,
      command: "",
      args: {},
      cluster: null,
      disambiguation: null,
      requiresConfirmation: false,
      warnings: ["Failed to parse LLM response"],
      rawResponse: raw,
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as LlmRouterResult;
    // Validate required fields
    if (!parsed.intent || !parsed.command) {
      parsed.intent = "unknown";
      parsed.confidence = 0;
    }
    return parsed;
  } catch {
    return {
      intent: "unknown",
      confidence: 0,
      command: "",
      args: {},
      cluster: null,
      disambiguation: null,
      requiresConfirmation: false,
      warnings: ["JSON parse failed"],
      rawResponse: raw,
    };
  }
}

/**
 * Route a prompt to the LLM for interpretation.
 * Called when fast-path returns null or low confidence.
 */
export async function llmRoute(
  prompt: string,
  context: AskContext,
): Promise<LlmRouterResult> {
  const result = await callMiniMax(prompt, context);

  if (!result || result.intent === "unknown") {
    return {
      intent: "unknown",
      confidence: 0,
      command: "",
      args: {},
      cluster: null,
      disambiguation: null,
      requiresConfirmation: false,
      warnings: [
        "All LLM models failed or returned unknown intent. Try being more specific.",
        ...(result ? result.warnings : []),
      ],
    };
  }

  return result;
}
