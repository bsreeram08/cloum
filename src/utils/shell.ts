import type { CommandResult } from "../config/types.ts";

/**
 * Run a command, streaming stdout/stderr to the terminal.
 * Returns exit code and captured output.
 */
export async function runCommand(cmd: string, args: string[]): Promise<CommandResult> {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const exitCode = await proc.exited;
  return { exitCode, stdout: "", stderr: "" };
}

/**
 * Run a command silently, capturing stdout/stderr without printing.
 * Use for status checks and value extraction.
 */
export async function runCommandSilent(cmd: string, args: string[]): Promise<CommandResult> {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdoutBuf, stderrBuf] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout: stdoutBuf, stderr: stderrBuf };
}

/**
 * Run a command with a custom environment, silently.
 * Used for AWS profile switching.
 */
export async function runCommandWithEnv(
  cmd: string,
  args: string[],
  env: Record<string, string>,
): Promise<CommandResult> {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: { ...process.env, ...env } as Record<string, string>,
  });
  const exitCode = await proc.exited;
  return { exitCode, stdout: "", stderr: "" };
}
