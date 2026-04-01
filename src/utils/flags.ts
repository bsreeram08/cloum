/**
 * Shared flag parsing utilities for cloum v1.3+
 *
 * Canonical flags:
 *   --json / -j      Machine-readable JSON output
 *   --quiet / -q     Suppress informational output
 *   --no-interactive / -y  Never prompt, error on ambiguity
 *   --dry-run        Show what would happen without executing
 */

export interface GlobalFlags {
  json: boolean;
  quiet: boolean;
  noInteractive: boolean;
  dryRun: boolean;
}

/** Parse global flags from argv array (mutates nothing) */
export function parseGlobalFlags(args: string[]): {
  flags: GlobalFlags;
  rest: string[];
} {
  let json = false;
  let quiet = false;
  let noInteractive = false;
  let dryRun = false;

  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--json":
      case "-j":
        json = true;
        break;
      case "--quiet":
      case "-q":
        quiet = true;
        break;
      case "--no-interactive":
      case "-y":
        noInteractive = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      default:
        if (arg !== undefined) rest.push(arg);
    }
  }

  return { flags: { json, quiet, noInteractive, dryRun }, rest };
}

/** Whether --json was passed */
export function wantsJson(args: string[]): boolean {
  return args.includes("--json") || args.includes("-j");
}

/** Whether --quiet was passed */
export function wantsQuiet(args: string[]): boolean {
  return args.includes("--quiet") || args.includes("-q");
}

/** Whether --no-interactive was passed */
export function isNonInteractive(args: string[]): boolean {
  return args.includes("--no-interactive") || args.includes("-y");
}

/** Whether --dry-run was passed */
export function isDryRun(args: string[]): boolean {
  return args.includes("--dry-run");
}
