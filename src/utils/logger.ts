/**
 * Logger utility for the wt CLI.
 *
 * Supports debug/info/warn/error levels controlled by --quiet / --verbose flags.
 * Uses ANSI colors when stdout is a TTY. Supports step-progress formatting.
 */

// ============================================================================
// ANSI color helpers
// ============================================================================

const isTTY = process.stdout.isTTY === true;

const ansi = {
  reset:   isTTY ? "\x1b[0m"  : "",
  bold:    isTTY ? "\x1b[1m"  : "",
  dim:     isTTY ? "\x1b[2m"  : "",
  red:     isTTY ? "\x1b[31m" : "",
  green:   isTTY ? "\x1b[32m" : "",
  yellow:  isTTY ? "\x1b[33m" : "",
  blue:    isTTY ? "\x1b[34m" : "",
  cyan:    isTTY ? "\x1b[36m" : "",
  white:   isTTY ? "\x1b[37m" : "",
  gray:    isTTY ? "\x1b[90m" : "",
};

// ============================================================================
// Log level definitions
// ============================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
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
  level:   "info",
  quiet:   false,
  verbose: false,
  logFile: null,
};

/** Call once at CLI startup to apply flags parsed from argv. */
export function configureLogger(opts: {
  quiet?: boolean;
  verbose?: boolean;
  logFile?: string;
}): void {
  if (opts.quiet)   { state.quiet = true;   state.level = "error"; }
  if (opts.verbose) { state.verbose = true;  state.level = "debug"; }
  if (opts.logFile) state.logFile = opts.logFile;
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

function emit(level: LogLevel, prefix: string, msg: string): void {
  if (!shouldEmit(level)) return;

  const plain = `[${timestamp()}] [${level.toUpperCase()}] ${msg}`;

  // write to log file (no ANSI)
  void writeToFile(plain);

  // write to console (with ANSI if TTY)
  if (level === "error") {
    process.stderr.write(prefix + msg + ansi.reset + "\n");
  } else {
    process.stdout.write(prefix + msg + ansi.reset + "\n");
  }
}

// ============================================================================
// Public API
// ============================================================================

export const logger = {
  debug(msg: string): void {
    emit("debug", `${ansi.gray}[debug] `, msg);
  },

  info(msg: string): void {
    emit("info", "", msg);
  },

  warn(msg: string): void {
    emit("warn", `${ansi.yellow}warn: ${ansi.reset}`, msg);
  },

  error(msg: string): void {
    emit("error", `${ansi.red}error: ${ansi.reset}`, msg);
  },

  /**
   * Print a blank line (info level).
   */
  blank(): void {
    if (!shouldEmit("info")) return;
    process.stdout.write("\n");
  },

  /**
   * Format a step indicator like "[1/4] Creating worktree..."
   * Returns a function that, when called with the result string, prints the
   * completion suffix on the same line:  "  done (0.2s)"
   *
   * Usage:
   *   const done = logger.step(1, 4, "Creating worktree");
   *   // ... do work ...
   *   done("done", elapsed);
   */
  step(
    current: number,
    total: number,
    description: string,
  ): (result: string, elapsedMs?: number) => void {
    const stepLabel = `${ansi.bold}${ansi.blue}[${current}/${total}]${ansi.reset}`;
    const line = `${stepLabel} ${description}...`;

    if (!shouldEmit("info")) {
      // quiet mode — return a no-op
      return () => {};
    }

    if (isTTY) {
      // print without newline so we can append the result
      process.stdout.write(line);
      return (result: string, elapsedMs?: number) => {
        const timing = elapsedMs !== undefined
          ? `${ansi.gray} (${(elapsedMs / 1000).toFixed(1)}s)${ansi.reset}`
          : "";
        process.stdout.write(`  ${ansi.green}${result}${ansi.reset}${timing}\n`);
      };
    } else {
      // non-TTY: just print the start line immediately
      process.stdout.write(line + "\n");
      return (result: string, elapsedMs?: number) => {
        const timing = elapsedMs !== undefined
          ? ` (${(elapsedMs / 1000).toFixed(1)}s)`
          : "";
        process.stdout.write(`  -> ${result}${timing}\n`);
      };
    }
  },

  /**
   * Print a result line without a step counter.
   * Example: "  node (bun), python (uv)"
   */
  result(label: string, values: string[]): void {
    if (!shouldEmit("info")) return;
    const joined = values.join(", ");
    process.stdout.write(`  ${ansi.cyan}${label}:${ansi.reset} ${joined}\n`);
  },

  /**
   * Print a success message.
   */
  success(msg: string): void {
    if (!shouldEmit("info")) return;
    process.stdout.write(`${ansi.green}${ansi.bold}ok${ansi.reset}  ${msg}\n`);
  },

  /**
   * Print a failure message (goes to stderr).
   */
  fail(msg: string): void {
    process.stderr.write(`${ansi.red}${ansi.bold}fail${ansi.reset} ${msg}\n`);
  },
};

export default logger;
