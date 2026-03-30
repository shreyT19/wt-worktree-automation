/**
 * Git utilities for the wt CLI.
 *
 * All functions return structured results — never throw uncaught errors.
 */

import { exec, execSafe } from "../utils/shell.ts";
import type { WorktreeInfo, AddWorktreeOptions, ExecResult } from "./types.ts";

// ============================================================================
// Internal helpers
// ============================================================================

/** Run a git command from an optional working directory. */
async function git(args: string[], cwd?: string): Promise<ExecResult> {
  return exec(["git", ...args], { cwd });
}

async function gitSafe(args: string[], cwd?: string): Promise<ExecResult> {
  return execSafe(["git", ...args], { cwd });
}

// ============================================================================
// Repository utilities
// ============================================================================

/**
 * Get the root of the git repository containing `cwd`.
 * Returns null if not inside a git repository.
 */
export async function getRepoRoot(cwd?: string): Promise<string | null> {
  const result = await git(["rev-parse", "--show-toplevel"], cwd);
  if (result.exitCode !== 0) return null;
  return result.stdout.trim() || null;
}

/**
 * Get the name of the currently checked-out branch.
 * Returns null when in detached HEAD state or on error.
 */
export async function getCurrentBranch(cwd?: string): Promise<string | null> {
  const result = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (result.exitCode !== 0) return null;
  const branch = result.stdout.trim();
  return branch === "HEAD" ? null : branch;
}

// ============================================================================
// Worktree detection
// ============================================================================

/**
 * Check whether a given path is a git worktree (main or linked).
 */
export async function isWorktree(path: string): Promise<boolean> {
  const result = await git(["rev-parse", "--git-dir"], path);
  return result.exitCode === 0;
}

/**
 * Find the absolute path of the main (primary) worktree.
 * Returns null if the current directory is not inside a git repo.
 */
export async function getMainWorktreePath(cwd?: string): Promise<string | null> {
  // `git worktree list --porcelain` always lists the main worktree first
  const result = await git(["worktree", "list", "--porcelain"], cwd);
  if (result.exitCode !== 0) return null;

  const lines = result.stdout.split("\n");
  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      return line.slice("worktree ".length).trim();
    }
  }
  return null;
}

// ============================================================================
// Worktree listing
// ============================================================================

/**
 * Parse `git worktree list --porcelain` output into structured WorktreeInfo records.
 *
 * Porcelain format example:
 *   worktree /path/to/main
 *   HEAD abc123
 *   branch refs/heads/main
 *
 *   worktree /path/to/linked
 *   HEAD def456
 *   branch refs/heads/feat-x
 *   locked reason
 */
export async function listWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
  const result = await git(["worktree", "list", "--porcelain"], cwd);
  if (result.exitCode !== 0) return [];

  const worktrees: WorktreeInfo[] = [];
  const blocks = result.stdout.split("\n\n").filter(Boolean);
  let isFirst = true;

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const info: Partial<WorktreeInfo> & { path: string; head: string } = {
      path:       "",
      head:       "",
      branch:     null,
      isBare:     false,
      isLocked:   false,
      isPrunable: false,
      isMain:     false,
    };

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        info.path = line.slice("worktree ".length).trim();
      } else if (line.startsWith("HEAD ")) {
        info.head = line.slice("HEAD ".length).trim();
      } else if (line.startsWith("branch ")) {
        // Convert refs/heads/name -> name
        info.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
      } else if (line === "bare") {
        info.isBare = true;
      } else if (line.startsWith("locked")) {
        info.isLocked = true;
      } else if (line.startsWith("prunable")) {
        info.isPrunable = true;
      }
    }

    if (info.path) {
      info.isMain = isFirst;
      worktrees.push(info as WorktreeInfo);
    }

    isFirst = false;
  }

  return worktrees;
}

// ============================================================================
// Worktree management
// ============================================================================

/**
 * Create a new linked worktree.
 *
 * @param path    Absolute or relative path for the new worktree directory.
 * @param opts    Options controlling branch creation/checkout.
 */
export async function addWorktree(
  path: string,
  opts: AddWorktreeOptions = {},
  cwd?: string,
): Promise<{ success: boolean; error?: string }> {
  // Build args in a single linear flow matching git worktree add syntax:
  // git worktree add [-b <branch>] [--detach] [--force] <path> [<commit-ish>]
  const args = ["worktree", "add"];

  if (opts.newBranch) args.push("-b", opts.newBranch);
  if (opts.detach) args.push("--detach");
  if (opts.force) args.push("--force");

  args.push(path);

  // <commit-ish>: use opts.from if provided, otherwise fall back to opts.branch
  // (existing branch checkout passes branch name as the commit-ish)
  if (opts.from) {
    args.push(opts.from);
  } else if (opts.branch) {
    args.push(opts.branch);
  }

  const result = await git(args, cwd);
  return result.exitCode === 0
    ? { success: true }
    : { success: false, error: result.stderr || result.stdout };
}

/**
 * Remove a linked worktree.
 *
 * @param path   Path to the worktree to remove.
 * @param force  If true, pass --force to remove even with uncommitted changes.
 */
export async function removeWorktree(
  path: string,
  force = false,
  cwd?: string,
): Promise<{ success: boolean; error?: string }> {
  const args = ["worktree", "remove"];
  if (force) args.push("--force");
  args.push(path);

  const result = await git(args, cwd);
  return result.exitCode === 0
    ? { success: true }
    : { success: false, error: result.stderr || result.stdout };
}

/**
 * Prune stale worktree admin files.
 */
export async function pruneWorktrees(cwd?: string): Promise<void> {
  await git(["worktree", "prune"], cwd);
}

// ============================================================================
// Branch utilities
// ============================================================================

/**
 * Check whether a local branch exists.
 */
export async function branchExists(branch: string, cwd?: string): Promise<boolean> {
  const result = await git(["rev-parse", "--verify", `refs/heads/${branch}`], cwd);
  return result.exitCode === 0;
}

/**
 * Delete a local branch.
 *
 * @param force  Use -D instead of -d (delete even if unmerged).
 */
export async function deleteBranch(
  branch: string,
  force = false,
  cwd?: string,
): Promise<{ success: boolean; error?: string }> {
  const flag = force ? "-D" : "-d";
  const result = await git(["branch", flag, branch], cwd);
  return result.exitCode === 0
    ? { success: true }
    : { success: false, error: result.stderr || result.stdout };
}

// ============================================================================
// gitignore verification
// ============================================================================

/**
 * Check whether a file path is covered by .gitignore.
 * Uses `git check-ignore` — returns true if the file is ignored.
 */
export async function isGitIgnored(filePath: string, cwd?: string): Promise<boolean> {
  const result = await git(["check-ignore", "-q", filePath], cwd);
  return result.exitCode === 0;
}

/**
 * Get git status of uncommitted changes in a directory.
 * Returns true if the working tree is clean (no uncommitted changes).
 */
export async function isCleanWorkingTree(cwd?: string): Promise<boolean> {
  const result = await git(["status", "--porcelain"], cwd);
  if (result.exitCode !== 0) return false;
  return result.stdout.trim() === "";
}
