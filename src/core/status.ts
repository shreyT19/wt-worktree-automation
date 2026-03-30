/**
 * Setup status tracker for the wt CLI.
 *
 * Reads and writes .wt-status.json inside each worktree.
 * This file is added to .git/info/exclude automatically (not committed).
 */

import type {
  WtStatus,
  SetupOverallStatus,
  EcosystemType,
  InstallResult,
  EnvFileResult,
  HookResult,
} from "./types.ts";

const STATUS_FILE = ".wt-status.json";
const GITEXCLUDE_FILE = ".git/info/exclude";
const EXCLUDE_MARKER  = "# wt-managed";

// ============================================================================
// File helpers
// ============================================================================

function statusFilePath(worktreePath: string): string {
  return `${worktreePath}/${STATUS_FILE}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Read the setup status from a worktree's .wt-status.json.
 * Returns null if the file does not exist or is malformed.
 */
export async function readStatus(worktreePath: string): Promise<WtStatus | null> {
  const path = statusFilePath(worktreePath);
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    const text = await file.text();
    return JSON.parse(text) as WtStatus;
  } catch {
    return null;
  }
}

/**
 * Write (create or overwrite) the .wt-status.json for a worktree.
 * Also ensures the file is in .git/info/exclude.
 */
export async function writeStatus(
  worktreePath: string,
  status: WtStatus,
): Promise<void> {
  const path = statusFilePath(worktreePath);
  await Bun.write(path, JSON.stringify(status, null, 2) + "\n");
  await ensureGitExclude(worktreePath);
}

/**
 * Quick check: has the setup already been completed successfully?
 */
export async function isSetupDone(worktreePath: string): Promise<boolean> {
  const status = await readStatus(worktreePath);
  return status?.overall === "ready";
}

/**
 * Delete the status file (used by `wt setup --force`).
 */
export async function clearStatus(worktreePath: string): Promise<void> {
  const path = statusFilePath(worktreePath);
  try {
    const file = Bun.file(path);
    if (await file.exists()) {
      // Bun doesn't have a built-in delete — use the fs module
      const { unlink } = await import("node:fs/promises");
      await unlink(path);
    }
  } catch {
    // best-effort
  }
}

// ============================================================================
// Status builder helpers
// ============================================================================

/**
 * Build a WtStatus object from install, env, and hook results.
 */
export function buildStatus(opts: {
  ecosystems: EcosystemType[];
  depResults: InstallResult[];
  envResults: EnvFileResult[];
  hookResults: {
    pre_install?: HookResult[];
    post_install?: HookResult[];
    post_setup?: HookResult[];
  };
  envStrategy: "symlink" | "copy" | "skip";
}): WtStatus {
  const { ecosystems, depResults, envResults, hookResults, envStrategy } = opts;

  // Build deps status
  const deps: WtStatus["deps"] = {};
  for (const r of depResults) {
    if (!r.skipped) {
      deps[r.ecosystem] = {
        status:     r.success ? "ok" : "fail",
        pm:         r.pm,
        durationMs: r.durationMs,
        error:      r.error,
      };
    } else {
      deps[r.ecosystem] = {
        status:     "skip",
        pm:         r.pm,
        durationMs: 0,
      };
    }
  }

  // Build env status
  const envFiles = envResults.filter((r) => !r.skipped).map((r) => r.file);
  const anyEnvFail = envResults.some((r) => !r.success && !r.skipped);
  const allEnvSkip = envResults.length === 0 || envResults.every((r) => r.skipped);

  const envStatus: WtStatus["env"] = {
    strategy: envStrategy,
    files:    envFiles,
    status:   allEnvSkip ? "skip" : anyEnvFail ? "partial" : "ok",
  };

  // Build hooks status
  const hooksStatus: WtStatus["hooks"] = {};
  for (const [phase, results] of Object.entries(hookResults) as Array<[keyof typeof hookResults, HookResult[] | undefined]>) {
    if (!results || results.length === 0) continue;
    const anyFail = results.some((r) => !r.success);
    hooksStatus[phase] = { status: anyFail ? "fail" : "ok" };
  }

  // Determine overall status
  const anyDepFail  = depResults.some((r) => !r.success && !r.skipped);
  const anyHookFail = Object.values(hooksStatus).some((h) => h?.status === "fail");

  let overall: SetupOverallStatus = "ready";
  if (anyDepFail || anyEnvFail || anyHookFail) {
    overall = "partial";
  }

  return {
    version:   1,
    setupAt:   new Date().toISOString(),
    ecosystems,
    deps,
    env:       envStatus,
    hooks:     hooksStatus,
    overall,
  };
}

// ============================================================================
// .git/info/exclude management
// ============================================================================

/**
 * Add .wt-status.json to .git/info/exclude if not already present.
 * This keeps the file out of git without modifying the shared .gitignore.
 */
async function ensureGitExclude(worktreePath: string): Promise<void> {
  const excludePath = `${worktreePath}/${GITEXCLUDE_FILE}`;
  const entry = `${STATUS_FILE}`;

  try {
    const file = Bun.file(excludePath);
    if (!(await file.exists())) return; // bare repo or unusual setup

    const existing = await file.text();
    if (existing.includes(entry)) return; // already excluded

    const addition = `\n${EXCLUDE_MARKER}\n${entry}\n`;
    await Bun.write(excludePath, existing + addition);
  } catch {
    // non-fatal — the file just won't be excluded
  }
}
