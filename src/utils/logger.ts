/**
 * Logger utility for the wt CLI.
 *
 * Cargo-style right-aligned verb output using picocolors.
 * Supports debug/info/warn/error levels controlled by --quiet / --verbose flags.
 * Colors are automatically skipped when stdout is not a TTY.
 */

import pc from "picocolors";

// ============================================================================
// Log level definitions
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ============================================================================
// Global logger state
// ============================================================================

interface LoggerState {
  level: LogLevel;
  /** when true, only errors are emitted */
  quiet: boolean;
  /** when true, debug messages are emitted */
  verbose: boolean;
  /** optional path to write a full log alongside stdout */
  logFile: string | null;
}

const state: LoggerState = {
  level: "info",
  quiet: false,
  verbose: false,
  logFile: null,
};

/** Call once at CLI startup to apply flags parsed from argv. */
export function configureLogger(opts: {
  quiet?: boolean;
  verbose?: boolean;
  logFile?: string;
}): void {
  if (opts.quiet) {
    state.quiet = true;
    state.level = "error";
  }
  if (opts.verbose) {
    state.verbose = true;
    state.level = "debug";
  }
  if (opts.logFile) state.logFile = opts.logFile;
}

// ============================================================================
// Formatting helpers
// ============================================================================

const VERB_WIDTH = 12;

/** Right-align a verb in a 12-char column and apply bold + color. */
function formatVerb(
  verb: string,
  color: (s: string) => string = pc.green,
): string {
  return color(pc.bold(verb.padStart(VERB_WIDTH)));
}

// ============================================================================
// Core write helpers
// ============================================================================

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[state.level];
}

function timestamp(): string {
  return new Date().toISOString();
}

async function writeToFile(line: string): Promise<void> {
  if (!state.logFile) return;
  try {
    const file = Bun.file(state.logFile);
    const existing = (await file.exists()) ? await file.text() : "";
    await Bun.write(state.logFile, existing + line + "\n");
  } catch {
    // never crash on log-file errors
  }
}

function emit(level: LogLevel, formatted: string, plainMsg: string): void {
  if (!shouldEmit(level)) return;

  const plain = `[${timestamp()}] [${level.toUpperCase()}] ${plainMsg}`;
  void writeToFile(plain);

  if (level === "error") {
    process.stderr.write(formatted + "\n");
  } else {
    process.stdout.write(formatted + "\n");
  }
}

// ============================================================================
// Public API
// ============================================================================

export const logger = {
  /**
   * Configure logger options. Alias for configureLogger().
   */
  configure(opts: { quiet?: boolean; verbose?: boolean }): void {
    configureLogger(opts);
  },

  /** Whether the logger is in quiet mode. */
  isQuiet(): boolean {
    return state.quiet;
  },

  // --------------------------------------------------------------------------
  // Cargo-style verb output
  // --------------------------------------------------------------------------

  /**
   * Print a right-aligned verb followed by a message.
   *
   *     Creating worktree at ../worktrees/myapp-feat-billing
   */
  verb(
    verb: string,
    message: string,
    color: (s: string) => string = pc.green,
  ): void {
    if (!shouldEmit("info")) return;
    const line = `${formatVerb(verb, color)} ${message}`;
    emit("info", line, `${verb} ${message}`);
  },

  /**
   * Print an indented sub-detail in dim.
   */
  detail(message: string): void {
    if (!shouldEmit("info")) return;
    const indent = " ".repeat(VERB_WIDTH + 1);
    const line = `${indent}${pc.dim(message)}`;
    emit("info", line, `  ${message}`);
  },

  /**
   * Print a success message with a green checkmark prefix.
   */
  success(msg: string): void {
    if (!shouldEmit("info")) return;
    const line = `${formatVerb(pc.green("\u2713"), pc.green)} ${msg}`;
    emit("info", line, `ok ${msg}`);
  },

  /**
   * Print a warning message with a yellow warning prefix.
   */
  warn(msg: string): void {
    const line = `${formatVerb("\u26A0", pc.yellow)} ${pc.yellow(msg)}`;
    emit("warn", line, `warn: ${msg}`);
  },

  /**
   * Print an error message with a red cross prefix.
   */
  error(msg: string): void {
    const line = `${formatVerb("\u2717", pc.red)} ${pc.red(msg)}`;
    emit("error", line, `error: ${msg}`);
  },

  /**
   * Print a hint with a dim arrow prefix.
   */
  hint(message: string): void {
    if (!shouldEmit("info")) return;
    const indent = " ".repeat(VERB_WIDTH + 1);
    const line = `${indent}${pc.dim("\u2192 " + message)}`;
    emit("info", line, `-> ${message}`);
  },

  /**
   * Print a blank line (info level).
   */
  blank(): void {
    if (!shouldEmit("info")) return;
    process.stdout.write("\n");
  },

  /**
   * Format a step indicator and print it without a newline (on TTY).
   * Returns void. Call stepDone() when the step completes.
   *
   * Usage:
   *   logger.step(1, 4, "Creating worktree");
   *   // ... do work ...
   *   logger.stepDone("done", elapsed);
   */
  step(
    current: number,
    total: number,
    description: string,
  ): (result: string, elapsedMs?: number) => void {
    const verb = `[${current}/${total}]`;
    const line = `${formatVerb(verb, pc.blue)} ${description}...`;

    if (!shouldEmit("info")) {
      return () => {};
    }

    const isTTY = process.stdout.isTTY === true;

    if (isTTY) {
      process.stdout.write(line);
      return (result: string, elapsedMs?: number) => {
        const timing =
          elapsedMs !== undefined ? pc.dim(` (${formatDuration(elapsedMs)})`) : "";
        process.stdout.write(`  ${pc.green(result)}${timing}\n`);
      };
    } else {
      process.stdout.write(line + "\n");
      return (result: string, elapsedMs?: number) => {
        const timing =
          elapsedMs !== undefined ? ` (${formatDuration(elapsedMs)})` : "";
        process.stdout.write(`  -> ${result}${timing}\n`);
      };
    }
  },

  /**
   * Print a step completion (standalone, when not using the step() return fn).
   */
  stepDone(result: string, durationMs?: number): void {
    if (!shouldEmit("info")) return;
    const timing =
      durationMs !== undefined ? pc.dim(` (${formatDuration(durationMs)})`) : "";
    const line = `${" ".repeat(VERB_WIDTH + 1)}${pc.green(result)}${timing}`;
    emit("info", line, `${result}${durationMs !== undefined ? ` (${formatDuration(durationMs)})` : ""}`);
  },

  /**
   * Print an info message (unformatted, for general output).
   */
  info(msg: string): void {
    emit("info", msg, msg);
  },

  /**
   * Print a debug message (only in verbose mode).
   */
  debug(msg: string): void {
    if (!shouldEmit("debug")) return;
    const line = `${pc.dim(`[debug] ${msg}`)}`;
    emit("debug", line, msg);
  },

  /**
   * Print a result line (label + values).
   * Example: "  Detected: node(bun), python(uv)"
   */
  result(label: string, values: string[]): void {
    if (!shouldEmit("info")) return;
    const joined = values.join(", ");
    const line = `${formatVerb(label, pc.cyan)} ${joined}`;
    emit("info", line, `${label}: ${joined}`);
  },

  /**
   * Print a failure message (goes to stderr).
   */
  fail(msg: string): void {
    const line = `${formatVerb("FAIL", pc.red)} ${pc.red(msg)}`;
    emit("error", line, `fail ${msg}`);
  },
};

// ============================================================================
// Shared duration formatter (also exported for use elsewhere)
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default logger;
