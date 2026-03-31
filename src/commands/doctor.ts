/**
 * wt doctor [path]
 *
 * Runs diagnostics and prints a checklist of pass/fail items.
 */

import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { logger } from "../utils/logger.ts";
import type { ParsedFlags } from "../index.ts";
import { getRepoRoot, getMainWorktreePath, listWorktrees } from "../core/git.ts";
import { loadConfig, loadGlobalConfig, mergeConfig } from "../core/config.ts";
import { exec } from "../utils/shell.ts";

const HELP = `
wt doctor [path]

Run diagnostics on your worktree setup.

ARGUMENTS:
    [path]          Path to check (default: current directory)

CHECKS:
    - Git version >= 2.5 (worktree support)
    - .worktreerc syntax is valid (if present)
    - Package managers are installed (bun, uv, npm, etc.)
    - .env files exist in the main worktree
    - Symlinks are not broken
    - Dependencies are installed
    - .gitignore covers .env files

EXAMPLES:
    wt doctor
    wt doctor ../myrepo-feat-billing
`.trim();

// ---------------------------------------------------------------------------
// Check result types
// ---------------------------------------------------------------------------

type CheckStatus = "pass" | "fail" | "warn" | "skip";

interface CheckResult {
  label: string;
  status: CheckStatus;
  detail?: string;
  fix?: string;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkGitVersion(): Promise<CheckResult> {
  const result = await exec(["git", "--version"]);
  if (result.exitCode !== 0) {
    return {
      label: "git installed",
      status: "fail",
      detail: "git not found in PATH",
      fix: "Install git: https://git-scm.com/downloads",
    };
  }

  // "git version 2.47.1" -> [2, 47, 1]
  const match = result.stdout.match(/git version (\d+)\.(\d+)\.?(\d*)/);
  if (!match) {
    return { label: "git version >= 2.5", status: "warn", detail: "Could not parse git version" };
  }

  const major = parseInt(match[1]!, 10);
  const minor = parseInt(match[2]!, 10);
  const ok = major > 2 || (major === 2 && minor >= 5);

  return {
    label: "git version >= 2.5 (worktree support)",
    status: ok ? "pass" : "fail",
    detail: result.stdout.trim(),
    fix: ok ? undefined : "Upgrade git to 2.5 or later",
  };
}

async function checkWorktreeRcSyntax(repoRoot: string): Promise<CheckResult> {
  const rcPath = path.join(repoRoot, ".worktreerc");
  try {
    await fs.access(rcPath);
  } catch {
    return { label: ".worktreerc syntax valid", status: "skip", detail: "No .worktreerc found" };
  }

  try {
    const { parse } = await import("smol-toml");
    const content = await fs.readFile(rcPath, "utf8");
    parse(content);
    return { label: ".worktreerc syntax valid", status: "pass", detail: rcPath };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      label: ".worktreerc syntax valid",
      status: "fail",
      detail: message,
      fix: `Fix syntax error in ${rcPath}`,
    };
  }
}

async function checkCommandAvailable(cmd: string): Promise<CheckResult> {
  const result = await exec(["which", cmd]);
  const found = result.exitCode === 0;
  return {
    label: `${cmd} installed`,
    status: found ? "pass" : "warn",
    detail: found ? result.stdout.trim() : `${cmd} not found in PATH`,
    fix: found ? undefined : `Install ${cmd}`,
  };
}

async function checkEnvFilesInMain(
  mainPath: string,
  patterns: string[],
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const pattern of patterns) {
    if (pattern.includes("*")) {
      results.push({
        label: `.env pattern '${pattern}'`,
        status: "skip",
        detail: "Glob patterns not checked in doctor",
      });
      continue;
    }
    const filePath = path.join(mainPath, pattern);
    try {
      await fs.access(filePath);
      results.push({ label: `.env file: ${pattern}`, status: "pass", detail: filePath });
    } catch {
      results.push({
        label: `.env file: ${pattern}`,
        status: "warn",
        detail: `Not found in main worktree: ${filePath}`,
        fix: `Create ${filePath} or remove it from env.patterns in .worktreerc`,
      });
    }
  }
  return results;
}

async function checkSymlinks(worktreePath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  try {
    const entries = await fs.readdir(worktreePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isSymbolicLink()) continue;
      const fullPath = path.join(worktreePath, entry.name);
      try {
        await fs.stat(fullPath); // follows symlink
        results.push({
          label: `symlink: ${entry.name}`,
          status: "pass",
          detail: fullPath,
        });
      } catch {
        const target = await fs.readlink(fullPath).catch(() => "unknown");
        results.push({
          label: `symlink: ${entry.name}`,
          status: "fail",
          detail: `Broken symlink -> ${target}`,
          fix: `Remove broken symlink: rm ${fullPath}`,
        });
      }
    }
  } catch {
    // not readable
  }
  return results;
}

async function checkDepsInstalled(worktreePath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // Node
  const nodeModules = path.join(worktreePath, "node_modules");
  const packageJson = path.join(worktreePath, "package.json");
  try {
    await fs.access(packageJson);
    try {
      await fs.access(nodeModules);
      results.push({ label: "node_modules present", status: "pass" });
    } catch {
      results.push({
        label: "node_modules present",
        status: "warn",
        detail: "package.json found but node_modules missing",
        fix: `Run: cd ${worktreePath} && bun install`,
      });
    }
  } catch {
    // no package.json — skip
  }

  // Python
  const pyproject = path.join(worktreePath, "pyproject.toml");
  const requirements = path.join(worktreePath, "requirements.txt");
  const venv = path.join(worktreePath, ".venv");

  const hasPython = await fs
    .access(pyproject)
    .then(() => true)
    .catch(() => false)
    || await fs
    .access(requirements)
    .then(() => true)
    .catch(() => false);

  if (hasPython) {
    try {
      await fs.access(venv);
      results.push({ label: ".venv present", status: "pass" });
    } catch {
      results.push({
        label: ".venv present",
        status: "warn",
        detail: "Python project found but .venv missing",
        fix: `Run: cd ${worktreePath} && uv venv && uv pip install -r requirements.txt`,
      });
    }
  }

  return results;
}

async function checkGitignoreCoversEnv(repoRoot: string): Promise<CheckResult> {
  const gitignorePath = path.join(repoRoot, ".gitignore");
  try {
    const content = await fs.readFile(gitignorePath, "utf8");
    const lines = content.split("\n").map((l) => l.trim());
    const coversEnv =
      lines.includes(".env") ||
      lines.includes("*.env") ||
      lines.includes(".env*") ||
      lines.some((l) => l.startsWith(".env") && !l.startsWith(".env.example"));

    return {
      label: ".gitignore covers .env files",
      status: coversEnv ? "pass" : "warn",
      detail: coversEnv ? undefined : ".env not found in .gitignore",
      fix: coversEnv ? undefined : `Add '.env' to ${gitignorePath}`,
    };
  } catch {
    return {
      label: ".gitignore covers .env files",
      status: "warn",
      detail: ".gitignore not found",
      fix: `Create ${gitignorePath} and add '.env' to it`,
    };
  }
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatCheck(check: CheckResult): string {
  const icons: Record<CheckStatus, string> = {
    pass: pc.green("\u2713"),
    fail: pc.red("\u2717"),
    warn: pc.yellow("\u26A0"),
    skip: pc.dim("-"),
  };

  const icon = icons[check.status];
  let line = `  ${icon} ${check.label}`;
  if (check.detail) {
    line += `\n    ${pc.dim(check.detail)}`;
  }
  if (check.fix) {
    line += `\n    ${pc.dim("\u2192 " + check.fix)}`;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export default async function doctorCommand(
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

  logger.verb("Diagnosing", targetDir);
  logger.blank();

  // --- Resolve repo root -----------------------------------------------
  const repoRoot = await getRepoRoot(targetDir);
  if (!repoRoot) {
    logger.error("Not inside a git repository.");
    logger.hint("Run this command from inside a git repository.");
    return 1;
  }

  const mainPath: string = (await getMainWorktreePath(repoRoot)) ?? repoRoot;

  // --- Load config to get env patterns ---------------------------------
  const globalConfig = await loadGlobalConfig();
  const localConfig = await loadConfig(repoRoot);
  const config = mergeConfig(globalConfig, localConfig);

  // --- Run all checks --------------------------------------------------
  const checks: CheckResult[] = [];

  // System checks
  checks.push(await checkGitVersion());
  checks.push(await checkWorktreeRcSyntax(repoRoot));
  checks.push(await checkGitignoreCoversEnv(repoRoot));

  // Package managers
  const managersToCheck = ["git"];
  const hasNode = await fs.access(path.join(targetDir, "package.json")).then(() => true).catch(() => false);
  const hasPython = await fs.access(path.join(targetDir, "pyproject.toml")).then(() => true).catch(() => false)
    || await fs.access(path.join(targetDir, "requirements.txt")).then(() => true).catch(() => false);
  const hasRust = await fs.access(path.join(targetDir, "Cargo.toml")).then(() => true).catch(() => false);
  const hasGo = await fs.access(path.join(targetDir, "go.mod")).then(() => true).catch(() => false);

  if (hasNode) managersToCheck.push(config.deps.node_pm ?? "bun");
  if (hasPython) managersToCheck.push(config.deps.python_pm ?? "uv");
  if (hasRust) managersToCheck.push("cargo");
  if (hasGo) managersToCheck.push("go");

  for (const cmd of [...new Set(managersToCheck)]) {
    checks.push(await checkCommandAvailable(cmd));
  }

  // Env files in main
  if (config.env.patterns.length > 0) {
    const envChecks = await checkEnvFilesInMain(mainPath, config.env.patterns);
    checks.push(...envChecks);
  }

  // Symlinks in worktree
  const symlinkChecks = await checkSymlinks(targetDir);
  checks.push(...symlinkChecks);

  // Deps installed
  const depChecks = await checkDepsInstalled(targetDir);
  checks.push(...depChecks);

  // --- Print results ----------------------------------------------------
  for (const check of checks) {
    logger.info(formatCheck(check));
  }

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail");
  const warned = checks.filter((c) => c.status === "warn");

  logger.blank();
  const summary = `${pc.bold(String(checks.length))} checks: ${pc.green(String(passed) + " passed")}, ${pc.yellow(String(warned.length) + " warnings")}, ${pc.red(String(failed.length) + " failures")}`;
  logger.info(summary);

  if (failed.length > 0) {
    logger.blank();
    logger.error(`${failed.length} check(s) failed.`);
    logger.hint("See the hints above to fix failing checks.");
    return 1;
  }

  if (warned.length > 0) {
    logger.blank();
    logger.warn(`${warned.length} warning(s) — review above items.`);
    return 2;
  }

  logger.blank();
  logger.success("All checks passed.");
  return 0;
}
