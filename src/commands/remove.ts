/**
 * wt remove <branch> [options]
 *
 * Removes a git worktree cleanly: checks for uncommitted changes, runs
 * cleanup hooks, calls git worktree remove, and optionally deletes the branch.
 */

import path from "node:path";
import pc from "picocolors";
import { logger } from "../utils/logger.ts";
import type { ParsedFlags } from "../index.ts";
import {
  listWorktrees,
  removeWorktree,
  getRepoRoot,
} from "../core/git.ts";
import { loadConfig, loadGlobalConfig, mergeConfig } from "../core/config.ts";
import { exec } from "../utils/shell.ts";
import type { WorktreeInfo } from "../core/types.ts";

const HELP = `
wt remove <branch> [options]

Remove a git worktree cleanly.

ARGUMENTS:
    <branch>            Branch name or partial match (e.g. "feat" matches "shreyansh/feat-billing")

OPTIONS:
    --force             Force removal even with uncommitted changes
    --keep-branch       Do not delete the git branch after removing the worktree

BEHAVIOR:
    1. Check for uncommitted changes (fail unless --force)
    2. Run cleanup hooks from .worktreerc (if any)
    3. git worktree remove
    4. git branch -d <branch> (unless --keep-branch)

EXAMPLES:
    wt remove feat-billing
    wt remove feat-billing --force
    wt remove feat-billing --keep-branch
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findWorktreeByBranch(
  worktrees: WorktreeInfo[],
  query: string,
): WorktreeInfo | null {
  // Exact match first
  const exact = worktrees.find((wt) => wt.branch === query);
  if (exact) return exact;

  // Partial suffix match: "feat" matches "shreyansh/feat-billing"
  const partial = worktrees.filter((wt) => {
    if (!wt.branch) return false;
    const parts = wt.branch.split("/");
    return parts.some((p) => p.toLowerCase().includes(query.toLowerCase()));
  });

  if (partial.length === 1) return partial[0]!;

  if (partial.length > 1) {
    logger.error(`Ambiguous branch name '${query}'. Matching worktrees:`);
    for (const wt of partial) {
      logger.detail(`${wt.branch}  (${wt.path})`);
    }
    return null;
  }

  return null;
}

async function hasUncommittedChanges(worktreePath: string): Promise<boolean> {
  const result = await exec(["git", "status", "--porcelain"], {
    cwd: worktreePath,
  });
  if (result.exitCode !== 0) return false; // can't determine
  return result.stdout.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export default async function removeCommand(
  args: string[],
  flags: ParsedFlags,
): Promise<number> {
  if (flags.help) {
    logger.info(HELP);
    return 0;
  }

  const query = args[0];
  if (!query) {
    logger.error("Missing required argument: <branch>");
    logger.hint("Usage: wt remove <branch>");
    return 1;
  }

  const force = flags.force === true;
  const keepBranch = flags["keep-branch"] === true;

  // --- Resolve repo root -----------------------------------------------
  const repoRootRaw = await getRepoRoot(process.cwd());
  if (!repoRootRaw) {
    logger.error("Not inside a git repository.");
    logger.hint("Run this command from inside a git repository.");
    return 1;
  }
  const repoRoot: string = repoRootRaw;

  // --- Find the target worktree ----------------------------------------
  const worktrees = await listWorktrees(repoRoot);

  const target = findWorktreeByBranch(worktrees, query);
  if (!target) {
    logger.error(`No worktree found matching: '${query}'`);
    logger.hint("Available worktrees:");
    for (const wt of worktrees) {
      logger.detail(`${wt.branch ?? "(detached)"}  ->  ${wt.path}`);
    }
    return 1;
  }

  if (target.isMain) {
    logger.error("Cannot remove the main worktree.");
    logger.hint("The main worktree is managed by git directly.");
    return 1;
  }

  // --- Check for uncommitted changes -----------------------------------
  logger.verb("Checking", "clean working tree");
  const dirty = await hasUncommittedChanges(target.path);
  if (dirty && !force) {
    logger.error(`Worktree has uncommitted changes: ${target.path}`);
    logger.hint("Commit, stash, or use --force to remove anyway.");
    return 1;
  }

  if (dirty && force) {
    logger.warn("Removing worktree with uncommitted changes (--force).");
  }

  // --- Run cleanup hooks -----------------------------------------------
  const globalConfig = await loadGlobalConfig();
  const localConfig = await loadConfig(repoRoot);
  const config = mergeConfig(globalConfig, localConfig);

  // There are no dedicated "cleanup" hooks in the schema, but we respect
  // any post_setup hooks that might serve as teardown scripts in a future
  // extension. For now we log and skip.
  logger.debug("No cleanup hooks configured.");

  // --- git worktree remove ---------------------------------------------
  {
    logger.verb("Removing", `worktree at ${pc.dim(target.path)}`);
    try {
      const removeResult = await removeWorktree(target.path, force, repoRoot);
      if (!removeResult.success) {
        throw new Error(removeResult.error ?? "git worktree remove failed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to remove worktree: ${message}`);
      logger.hint(`To force removal: wt remove ${query} --force`);
      return 1;
    }
  }

  // --- Delete the branch -----------------------------------------------
  if (!keepBranch && target.branch) {
    logger.verb("Deleting", `branch ${pc.cyan(target.branch)}`);
    // Use -D only when the caller explicitly passed --force; otherwise use -d
    // so that branches with unmerged changes are not silently discarded.
    const deleteFlag = force ? "-D" : "-d";
    const result = await exec(["git", "branch", deleteFlag, target.branch], {
      cwd: repoRoot,
    });

    if (result.exitCode !== 0) {
      logger.warn(`Could not delete branch '${target.branch}': ${result.stderr.trim()}`);
      if (!force) {
        logger.hint(`The branch has unmerged changes. Use 'wt remove ${query} --force' to force-delete it.`);
      } else {
        logger.hint(`To delete manually: git branch -D ${target.branch}`);
      }
      return 2; // partial success
    }
  }

  logger.success(`Worktree removed`);
  return 0;
}
