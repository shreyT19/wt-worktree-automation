/**
 * Dependency installer for the wt CLI.
 *
 * Installs dependencies for each detected ecosystem using the appropriate
 * package manager. Always uses frozen/locked installs for reproducibility.
 */

import { exec } from "../utils/shell.ts";
import { commandExists } from "../utils/shell.ts";
import type { DetectedEcosystem, InstallResult, MergedConfig } from "./types.ts";

// ============================================================================
// Timing helper
// ============================================================================

function now(): number {
  return Date.now();
}

// ============================================================================
// Node.js
// ============================================================================

async function installNode(
  dir: string,
  ecosystem: DetectedEcosystem,
  config?: MergedConfig,
): Promise<InstallResult> {
  const start = now();
  const pm = config?.deps.node_pm ?? ecosystem.pm;

  // Verify the package manager is available
  if (!(await commandExists(pm))) {
    return {
      ecosystem: "node",
      success:   false,
      durationMs: now() - start,
      pm,
      error: `Package manager '${pm}' not found in PATH`,
    };
  }

  let cmd: string[];
  switch (pm) {
    case "bun":
      cmd = ["bun", "install", "--frozen-lockfile"];
      break;
    case "npm":
      cmd = ["npm", "ci"];
      break;
    case "pnpm":
      cmd = ["pnpm", "install", "--frozen-lockfile"];
      break;
    case "yarn":
      cmd = ["yarn", "install", "--frozen-lockfile"];
      break;
    default:
      cmd = ["bun", "install", "--frozen-lockfile"];
  }

  const result = await exec(cmd, { cwd: dir });
  const durationMs = now() - start;

  return {
    ecosystem:  "node",
    success:    result.exitCode === 0,
    durationMs,
    pm,
    error:      result.exitCode !== 0 ? (result.stderr || result.stdout) : undefined,
  };
}

// ============================================================================
// Python
// ============================================================================

async function installPython(
  dir: string,
  ecosystem: DetectedEcosystem,
  config?: MergedConfig,
): Promise<InstallResult> {
  const start = now();
  const pm = config?.deps.python_pm ?? ecosystem.pm;
  const pyVersion = config?.python.version ?? "python3";
  const reqFile   = config?.python.requirements ?? null;
  const editable  = config?.python.editable ?? false;

  // Verify pm is available
  if (!(await commandExists(pm))) {
    return {
      ecosystem:  "python",
      success:    false,
      durationMs: now() - start,
      pm,
      error: `Package manager '${pm}' not found in PATH`,
    };
  }

  const venvPath = `${dir}/.venv`;

  if (pm === "uv") {
    // 1. Create venv
    const venvResult = await exec(["uv", "venv", venvPath, "--python", pyVersion], { cwd: dir });
    if (venvResult.exitCode !== 0) {
      return {
        ecosystem:  "python",
        success:    false,
        durationMs: now() - start,
        pm,
        error: venvResult.stderr || venvResult.stdout,
      };
    }

    // 2. Install dependencies
    const reqArg = reqFile ?? await findRequirementsFile(dir);
    const installArgs = ["uv", "pip", "install"];
    if (editable) {
      installArgs.push("-e", ".");
    } else if (reqArg) {
      installArgs.push("-r", reqArg);
    } else {
      // No requirements file — try editable install from pyproject.toml
      installArgs.push("-e", ".[dev]");
    }
    installArgs.push("--python", `${venvPath}/bin/python`);

    const installResult = await exec(installArgs, { cwd: dir });
    const durationMs = now() - start;

    return {
      ecosystem:  "python",
      success:    installResult.exitCode === 0,
      durationMs,
      pm,
      error: installResult.exitCode !== 0
        ? (installResult.stderr || installResult.stdout)
        : undefined,
    };
  }

  if (pm === "pip") {
    // 1. Create venv
    const venvResult = await exec([pyVersion, "-m", "venv", venvPath], { cwd: dir });
    if (venvResult.exitCode !== 0) {
      return {
        ecosystem:  "python",
        success:    false,
        durationMs: now() - start,
        pm,
        error: venvResult.stderr || venvResult.stdout,
      };
    }

    // 2. Install with venv pip — skip if no requirements file found
    const pip = `${venvPath}/bin/pip`;
    const reqArg = reqFile ?? await findRequirementsFile(dir);
    if (!reqArg) {
      return {
        ecosystem:  "python",
        success:    true,
        durationMs: now() - start,
        pm,
        skipped:    true,
        skipReason: "no requirements file found",
      };
    }
    const installResult = await exec([pip, "install", "-r", reqArg], { cwd: dir });
    const durationMs = now() - start;

    return {
      ecosystem:  "python",
      success:    installResult.exitCode === 0,
      durationMs,
      pm,
      error: installResult.exitCode !== 0
        ? (installResult.stderr || installResult.stdout)
        : undefined,
    };
  }

  if (pm === "poetry") {
    const result = await exec(["poetry", "install"], { cwd: dir });
    return {
      ecosystem:  "python",
      success:    result.exitCode === 0,
      durationMs: now() - start,
      pm,
      error: result.exitCode !== 0 ? (result.stderr || result.stdout) : undefined,
    };
  }

  if (pm === "pipenv") {
    const result = await exec(["pipenv", "install", "--dev"], { cwd: dir });
    return {
      ecosystem:  "python",
      success:    result.exitCode === 0,
      durationMs: now() - start,
      pm,
      error: result.exitCode !== 0 ? (result.stderr || result.stdout) : undefined,
    };
  }

  return {
    ecosystem:  "python",
    success:    false,
    durationMs: now() - start,
    pm,
    error: `Unknown Python package manager: ${pm}`,
  };
}

/** Heuristic to find a requirements file in a directory. Returns null if none exist. */
async function findRequirementsFile(dir: string): Promise<string | null> {
  const candidates = [
    "requirements/dev.txt",
    "requirements-dev.txt",
    "requirements.txt",
  ];
  for (const candidate of candidates) {
    const fullPath = `${dir}/${candidate}`;
    if (await Bun.file(fullPath).exists()) {
      return candidate;
    }
  }
  return null;
}

// ============================================================================
// Rust
// ============================================================================

async function installRust(dir: string): Promise<InstallResult> {
  const start = now();

  if (!(await commandExists("cargo"))) {
    return {
      ecosystem:  "rust",
      success:    false,
      durationMs: now() - start,
      pm:         "cargo",
      error: "'cargo' not found in PATH",
    };
  }

  const result = await exec(["cargo", "fetch"], { cwd: dir });
  return {
    ecosystem:  "rust",
    success:    result.exitCode === 0,
    durationMs: now() - start,
    pm:         "cargo",
    error: result.exitCode !== 0 ? (result.stderr || result.stdout) : undefined,
  };
}

// ============================================================================
// Go
// ============================================================================

async function installGo(dir: string): Promise<InstallResult> {
  const start = now();

  if (!(await commandExists("go"))) {
    return {
      ecosystem:  "go",
      success:    false,
      durationMs: now() - start,
      pm:         "go",
      error: "'go' not found in PATH",
    };
  }

  const result = await exec(["go", "mod", "download"], { cwd: dir });
  return {
    ecosystem:  "go",
    success:    result.exitCode === 0,
    durationMs: now() - start,
    pm:         "go",
    error: result.exitCode !== 0 ? (result.stderr || result.stdout) : undefined,
  };
}

// ============================================================================
// Custom commands
// ============================================================================

async function runCustomCommands(
  dir: string,
  commands: string[],
): Promise<InstallResult[]> {
  const results: InstallResult[] = [];

  for (const cmd of commands) {
    const start = now();
    // Route through sh -c to support pipes, cd, etc.
    const result = await exec(["sh", "-c", cmd], { cwd: dir });
    results.push({
      ecosystem:  "node", // placeholder — custom commands have no single ecosystem
      success:    result.exitCode === 0,
      durationMs: now() - start,
      pm:         "custom",
      error: result.exitCode !== 0 ? (result.stderr || result.stdout) : undefined,
    });
    if (result.exitCode !== 0) break; // stop on first failure
  }

  return results;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Install dependencies for all detected ecosystems.
 *
 * If config.deps.custom.commands is non-empty, those commands are executed
 * instead of the per-ecosystem installers.
 *
 * Returns one InstallResult per ecosystem (or per custom command if using
 * custom install). Results are returned even on failure — never throws.
 */
export async function installDeps(
  dir: string,
  ecosystems: DetectedEcosystem[],
  config?: MergedConfig,
): Promise<InstallResult[]> {
  // Short-circuit: deps disabled in config
  if (config?.deps.enabled === false) {
    return ecosystems.map((e) => ({
      ecosystem:  e.type,
      success:    true,
      durationMs: 0,
      pm:         e.pm,
      skipped:    true,
      skipReason: "deps.enabled = false in config",
    }));
  }

  // Custom commands take precedence
  const customCmds = config?.deps.custom?.commands ?? [];
  if (customCmds.length > 0) {
    return runCustomCommands(dir, customCmds);
  }

  // Run ecosystem installers (in sequence to avoid resource contention)
  const results: InstallResult[] = [];

  for (const ecosystem of ecosystems) {
    let result: InstallResult;

    switch (ecosystem.type) {
      case "node":
        result = await installNode(dir, ecosystem, config);
        break;
      case "python":
        result = await installPython(dir, ecosystem, config);
        break;
      case "rust":
        result = await installRust(dir);
        break;
      case "go":
        result = await installGo(dir);
        break;
      default:
        result = {
          ecosystem: ecosystem.type,
          success:   false,
          durationMs: 0,
          pm:        ecosystem.pm,
          error:     `Unknown ecosystem: ${ecosystem.type}`,
        };
    }

    results.push(result);
  }

  return results;
}
