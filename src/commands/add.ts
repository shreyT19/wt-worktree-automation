/**
 * wt add <branch> [options]
 *
 * Creates a new git worktree, then runs the full setup pipeline:
 * detect → install deps → setup env → run hooks.
 */

import path from "node:path";
import pc from "picocolors";
import { logger } from "../utils/logger.ts";
import { box, formatDuration } from "../utils/ui.ts";
import type { ParsedFlags } from "../index.ts";
import type { MergedConfig } from "../core/types.ts";
import {
  getRepoRoot,
  addWorktree,
  getMainWorktreePath,
  listWorktrees,
} from "../core/git.ts";
import { loadConfig, loadGlobalConfig, mergeConfig } from "../core/config.ts";
import { detectProjectTypes } from "../core/detector.ts";
import { installDeps } from "../core/installer.ts";
import { copyIgnoredDirs } from "../core/copier.ts";
import { setupEnvFiles } from "../core/env.ts";
import { writeStatus } from "../core/status.ts";

const HELP = `
wt add <branch> [options]

Create a new git worktree and run the full setup pipeline.

ARGUMENTS:
    <branch>            Branch name. Auto-prefixed with user prefix if configured.
                        Example: "feat-billing" -> "shreyansh/feat-billing"

OPTIONS:
    --from <base>         Base branch/commit to create the new branch from
                          (default: current branch)
    --copy-from <branch>  Copy node_modules/target from another worktree instead
                          of running a fresh install.  Skips install when the
                          lockfiles match; falls back to normal install otherwise.
    --no-deps             Skip dependency installation
    --no-env              Skip .env file setup
    --no-hooks            Skip pre/post hooks
    --bare                Create a bare worktree (no branch checkout)
    --path <dir>          Override worktree directory path
    --dry-run             Show what would be done without executing
    --existing            Checkout an existing branch rather than creating a new one

EXAMPLES:
    wt add feat-billing                          Create worktree + branch from current
    wt add feat-billing --from main              Branch from main
    wt add feat-ui --copy-from main              Copy deps from main worktree (fast)
    wt add fix-auth --no-deps                    Skip dep install (quick text fix)
    wt add feat-ui --path ~/worktrees/ui         Custom path
    wt add release/v2 --existing                 Checkout existing branch
`.trim();

// ---------------------------------------------------------------------------
// Branch name helpers
// ---------------------------------------------------------------------------

function applyBranchPrefix(branch: string, prefix: string | null): string {
  if (!prefix) return branch;
  // Don't double-prefix
  if (branch.startsWith(`${prefix}/`)) return branch;
  // Don't prefix if branch already contains a slash (e.g. release/v2)
  if (branch.includes("/")) return branch;
  return `${prefix}/${branch}`;
}

function shortBranch(branch: string): string {
  // "shreyansh/feat-billing" -> "feat-billing"
  const parts = branch.split("/");
  return parts[parts.length - 1] ?? branch;
}

function resolveWorktreePath(
  branch: string,
  config: MergedConfig,
  customPath: string | undefined,
  repoRoot: string,
): string {
  if (customPath) {
    return path.resolve(customPath.replace(/^~/, process.env.HOME ?? "~"));
  }

  const baseDir = config.worktree.base_dir;
  const namePattern = config.worktree.name_pattern;
  const short = shortBranch(branch).replace(/\//g, "-");

  // Resolve base dir (support ~ and env vars)
  const resolvedBase = baseDir.replace(/^~/, process.env.HOME ?? "~");

  // Derive repo name from the actual repo root (not process.cwd which may be a worktree subdir)
  const repoName = path.basename(repoRoot);
  const dirName = namePattern
    .replace("{repo}", repoName)
    .replace("{branch}", branch.replace(/\//g, "-"))
    .replace("{short_branch}", short);

  return path.resolve(resolvedBase, dirName);
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export default async function addCommand(
  args: string[],
  flags: ParsedFlags,
): Promise<number> {
  if (flags.help) {
    logger.info(HELP);
    return 0;
  }

  const branch = args[0];
  if (!branch) {
    logger.error("Missing required argument: <branch>");
    logger.hint("Usage: wt add <branch> [options]");
    logger.hint("Run 'wt add --help' for full usage.");
    return 1;
  }

  const isDryRun = flags["dry-run"] === true;
  const skipDeps = flags["no-deps"] === true;
  const skipEnv = flags["no-env"] === true;
  const skipHooks = flags["no-hooks"] === true;
  const useExisting = flags.existing === true;
  const fromBase = typeof flags.from === "string" ? flags.from : undefined;
  const copyFrom = typeof flags["copy-from"] === "string" ? flags["copy-from"] : undefined;
  const customPath = typeof flags.path === "string" ? flags.path : undefined;
  const execCmd = typeof flags.exec === "string" ? flags.exec : undefined;

  // --- Load config -------------------------------------------------------
  const repoRootRaw = await getRepoRoot(process.cwd());
  if (!repoRootRaw) {
    logger.error("Not inside a git repository.");
    logger.hint("Run this command from inside a git repository.");
    return 1;
  }
  const repoRoot: string = repoRootRaw;

  const globalConfig = await loadGlobalConfig();
  const localConfig = await loadConfig(repoRoot);
  const config = mergeConfig(globalConfig, localConfig);

  // --- Resolve branch and path -------------------------------------------
  const fullBranch = applyBranchPrefix(branch, config.user.branch_prefix);
  const worktreePath = resolveWorktreePath(fullBranch, config, customPath, repoRoot);

  logger.verb("Creating", `worktree for branch ${pc.cyan(fullBranch)}`);
  logger.detail(`path: ${worktreePath}`);
  if (fromBase) logger.detail(`from: ${fromBase}`);

  if (isDryRun) {
    logger.blank();
    logger.verb("Dry run", "no changes made", pc.yellow);
    logger.detail(`Would run: git worktree add ${worktreePath} ${useExisting ? fullBranch : `-b ${fullBranch} ${fromBase ?? "HEAD"}`}`);
    return 0;
  }

  // --- Create the worktree -----------------------------------------------
  const overallStart = Date.now();

  // Step 1: git worktree add
  {
    logger.verb("Creating", `worktree at ${pc.dim(worktreePath)}`);
    try {
      const addResult = await addWorktree(
        worktreePath,
        {
          ...(useExisting ? { branch: fullBranch } : { newBranch: fullBranch }),
          from: fromBase,
        },
        repoRoot,
      );
      if (!addResult.success) {
        throw new Error(addResult.error ?? "git worktree add failed");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to create worktree: ${message}`);
      logger.hint(`To retry setup later:  wt setup ${worktreePath}`);
      logger.hint(`To remove the worktree: wt remove ${fullBranch}`);
      return 1;
    }
  }

  // Step 2: Detect project types
  logger.verb("Detecting", "project type");
  const ecosystems = await detectProjectTypes(worktreePath);
  const ecoNames = ecosystems.map((e) => `${e.type}(${e.pm})`);
  if (ecoNames.length > 0) {
    logger.detail(ecoNames.join(", "));
  } else {
    logger.detail("none detected");
  }

  // Step 3: Install deps (or copy from another worktree)
  let depsLabel = "skipped";
  if (!skipDeps && ecosystems.length > 0) {
    let didCopy = false;

    if (copyFrom) {
      // Resolve source worktree path: accept a branch name or a direct path
      const worktrees = await listWorktrees(repoRoot);
      const sourceWorktree = worktrees.find(
        (wt) =>
          wt.branch === copyFrom ||
          wt.branch === `${config.user.branch_prefix}/${copyFrom}` ||
          wt.path === copyFrom,
      );

      if (!sourceWorktree) {
        logger.warn(`--copy-from: no worktree found for '${copyFrom}' — falling back to normal install`);
      } else {
        logger.verb("Copying", `deps from ${pc.cyan(copyFrom)}`);
        const copyResults = await copyIgnoredDirs(sourceWorktree.path, worktreePath, ecosystems);

        const copied = copyResults.filter((r) => r.success);
        const skipped = copyResults.filter((r) => !r.success && r.skipped);
        const failed = copyResults.filter((r) => !r.success && !r.skipped);

        if (copied.length > 0) {
          depsLabel = copied.map((r) => `${r.dir} (${r.duration}ms)`).join(", ");
          logger.detail(depsLabel);
          // Only skip normal install when node_modules was copied successfully
          const nodeModulesCopied = copied.some((r) => r.dir === "node_modules");
          if (nodeModulesCopied) didCopy = true;
        } else if (skipped.length > 0) {
          logger.detail(`skipped — ${skipped[0]!.skipped}`);
        } else {
          for (const f of failed) {
            logger.warn(`${f.dir}: copy failed`);
          }
        }
      }
    }

    if (!didCopy) {
      logger.verb("Installing", "dependencies");
      const results = await installDeps(worktreePath, ecosystems, config);
      const failed = results.filter((r) => !r.success && !r.skipped);
      if (failed.length > 0) {
        depsLabel = `partial (${failed.length} failed)`;
        logger.detail(depsLabel);
        for (const f of failed) {
          logger.warn(`${f.ecosystem}: ${f.error ?? "install failed"}`);
        }
      } else {
        depsLabel = "done";
      }
    }
  } else {
    if (ecosystems.length === 0) {
      logger.warn("No ecosystems detected — skipping dependency install.");
    }
    logger.verb("Installing", "dependencies " + pc.dim("(skipped)"), pc.dim);
  }

  // Step 4: Setup env files
  let envLabel = "skipped";
  if (!skipEnv) {
    const mainPathRaw = await getMainWorktreePath(repoRoot);
    const mainPath = mainPathRaw ?? repoRoot;
    logger.verb("Linking", "env files");
    const results = await setupEnvFiles(worktreePath, mainPath, config);
    const failed = results.filter((r) => !r.success && !r.skipped);
    const processed = results.filter((r) => !r.skipped).length;
    if (failed.length > 0) {
      envLabel = `partial (${failed.length} failed)`;
      logger.detail(envLabel);
      for (const f of failed) {
        logger.warn(`${f.file}: ${f.error ?? "setup failed"}`);
      }
    } else {
      envLabel = `${processed} file${processed !== 1 ? "s" : ""}`;
    }
  } else {
    logger.verb("Linking", "env files " + pc.dim("(skipped)"), pc.dim);
  }

  // --- Write status file ------------------------------------------------
  await writeStatus(worktreePath, {
    version: 1,
    setupAt: new Date().toISOString(),
    ecosystems: [],
    deps: {},
    env: { strategy: config.env.strategy, files: [], status: "ok" },
    hooks: {},
    overall: "ready",
  });

  const elapsed = Date.now() - overallStart;

  // --- Summary box -------------------------------------------------------
  const summaryLines = [
    `${pc.bold("Branch")}   ${pc.cyan(fullBranch)}`,
    `${pc.bold("Path")}     ${worktreePath}`,
    `${pc.bold("Deps")}     ${depsLabel}`,
    `${pc.bold("Env")}      ${envLabel}`,
    `${pc.bold("Time")}     ${formatDuration(elapsed)}`,
  ];
  logger.blank();
  logger.info(box(summaryLines.join("\n"), { title: "Worktree ready" }));
  logger.blank();
  logger.hint(`cd "${worktreePath}"`);

  // --- Run --exec command in the new worktree ----------------------------
  if (execCmd) {
    logger.blank();
    logger.verb("Running", execCmd);

    // Route through sh -c to support shell operators; simple commands work fine too.
    const argv = ["sh", "-c", execCmd];

    const proc = Bun.spawn(argv, {
      cwd: worktreePath,
      env: process.env as Record<string, string>,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      logger.warn(`exec command exited with code ${exitCode}`);
    }
    return exitCode;
  }

  return 0;
}
