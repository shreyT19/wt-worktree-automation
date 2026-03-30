/**
 * wt setup [path] [options]
 *
 * Runs the setup pipeline on an existing worktree (or current directory).
 * This is also the command invoked by Claude Code hooks.
 */

import path from "node:path";
import fs from "node:fs/promises";
import { logger } from "../utils/logger.ts";
import type { ParsedFlags } from "../index.ts";
import {
  getRepoRoot,
  getMainWorktreePath,
} from "../core/git.ts";
import { loadConfig, loadGlobalConfig, mergeConfig } from "../core/config.ts";
import { detectProjectTypes } from "../core/detector.ts";
import { installDeps } from "../core/installer.ts";
import { setupEnvFiles } from "../core/env.ts";
import { readStatus, writeStatus, isSetupDone } from "../core/status.ts";
import type { WtStatus, EcosystemType, DepStatusEntry, EnvStatusEntry } from "../core/types.ts";

const HELP = `
wt setup [path] [options]

Run the setup pipeline on an existing worktree. This is what Claude Code hooks
call automatically after 'git worktree add'.

ARGUMENTS:
    [path]              Path to the worktree to set up (default: current dir)

OPTIONS:
    --force             Re-run even if already set up
    --clean             Remove node_modules / .venv before reinstalling
    --no-deps           Skip dependency installation
    --no-env            Skip .env file setup
    --no-hooks          Skip pre/post hooks

EXAMPLES:
    wt setup                              Set up current directory
    wt setup ../myrepo-feat-billing       Set up a specific worktree
    wt setup --force                      Re-run after .worktreerc changes
    wt setup --clean --force              Clean reinstall
`.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function cleanArtifacts(worktreePath: string): Promise<void> {
  const targets = [
    path.join(worktreePath, "node_modules"),
    path.join(worktreePath, ".venv"),
  ];
  for (const target of targets) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      logger.debug(`Removed ${target}`);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export default async function setupCommand(
  args: string[],
  flags: ParsedFlags,
): Promise<number> {
  if (flags.help) {
    logger.info(HELP);
    return 0;
  }

  const targetDir = args[0]
    ? path.resolve(args[0].replace(/^~/, process.env.HOME ?? "~"))
    : process.cwd();

  const force = flags.force === true;
  const clean = flags.clean === true;
  const skipDeps = flags["no-deps"] === true;
  const skipEnv = flags["no-env"] === true;
  const skipHooks = flags["no-hooks"] === true;

  // --- Validate directory ------------------------------------------------
  try {
    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) {
      logger.error(`Not a directory: ${targetDir}`);
      return 1;
    }
  } catch {
    logger.error(`Directory does not exist: ${targetDir}`);
    return 1;
  }

  // --- Check if setup already done (skip unless --force) ----------------
  if (!force) {
    const done = await isSetupDone(targetDir);
    if (done) {
      const status = await readStatus(targetDir);
      logger.info(`Already set up (${status?.overall ?? "ready"}) — use --force to re-run.`);
      return 0;
    }
  }

  // --- Resolve repo root and determine if this is a worktree ------------
  const repoRootRaw = await getRepoRoot(targetDir);
  if (!repoRootRaw) {
    logger.error(`Not inside a git repository: ${targetDir}`);
    return 1;
  }
  const repoRoot: string = repoRootRaw;

  logger.info(`Setting up worktree: ${targetDir}`);

  // --- Load config -------------------------------------------------------
  const globalConfig = await loadGlobalConfig();
  const localConfig = await loadConfig(repoRoot);
  const config = mergeConfig(globalConfig, localConfig);

  // --- Optional clean ----------------------------------------------------
  if (clean) {
    logger.info("Cleaning previous artifacts...");
    await cleanArtifacts(targetDir);
  }

  const totalSteps = (skipDeps ? 0 : 1) + (skipEnv ? 0 : 1) + 1; // detect + deps? + env?
  let currentStep = 0;

  // --- Detect project types ----------------------------------------------
  const detectDone = logger.step(++currentStep, totalSteps + 1, "Detecting project type");
  const detectStart = Date.now();
  const ecosystems = await detectProjectTypes(targetDir);
  const ecoNames = ecosystems.map((e) => `${e.type}(${e.pm})`);
  detectDone(ecoNames.length ? ecoNames.join(", ") : "none", Date.now() - detectStart);

  // --- Run pre_install hooks --------------------------------------------
  if (!skipHooks && config.hooks.pre_install.length > 0) {
    logger.info("Running pre_install hooks...");
    for (const cmd of config.hooks.pre_install) {
      logger.debug(`  hook: ${cmd}`);
      const proc = Bun.spawn(["sh", "-c", cmd], {
        cwd: targetDir,
        stdout: "inherit",
        stderr: "inherit",
      });
      const code = await proc.exited;
      if (code !== 0) {
        logger.warn(`pre_install hook exited with code ${code}: ${cmd}`);
      }
    }
  }

  // --- Install deps ------------------------------------------------------
  const depsStatus: Partial<Record<EcosystemType, DepStatusEntry>> = {};
  let depsOverall: "ok" | "partial" | "fail" | "skip" = "skip";

  if (!skipDeps && ecosystems.length > 0) {
    const depsDone = logger.step(++currentStep, totalSteps + 1, "Installing dependencies");
    const depsStart = Date.now();
    const results = await installDeps(targetDir, ecosystems, config);
    const failed = results.filter((r) => !r.success && !r.skipped);

    for (const r of results) {
      depsStatus[r.ecosystem] = {
        status: r.skipped ? "skip" : r.success ? "ok" : "fail",
        pm: r.pm,
        durationMs: r.durationMs,
        error: r.error,
      };
    }

    if (failed.length > 0) {
      depsOverall = failed.length === results.length ? "fail" : "partial";
      depsDone(`partial (${failed.length}/${results.length} failed)`, Date.now() - depsStart);
      for (const f of failed) {
        logger.warn(`  ${f.ecosystem}: ${f.error ?? "install failed"}`);
      }
    } else {
      depsOverall = "ok";
      depsDone("done", Date.now() - depsStart);
    }
  } else if (!skipDeps) {
    logger.warn("No ecosystems detected — skipping dependency install.");
    depsOverall = "skip";
  }

  // --- Run post_install hooks -------------------------------------------
  if (!skipHooks && config.hooks.post_install.length > 0) {
    logger.info("Running post_install hooks...");
    for (const cmd of config.hooks.post_install) {
      logger.debug(`  hook: ${cmd}`);
      const proc = Bun.spawn(["sh", "-c", cmd], {
        cwd: targetDir,
        stdout: "inherit",
        stderr: "inherit",
      });
      const code = await proc.exited;
      if (code !== 0) {
        logger.warn(`post_install hook exited with code ${code}: ${cmd}`);
      }
    }
  }

  // --- Setup env files --------------------------------------------------
  let envStatus: EnvStatusEntry = {
    strategy: config.env.strategy,
    files: [],
    status: "skip",
  };

  if (!skipEnv) {
    const mainPath: string = (await getMainWorktreePath(repoRoot)) ?? repoRoot;

    const envDone = logger.step(++currentStep, totalSteps + 1, "Setting up env files");
    const envStart = Date.now();
    const results = await setupEnvFiles(targetDir, mainPath, config);
    const failed = results.filter((r) => !r.success && !r.skipped);
    const processed = results.filter((r) => !r.skipped).map((r) => r.file);

    envStatus = {
      strategy: config.env.strategy,
      files: processed,
      status: failed.length > 0
        ? (failed.length === results.length ? "fail" : "partial")
        : "ok",
    };

    if (failed.length > 0) {
      envDone(`partial (${failed.length} failed)`, Date.now() - envStart);
      for (const f of failed) {
        logger.warn(`  ${f.file}: ${f.error ?? "setup failed"}`);
      }
    } else {
      envDone(`${processed.length} files`, Date.now() - envStart);
    }
  }

  // --- Run post_setup hooks --------------------------------------------
  if (!skipHooks && config.hooks.post_setup.length > 0) {
    logger.info("Running post_setup hooks...");
    for (const cmd of config.hooks.post_setup) {
      logger.debug(`  hook: ${cmd}`);
      const proc = Bun.spawn(["sh", "-c", cmd], {
        cwd: targetDir,
        stdout: "inherit",
        stderr: "inherit",
      });
      const code = await proc.exited;
      if (code !== 0) {
        logger.warn(`post_setup hook exited with code ${code}: ${cmd}`);
      }
    }
  }

  // --- Determine overall status ----------------------------------------
  const hasFailure =
    depsOverall === "fail" ||
    depsOverall === "partial" ||
    envStatus.status === "fail" ||
    envStatus.status === "partial";

  const overall = hasFailure ? "partial" : "ready";

  // --- Write status file -----------------------------------------------
  const statusPayload: WtStatus = {
    version: 1,
    setupAt: new Date().toISOString(),
    ecosystems: ecosystems.map((e) => e.type),
    deps: depsStatus,
    env: envStatus,
    hooks: {},
    overall,
  };

  await writeStatus(targetDir, statusPayload);

  logger.blank();
  if (overall === "ready") {
    logger.success(`Setup complete: ${targetDir}`);
  } else {
    logger.warn(`Setup completed with warnings (overall: ${overall})`);
    logger.info(`  To retry:  wt setup --force ${targetDir}`);
  }

  return overall === "ready" ? 0 : 2;
}
