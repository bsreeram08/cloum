/**
 * Fast-path intent parser — regex + keyword matching for cloum ask.
 *
 * No LLM needed for straightforward commands.
 * Returns null when the prompt is too ambiguous (deferred to LLM router).
 */

import type { Provider } from "../../config/types.ts";

export type IntentCommand =
  | "connect"
  | "list"
  | "status"
  | "discover"
  | "describe"
  | "remove"
  | "registry"
  | "use";

export interface FastPathResult {
  command: IntentCommand;
  confidence: number; // 0.0 – 1.0
  args: Record<string, string | boolean | undefined>;
  /** The cluster name(s) matched, if any */
  matchedClusters?: string[];
}

/** Detect provider from a string fragment */
function detectProvider(raw: string | undefined): Provider | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase().trim();
  if (["gcp", "gke", "google"].some((p) => lower.includes(p))) return "gcp";
  if (["aws", "eks", "amazon"].some((p) => lower.includes(p))) return "aws";
  if (["azure", "aks"].some((p) => lower.includes(p))) return "azure";
  return undefined;
}

/** Build a ConnectArgs from a cluster name */
function connectArgs(name: string, ns?: string): FastPathResult["args"] {
  return {
    name,
    namespace: ns,
  };
}

// ---------------------------------------------------------------------------
// Pattern definitions
// Each entry: regex(es) to match, the command, and an extractor fn
// ---------------------------------------------------------------------------

interface IntentPattern {
  patterns: RegExp[];
  command: IntentCommand;
  /** Return args dict. m[1] = first capture group, m[2] = second, etc. */
  extract: (m: RegExpMatchArray) => FastPathResult["args"];
  /** Minimum confidence if this fires */
  confidence: number;
}

const PATTERNS: IntentPattern[] = [
  // ---- connect / use / switch ----
  {
    patterns: [
      /^connect(?: to)? (.+)/i,
      /^use (.+)/i,
      /^switch to (.+)/i,
      /^switch (.+)/i,
      /^conn(?:ect)? (.+)/i,
    ],
    command: "connect",
    extract: (m) => connectArgs(m[1]!.trim()),
    confidence: 0.92,
  },
  // connect + namespace: "connect to prod --namespace payments"
  {
    patterns: [
      /^connect(?: to)? (.+?) --namespace (.+)/i,
      /^use (.+?) --namespace (.+)/i,
      /^switch to (.+?) --namespace (.+)/i,
    ],
    command: "connect",
    extract: (m) => connectArgs(m[1]!.trim(), m[2]!.trim()),
    confidence: 0.96,
  },
  // connect + namespace flag shorthand: "connect prod -n payments"
  {
    patterns: [
      /^connect(?: to)? (.+?) -n (.+)/i,
      /^use (.+?) -n (.+)/i,
    ],
    command: "connect",
    extract: (m) => connectArgs(m[1]!.trim(), m[2]!.trim()),
    confidence: 0.94,
  },

  // ---- list clusters ----
  {
    patterns: [
      /^list(?: (.+))? clusters?$/i,
      /^show(?: me)? (.+?) clusters?$/i,
      /^list(?: all)? clusters?(?: of| in)? (.+)?$/i,
      /^clusters$/i,
      /^list all$/i,
    ],
    command: "list",
    extract: (m) => ({ provider: detectProvider(m[1]) }),
    confidence: 0.90,
  },

  // ---- status ----
  {
    patterns: [
      /^status$/i,
      /^auth( check)?$/i,
      /^check( my)? auth(entication)?$/i,
      /^cloud status$/i,
      /^provider status$/i,
    ],
    command: "status",
    extract: () => ({}),
    confidence: 0.95,
  },

  // ---- discover ----
  {
    patterns: [
      /^discover (.+)/i,
      /^find (.+?) clusters?$/i,
      /^refresh (.+?) clusters?$/i,
      /^scan for (.+?) clusters?$/i,
      /^list remote (.+?) clusters?$/i,
    ],
    command: "discover",
    extract: (m) => ({ provider: detectProvider(m[1]) }),
    confidence: 0.88,
  },

  // ---- describe ----
  {
    patterns: [
      /^describe (.+)/i,
      /^show (.+?) details?$/i,
      /^details? of (.+)/i,
      /^info(?:rmation)? about (.+)/i,
      /^inspect (.+)/i,
    ],
    command: "describe",
    extract: (m) => ({ name: m[1]!.trim() }),
    confidence: 0.90,
  },

  // ---- remove / delete ----
  {
    patterns: [
      /^remove (.+)/i,
      /^delete (.+)/i,
      /^rm (.+)/i,
      /^remove cluster (.+)/i,
      /^delete cluster (.+)/i,
    ],
    command: "remove",
    extract: (m) => ({ name: m[1]!.trim() }),
    confidence: 0.88,
  },

  // ---- registry login ----
  {
    patterns: [
      /^login to (.+?) registry$/i,
      /^registry (.+)$/i,
      /^docker login (.+)$/i,
      /^ ACR |^ ECR |^ GCR /i,
    ],
    command: "registry",
    extract: (m) => parseRegistryIntent(m[1] ?? m[0]),
    confidence: 0.85,
  },

  // ---- use (context switch without re-auth) ----
  {
    patterns: [
      /^use (.+?) namespace (.+)/i,
      /^switch namespace (.+)/i,
      /^set namespace (.+)/i,
    ],
    command: "use",
    extract: (m) => ({ name: m[1]!.trim(), namespace: m[2]!.trim() }),
    confidence: 0.90,
  },
];

/** Parse registry provider + optional region from a fragment like "gcp" or "gcp us-central1" */
function parseRegistryIntent(raw: string): FastPathResult["args"] {
  const lower = raw.toLowerCase().trim();
  const parts = lower.split(/\s+/);
  const provider = detectProvider(parts[0]);
  const region = parts.slice(1).join(" ") || undefined;
  return { provider, region };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Attempt to parse a natural-language prompt via fast-path patterns.
 * Returns null if no pattern matched (caller should fall back to LLM).
 */
export function fastPath(prompt: string): FastPathResult | null {
  const trimmed = prompt.trim();

  for (const pattern of PATTERNS) {
    for (const regex of pattern.patterns) {
      const match = trimmed.match(regex);
      if (match) {
        return {
          command: pattern.command,
          confidence: pattern.confidence,
          args: pattern.extract(match),
        };
      }
    }
  }

  return null;
}

/**
 * Given a partial cluster name, return clusters that contain the fragment.
 * Used by disambiguation when fastPath returns multiple matches.
 */
export function fuzzyMatchCluster(
  nameFragment: string,
  clusterNames: string[],
): string[] {
  const lower = nameFragment.toLowerCase();
  return clusterNames.filter((n) => n.toLowerCase().includes(lower));
}
