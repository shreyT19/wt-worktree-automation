/**
 * wt list [options]
 *
 * Lists all git worktrees with their setup status from .wt-status.json.
 */

import { logger } from "../utils/logger.ts";
import type { ParsedFlags } from "../index.ts";
import { listWorktrees } from "../core/git.ts";
import { readStatus } from "../core/status.ts";
import type { WorktreeInfo, WtStatus, SetupOverallStatus } from "../core/types.ts";

const HELP = `
wt list [options]

List all git worktrees and their setup status.

OPTIONS:
    --json          Output as JSON (for scripting)
    --status        Show detailed status per worktree

EXAMPLES:
    wt list
    wt list --json
    wt list --status
`.trim();

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str.padEnd(maxLen);
  return str.slice(0, maxLen - 1) + "…";
}

function statusBadge(s: SetupOverallStatus | null): string {
  switch (s) {
    case "ready":   return "ready";
    case "partial": return "partial";
    case "failed":  return "failed";
    case "pending": return "pending";
    default:        return "-";
  }
}

function depsCell(status: WtStatus | null, isBare: boolean): string {
  if (isBare) return "-";
  if (!status) return "?";
  const entries = Object.values(status.deps);
  if (entries.length === 0) return "skip";
  const failed = entries.filter((e) => e.status === "fail");
  if (failed.length === entries.length) return "fail";
  if (failed.length > 0) return "partial";
  const allSkip = entries.every((e) => e.status === "skip");
  if (allSkip) return "skip";
  return "ok";
}

function envCell(status: WtStatus | null, isBare: boolean): string {
  if (isBare) return "-";
  if (!status) return "?";
  return status.env.status ?? "-";
}

interface RowData {
  branch: string;
  path: string;
  deps: string;
  env: string;
  status: string;
  isCurrent: boolean;
  raw?: WtStatus | null;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export default async function listCommand(
  _args: string[],
  flags: ParsedFlags,
): Promise<number> {
  if (flags.help) {
    logger.info(HELP);
    return 0;
  }

  const asJson = flags.json === true;
  const showDetail = flags.status === true;

  const worktrees = await listWorktrees(process.cwd());

  if (worktrees.length === 0) {
    logger.info("No worktrees found.");
    return 0;
  }

  // Read status for each worktree
  const rows: RowData[] = await Promise.all(
    worktrees.map(async (wt) => {
      const status = wt.isBare ? null : await readStatus(wt.path);
      const branch = wt.branch ?? "(detached HEAD)";
      return {
        branch,
        path: wt.path,
        deps: depsCell(status, wt.isBare),
        env: envCell(status, wt.isBare),
        status: wt.isBare ? "(bare)" : statusBadge(status?.overall ?? null),
        isCurrent: wt.path === process.cwd(),
        raw: status,
      };
    }),
  );

  // --- JSON output -------------------------------------------------------
  if (asJson) {
    const out = rows.map((r) => ({
      branch: r.branch,
      path: r.path,
      deps: r.deps,
      env: r.env,
      status: r.status,
      detail: r.raw ?? null,
    }));
    process.stdout.write(JSON.stringify(out, null, 2) + "\n");
    return 0;
  }

  // --- Table output -------------------------------------------------------
  const BRANCH_W = 30;
  const PATH_W = 36;
  const CELL_W = 8;

  const header =
    "  " +
    truncate("BRANCH", BRANCH_W) +
    "  " +
    truncate("PATH", PATH_W) +
    "  " +
    "DEPS    " +
    "ENV     " +
    "STATUS";

  const divider = "  " + "-".repeat(BRANCH_W + PATH_W + CELL_W * 2 + 20);

  logger.info(header);
  logger.info(divider);

  for (const row of rows) {
    const prefix = row.isCurrent ? "> " : "  ";
    const line =
      prefix +
      truncate(row.branch, BRANCH_W) +
      "  " +
      truncate(row.path, PATH_W) +
      "  " +
      row.deps.padEnd(CELL_W) +
      row.env.padEnd(CELL_W) +
      row.status;

    logger.info(line);

    if (showDetail && row.raw) {
      const s = row.raw;
      const ecos = s.ecosystems.join(", ") || "none";
      logger.info(`     ecosystems: ${ecos}`);
      for (const [eco, dep] of Object.entries(s.deps)) {
        logger.info(`     ${eco}: ${dep.pm} — ${dep.status}${dep.error ? ` (${dep.error})` : ""}`);
      }
      logger.info(`     env strategy: ${s.env.strategy}, files: ${s.env.files.length}`);
      logger.info(`     set up: ${s.setupAt}`);
    }
  }

  logger.info("");
  logger.info(`${worktrees.length} worktree${worktrees.length !== 1 ? "s" : ""}`);

  return 0;
}
