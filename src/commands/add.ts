/**
 * wt add <branch> [options]
 *
 * Creates a new git worktree, then runs the full setup pipeline:
 * detect → install deps → setup env → run hooks.
 */

import path from "node:path";
import { logger } from "../utils/logger.ts";
import type { ParsedFlags } from "../index.ts";
import type { MergedConfig } from "../core/types.ts";
import {
  getRepoRoot,
  addWorktree,
  getMainWorktreePath,
} from "../core/git.ts";
import { loadConfig, loadGlobalConfig, mergeConfig } from "../core/config.ts";
import { detectProjectTypes } from "../core/detector.ts";
import { installDeps } from "../core/installer.ts";
import { setupEnvFiles } from "../core/env.ts";
import { writeStatus } from "../core/status.ts";

const HELP = `
wt add <branch> [options]

Create a new git worktree and run the full setup pipeline.

ARGUMENTS:
    <branch>            Branch name. Auto-prefixed with user prefix if configured.
                        Example: "feat-billing" -> "shreyansh/feat-billing"

OPTIONS:
    --from <base>       Base branch/commit to create the new branch from
                        (default: current branch)
    --no-deps           Skip dependency installation
    --no-env            Skip .env file setup
    --no-hooks          Skip pre/post hooks
    --bare              Create a bare worktree (no branch checkout)
    --path <dir>        Override worktree directory path
    --dry-run           Show what would be done without executing
    --existing          Checkout an existing branch rather than creating a new one

EXAMPLES:
    wt add feat-billing                    Create worktree + branch from current
    wt add feat-billing --from main        Branch from main
    wt add fix-auth --no-deps             Skip dep install (quick text fix)
    wt add feat-ui --path ~/worktrees/ui  Custom path
    wt add release/v2 --existing          Checkout existing branch
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
    logger.info("Usage: wt add <branch> [options]");
    logger.info("Run 'wt add --help' for full usage.");
    return 1;
  }

  const isDryRun = flags["dry-run"] === true;
  const skipDeps = flags["no-deps"] === true;
  const skipEnv = flags["no-env"] === true;
  const skipHooks = flags["no-hooks"] === true;
  const useExisting = flags.existing === true;
  const fromBase = typeof flags.from === "string" ? flags.from : undefined;
  const customPath = typeof flags.path === "string" ? flags.path : undefined;

  // --- Load config -------------------------------------------------------
  const repoRootRaw = await getRepoRoot(process.cwd());
  if (!repoRootRaw) {
    logger.error("Not inside a git repository.");
    return 1;
  }
  const repoRoot: string = repoRootRaw;

  const globalConfig = await loadGlobalConfig();
  const localConfig = await loadConfig(repoRoot);
  const config = mergeConfig(globalConfig, localConfig);

  // --- Resolve branch and path -------------------------------------------
  const fullBranch = applyBranchPrefix(branch, config.user.branch_prefix);
  const worktreePath = resolveWorktreePath(fullBranch, config, customPath, repoRoot);

  logger.info(`Creating worktree for branch '${fullBranch}'`);
  logger.info(`  path: ${worktreePath}`);
  if (fromBase) logger.info(`  from: ${fromBase}`);

  if (isDryRun) {
    logger.info("");
    logger.info("Dry run — no changes made.");
    logger.info(`Would run: git worktree add ${worktreePath} ${useExisting ? fullBranch : `-b ${fullBranch} ${fromBase ?? "HEAD"}`}`);
    return 0;
  }

  // --- Create the worktree -----------------------------------------------
  // Steps: (1) create worktree, (2) detect project type,
  //        (3) install deps, (4) setup env files.
  // Skipped steps still count toward the total so the counter stays consistent.
  const totalSteps = 4;
  let step = 0;

  // Step 1: git worktree add
  {
    const done = logger.step(++step, totalSteps, "Creating worktree");
    const start = Date.now();
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
      done("done", Date.now() - start);
    } catch (err: unknown) {
      done("failed", Date.now() - start);
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to create worktree: ${message}`);
      logger.info(`To retry setup later:  wt setup ${worktreePath}`);
      logger.info(`To remove the worktree: wt remove ${fullBranch}`);
      return 1;
    }
  }

  // Step 2: Detect project types
  const detectDone = logger.step(++step, totalSteps, "Detecting project type");
  const detectStart = Date.now();
  const ecosystems = await detectProjectTypes(worktreePath);
  const ecoNames = ecosystems.map((e) => `${e.type}(${e.pm})`);
  detectDone(ecoNames.length ? ecoNames.join(", ") : "none detected", Date.now() - detectStart);

  // Step 3: Install deps
  if (!skipDeps && ecosystems.length > 0) {
    const depsDone = logger.step(++step, totalSteps, "Installing dependencies");
    const depsStart = Date.now();
    const results = await installDeps(worktreePath, ecosystems, config);
    const failed = results.filter((r) => !r.success && !r.skipped);
    if (failed.length > 0) {
      depsDone(`partial (${failed.length} failed)`, Date.now() - depsStart);
      for (const f of failed) {
        logger.warn(`  ${f.ecosystem}: ${f.error ?? "install failed"}`);
      }
    } else {
      depsDone("done", Date.now() - depsStart);
    }
  } else {
    if (ecosystems.length === 0) {
      logger.warn("No ecosystems detected — skipping dependency install.");
    }
    logger.step(++step, totalSteps, "Installing dependencies")("skipped");
  }

  // Step 4: Setup env files
  if (!skipEnv) {
    const mainPathRaw = await getMainWorktreePath(repoRoot);
    const mainPath = mainPathRaw ?? repoRoot;
    const envDone = logger.step(++step, totalSteps, "Setting up env files");
    const envStart = Date.now();
    const results = await setupEnvFiles(worktreePath, mainPath, config);
    const failed = results.filter((r) => !r.success && !r.skipped);
    if (failed.length > 0) {
      envDone(`partial (${failed.length} failed)`, Date.now() - envStart);
      for (const f of failed) {
        logger.warn(`  ${f.file}: ${f.error ?? "setup failed"}`);
      }
    } else {
      envDone(`${results.filter((r) => !r.skipped).length} files`, Date.now() - envStart);
    }
  } else {
    logger.step(++step, totalSteps, "Setting up env files")("skipped");
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

  logger.blank();
  logger.success(`Worktree ready at: ${worktreePath}`);
  logger.info(`  Branch: ${fullBranch}`);
  logger.info(`  cd into it:  cd "${worktreePath}"`);

  return 0;
}
