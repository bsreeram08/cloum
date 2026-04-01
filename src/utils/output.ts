/**
 * Unified output layer for cloum v1.3+
 *
 * All commands return CloumResponse<T> when --json is passed.
 * Exit codes are typed: 0=success, 1=general, 2=usage, 3=auth, 4=cloud, 5=not-found
 */

import { VERSION } from "../commands/version.ts";

/** Error codes that map to exit codes */
export type CloumErrorCode =
  | "NOT_FOUND"      // exit 5 — cluster not found
  | "AUTH_FAILED"    // exit 3 — cloud auth expired
  | "INVALID_USAGE"  // exit 2 — bad args / flags
  | "CLOUD_ERROR"    // exit 4 — cloud API error
  | "UNKNOWN";       // exit 1 — everything else

/** Map error codes to exit codes */
export const EXIT_CODES: Record<CloumErrorCode, number> = {
  NOT_FOUND: 5,
  AUTH_FAILED: 3,
  INVALID_USAGE: 2,
  CLOUD_ERROR: 4,
  UNKNOWN: 1,
};

/** Meta field included in every response */
export interface ResponseMeta {
  version: string;
  duration_ms: number;
  command: string;
}

/** Machine-readable response envelope */
export interface CloumResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: CloumErrorCode;
    message: string;
    details?: string;
  };
  meta: ResponseMeta;
}

/** Convenience: build a success response */
export function jsonSuccess<T>(
  data: T,
  command: string,
  startMs: number,
): string {
  const response: CloumResponse<T> = {
    ok: true,
    data,
    meta: {
      version: VERSION,
      duration_ms: Date.now() - startMs,
      command,
    },
  };
  return JSON.stringify(response);
}

/** Convenience: build an error response */
export function jsonError(
  code: CloumErrorCode,
  message: string,
  command: string,
  startMs: number,
  details?: string,
): string {
  const response: CloumResponse<never> = {
    ok: false,
    error: { code, message, details },
    meta: {
      version: VERSION,
      duration_ms: Date.now() - startMs,
      command,
    },
  };
  return JSON.stringify(response);
}

/** Print JSON response and exit with the correct exit code */
export function exitWithJson<T>(
  response: CloumResponse<T>,
  exitCode: number,
): never {
  console.log(JSON.stringify(response));
  process.exit(exitCode);
}

/** Check if --json flag is present anywhere in argv */
export function wantsJson(args: string[]): boolean {
  return args.includes("--json") || args.includes("-j");
}

/** Human-readable print (used when --json is NOT passed) */
export function printOk(message: string): void {
  console.log(message);
}

export function printErr(message: string): void {
  console.error(message);
}
