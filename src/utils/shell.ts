/**
 * Shell execution utilities built on Bun.spawn.
 *
 * exec     — run a command, always return result (never throws)
 * execSafe — same but throws on non-zero exit code
 */

import type { ExecOptions, ExecResult } from "../core/types.ts";

// Default timeout: 5 minutes (most installs finish well under this)
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Split a command string into argv, respecting single and double quoted strings.
 * Does not handle advanced shell features (pipes, redirects, globs).
 * For those, pass ["sh", "-c", cmd] explicitly.
 */
function splitCommand(cmd: string): string[] {
  const args: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === " " && !inSingle && !inDouble) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (current.length > 0) args.push(current);
  return args;
}

/**
 * Execute a shell command using Bun.spawn.
 *
 * Always resolves — never rejects. Check exitCode to determine success.
 *
 * @param cmd  A command string (split on spaces/quotes) OR an argv array.
 * @param opts Optional execution options.
 */
export async function exec(
  cmd: string | string[],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  // SECURITY: when cmd is a string[], args are passed directly to the OS
  // without a shell — use string[] whenever args come from user input to
  // avoid injection. Only pass a plain string when you own the entire command.
  const rawCmd = typeof cmd === "string" ? cmd : null;

  // When cmd is a string and contains shell operators, route through sh -c.
  // When cmd is a string[] always use it as-is (no shell involvement).
  const shellOperators = ["|", "&&", "||", ";", ">", "<", "`"];
  const useShell = rawCmd !== null && shellOperators.some((op) => rawCmd.includes(op));

  let finalArgv: string[];
  if (useShell) {
    finalArgv = ["sh", "-c", rawCmd!];
  } else if (rawCmd !== null) {
    finalArgv = splitCommand(rawCmd);
  } else {
    finalArgv = cmd as string[];
  }

  const timeoutMs = opts.timeout ?? DEFAULT_TIMEOUT_MS;

  try {
    const proc = Bun.spawn(finalArgv, {
      cwd:    opts.cwd,
      env:    opts.env ? { ...process.env, ...opts.env } : process.env,
      stdin:  opts.input ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Feed stdin if provided
    if (opts.input && proc.stdin) {
      proc.stdin.write(new TextEncoder().encode(opts.input));
      proc.stdin.end();
    }

    // Race between process completion and timeout
    const cmdLabel = rawCmd ?? finalArgv.join(" ");
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmdLabel}`)), timeoutMs),
    );

    const [stdoutBuf, stderrBuf, exitCode] = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]),
      timeoutPromise,
    ]);

    return {
      stdout:   stdoutBuf.trimEnd(),
      stderr:   stderrBuf.trimEnd(),
      exitCode: exitCode ?? 1,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      stdout:   "",
      stderr:   message,
      exitCode: 1,
    };
  }
}

/**
 * Execute a shell command and throw if the exit code is non-zero.
 *
 * Throws an Error with stderr content and exit code attached.
 */
export async function execSafe(
  cmd: string | string[],
  opts: ExecOptions = {},
): Promise<ExecResult> {
  const result = await exec(cmd, opts);

  if (result.exitCode !== 0) {
    const cmdStr = Array.isArray(cmd) ? cmd.join(" ") : String(cmd);
    const detail = result.stderr || result.stdout || "(no output)";
    const err = new Error(
      `Command failed (exit ${result.exitCode}): ${cmdStr}\n${detail}`,
    );
    (err as NodeJS.ErrnoException & { exitCode: number; result: ExecResult }).exitCode = result.exitCode;
    (err as NodeJS.ErrnoException & { exitCode: number; result: ExecResult }).result = result;
    throw err;
  }

  return result;
}

/**
 * Check whether a binary is available in PATH.
 */
export async function commandExists(name: string): Promise<boolean> {
  const result = await exec(["which", name]);
  return result.exitCode === 0;
}

/**
 * Run multiple commands in sequence, stopping on first failure.
 * Returns all results (partial if stopped early).
 */
export async function execSequential(
  commands: string[],
  opts: ExecOptions = {},
): Promise<Array<ExecResult & { command: string }>> {
  const results: Array<ExecResult & { command: string }> = [];

  for (const cmd of commands) {
    const result = await exec(cmd, opts);
    results.push({ ...result, command: cmd });
    if (result.exitCode !== 0) break;
  }

  return results;
}
