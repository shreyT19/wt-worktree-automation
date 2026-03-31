/**
 * wt list [options]
 *
 * Lists all git worktrees with their setup status from .wt-status.json.
 */

import pc from "picocolors";
import { logger } from "../utils/logger.ts";
import { table } from "../utils/ui.ts";
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

function statusBadge(s: SetupOverallStatus | null): string {
  switch (s) {
    case "ready":   return pc.green("ready");
    case "partial": return pc.yellow("partial");
    case "failed":  return pc.red("failed");
    case "pending": return pc.yellow("pending");
    default:        return pc.dim("-");
  }
}

function depsCell(status: WtStatus | null, isBare: boolean): string {
  if (isBare) return pc.dim("-");
  if (!status) return pc.dim("?");
  const entries = Object.values(status.deps);
  if (entries.length === 0) return pc.dim("skip");
  const failed = entries.filter((e) => e.status === "fail");
  if (failed.length === entries.length) return pc.red("fail");
  if (failed.length > 0) return pc.yellow("partial");
  const allSkip = entries.every((e) => e.status === "skip");
  if (allSkip) return pc.dim("skip");
  return pc.green("ok");
}

function envCell(status: WtStatus | null, isBare: boolean): string {
  if (isBare) return pc.dim("-");
  if (!status) return pc.dim("?");
  const raw = status.env.status ?? "-";
  switch (raw) {
    case "ok":      return pc.green("ok");
    case "partial": return pc.yellow("partial");
    case "fail":    return pc.red("fail");
    case "skip":    return pc.dim("skip");
    default:        return pc.dim(raw);
  }
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
    logger.verb("List", "no worktrees found");
    logger.hint("Create one with: wt add <branch>");
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
        status: wt.isBare ? pc.dim("(bare)") : statusBadge(status?.overall ?? null),
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

  // --- Table output using box-drawing table ------------------------------
  const tableHeaders = ["", "Branch", "Path", "Deps", "Env", "Status"];
  const tableRows = rows.map((row) => {
    const marker = row.isCurrent ? pc.cyan("\u2192") : " ";
    const branchCell = row.isCurrent ? pc.cyan(row.branch) : row.branch;
    return [marker, branchCell, row.path, row.deps, row.env, row.status];
  });

  logger.info(table(tableHeaders, tableRows));

  if (showDetail) {
    for (const row of rows) {
      if (!row.raw) continue;
      const s = row.raw;
      logger.blank();
      logger.verb("Detail", pc.cyan(row.branch));
      const ecos = s.ecosystems.join(", ") || "none";
      logger.detail(`ecosystems: ${ecos}`);
      for (const [eco, dep] of Object.entries(s.deps)) {
        logger.detail(`${eco}: ${dep.pm} \u2014 ${dep.status}${dep.error ? ` (${dep.error})` : ""}`);
      }
      logger.detail(`env strategy: ${s.env.strategy}, files: ${s.env.files.length}`);
      logger.detail(`set up: ${s.setupAt}`);
    }
  }

  logger.blank();
  logger.info(pc.dim(`${worktrees.length} worktree${worktrees.length !== 1 ? "s" : ""}`));

  return 0;
}
