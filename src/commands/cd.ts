/**
 * wt cd <branch>
 *
 * Prints the absolute path to a worktree so the user can cd into it:
 *
 *   cd "$(wt cd feat)"
 *
 * Supports partial branch name matching. If multiple worktrees match, lists
 * them and exits with an error.
 */

import { logger } from "../utils/logger.ts";
import type { ParsedFlags } from "../index.ts";
import { listWorktrees, getRepoRoot } from "../core/git.ts";
import type { WorktreeInfo } from "../core/types.ts";

const HELP = `
wt cd <branch>

Print the path to a worktree so you can cd into it.

USAGE:
    cd "$(wt cd <branch>)"

    # Or with a shell function in ~/.zshrc / ~/.bashrc:
    wtcd() { cd "$(wt cd "$1")" }

ARGUMENTS:
    <branch>        Branch name (partial match supported)
                    "feat" matches "shreyansh/feat-billing"

EXAMPLES:
    cd "$(wt cd feat-billing)"
    cd "$(wt cd feat)"          # partial match
`.trim();

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function scoreMatch(branch: string, query: string): number {
  const q = query.toLowerCase();
  const b = branch.toLowerCase();

  // Exact match
  if (b === q) return 100;

  // Exact match on the short part (after last /)
  const short = b.split("/").pop() ?? b;
  if (short === q) return 90;

  // Prefix match on short part
  if (short.startsWith(q)) return 70;

  // Substring match anywhere in branch
  if (b.includes(q)) return 50;

  // Partial word match (e.g. "bill" matches "feat-billing")
  if (short.includes(q)) return 40;

  return -1;
}

function findMatches(
  worktrees: WorktreeInfo[],
  query: string,
): { wt: WorktreeInfo; score: number }[] {
  const scored = worktrees
    .filter((wt) => wt.branch !== null)
    .map((wt) => ({ wt, score: scoreMatch(wt.branch!, query) }))
    .filter((r) => r.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export default async function cdCommand(
  args: string[],
  flags: ParsedFlags,
): Promise<number> {
  if (flags.help) {
    // Help goes to stderr so it doesn't pollute the path output
    process.stderr.write(HELP + "\n");
    return 0;
  }

  const query = args[0];
  if (!query) {
    process.stderr.write("wt cd: missing argument <branch>\n");
    process.stderr.write("Usage: cd \"$(wt cd <branch>)\"\n");
    return 1;
  }

  // --- Resolve repo root -----------------------------------------------
  const repoRoot = await getRepoRoot(process.cwd());
  if (!repoRoot) {
    process.stderr.write("wt cd: not inside a git repository\n");
    return 1;
  }

  // --- List worktrees --------------------------------------------------
  const worktrees = await listWorktrees(repoRoot);

  const matches = findMatches(worktrees, query);

  if (matches.length === 0) {
    process.stderr.write(`wt cd: no worktree found matching '${query}'\n\n`);
    process.stderr.write("Available branches:\n");
    for (const wt of worktrees) {
      if (wt.branch) {
        process.stderr.write(`  ${wt.branch}\n`);
      }
    }
    return 1;
  }

  if (matches.length === 1 || matches[0]!.score > matches[1]!.score + 20) {
    // Unambiguous best match — print the path (raw, no trailing newline noise)
    process.stdout.write(matches[0]!.wt.path + "\n");
    return 0;
  }

  // Multiple equally-good matches — list them and ask user to be specific
  process.stderr.write(`wt cd: ambiguous match for '${query}'. Did you mean:\n\n`);
  for (const { wt } of matches) {
    process.stderr.write(`  ${wt.branch}  ->  ${wt.path}\n`);
  }
  process.stderr.write("\nBe more specific and try again.\n");
  return 1;
}
