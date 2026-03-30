/**
 * Configuration loader for the wt CLI.
 *
 * Handles .worktreerc (local, per-repo) and ~/.config/wt/config.toml (global).
 * Uses smol-toml for parsing. Missing files return sensible defaults.
 */

import { parse as parseTOML } from "smol-toml";
import type {
  LocalConfig,
  GlobalConfig,
  MergedConfig,
  EnvStrategy,
  EcosystemType,
  NodePM,
  PythonPM,
} from "./types.ts";

// ============================================================================
// File reading helper
// ============================================================================

async function readTomlFile(path: string): Promise<string | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return await file.text();
  } catch {
    return null;
  }
}

function parseToml<T>(content: string, sourcePath: string): T | null {
  try {
    return parseTOML(content) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse TOML at ${sourcePath}: ${msg}`);
  }
}

// ============================================================================
// Local config: .worktreerc
// ============================================================================

/**
 * Search for .worktreerc starting from `dir`, walking up to the git root.
 * Returns the parsed config or null if not found.
 */
export async function loadConfig(dir: string): Promise<LocalConfig | null> {
  // Try the given dir first, then walk up
  let current = dir;
  const maxDepth = 10;
  let depth = 0;

  while (depth < maxDepth) {
    const path = `${current}/.worktreerc`;
    const content = await readTomlFile(path);

    if (content !== null) {
      return parseToml<LocalConfig>(content, path);
    }

    // Walk up
    const parent = current.split("/").slice(0, -1).join("/");
    if (!parent || parent === current) break;
    current = parent;
    depth++;
  }

  return null;
}

// ============================================================================
// Global config: ~/.config/wt/config.toml
// ============================================================================

function globalConfigPath(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
  return `${home}/.config/wt/config.toml`;
}

/**
 * Load the user-level global config from ~/.config/wt/config.toml.
 * Returns null if the file does not exist.
 */
export async function loadGlobalConfig(): Promise<GlobalConfig | null> {
  const path = globalConfigPath();
  const content = await readTomlFile(path);
  if (content === null) return null;
  return parseToml<GlobalConfig>(content, path);
}

// ============================================================================
// Defaults
// ============================================================================

function defaultMergedConfig(): MergedConfig {
  return {
    version: 1,
    detect:  { types: null },
    deps: {
      enabled:   true,
      node_pm:   null,
      python_pm: null,
      custom:    { commands: [] },
    },
    env: {
      strategy:    "copy",
      patterns:    [".env", ".env.local", ".env.development"],
      always_copy: [],
      exclude:     [],
    },
    files: {
      symlink: [],
      copy:    [],
    },
    python: {
      version:      "python3",
      requirements: null,
      editable:     false,
    },
    hooks: {
      pre_install:  [],
      post_install: [],
      post_setup:   [],
    },
    worktree: {
      base_dir:     "../",
      name_pattern: "{repo}-{short_branch}",
    },
    user: {
      branch_prefix: null,
    },
  };
}

// ============================================================================
// Merge
// ============================================================================

/**
 * Merge global config and local .worktreerc into a single resolved config.
 * Local values override global values. Both can be null (use defaults).
 */
export function mergeConfig(
  global: GlobalConfig | null,
  local: LocalConfig | null,
): MergedConfig {
  const merged = defaultMergedConfig();

  // ---- Apply global config ----
  if (global) {
    if (global.user?.branch_prefix) {
      merged.user.branch_prefix = global.user.branch_prefix;
    }
    if (global.defaults?.env_strategy) {
      merged.env.strategy = global.defaults.env_strategy as EnvStrategy;
    }
    if (global.defaults?.base_dir) {
      merged.worktree.base_dir = global.defaults.base_dir;
    }
    if (global.defaults?.auto_deps === false) {
      merged.deps.enabled = false;
    }
  }

  // ---- Apply local config (overrides global) ----
  if (local) {
    if (local.version !== undefined) {
      merged.version = local.version;
    }

    // [detect]
    if (local.detect?.types) {
      merged.detect.types = local.detect.types as EcosystemType[];
    }

    // [deps]
    if (local.deps) {
      if (local.deps.enabled !== undefined) merged.deps.enabled = local.deps.enabled;
      if (local.deps.node_pm)   merged.deps.node_pm   = local.deps.node_pm   as NodePM;
      if (local.deps.python_pm) merged.deps.python_pm = local.deps.python_pm as PythonPM;
      if (local.deps.custom?.commands) {
        merged.deps.custom.commands = local.deps.custom.commands;
      }
    }

    // [env]
    if (local.env) {
      if (local.env.strategy)    merged.env.strategy    = local.env.strategy    as EnvStrategy;
      if (local.env.patterns)    merged.env.patterns    = local.env.patterns;
      if (local.env.always_copy) merged.env.always_copy = local.env.always_copy;
      if (local.env.exclude)     merged.env.exclude     = local.env.exclude;
    }

    // [files]
    if (local.files) {
      if (local.files.symlink) merged.files.symlink = local.files.symlink;
      if (local.files.copy)    merged.files.copy    = local.files.copy;
    }

    // [python]
    if (local.python) {
      if (local.python.version)      merged.python.version      = local.python.version;
      if (local.python.requirements) merged.python.requirements = local.python.requirements;
      if (local.python.editable !== undefined) merged.python.editable = local.python.editable;
    }

    // [hooks]
    if (local.hooks) {
      if (local.hooks.pre_install)  merged.hooks.pre_install  = local.hooks.pre_install;
      if (local.hooks.post_install) merged.hooks.post_install = local.hooks.post_install;
      if (local.hooks.post_setup)   merged.hooks.post_setup   = local.hooks.post_setup;
    }

    // [worktree]
    if (local.worktree) {
      if (local.worktree.base_dir)     merged.worktree.base_dir     = local.worktree.base_dir;
      if (local.worktree.name_pattern) merged.worktree.name_pattern = local.worktree.name_pattern;
    }
  }

  return merged;
}

/**
 * Convenience: load both configs and merge them.
 * Returns a fully resolved MergedConfig (never throws — missing files are fine).
 */
export async function loadMergedConfig(dir: string): Promise<MergedConfig> {
  const [global, local] = await Promise.allSettled([
    loadGlobalConfig(),
    loadConfig(dir),
  ]);

  const globalCfg = global.status === "fulfilled" ? global.value : null;
  const localCfg  = local.status  === "fulfilled" ? local.value  : null;

  // Surface parse errors but don't crash
  if (global.status === "rejected") {
    process.stderr.write(`warn: global config parse error: ${global.reason}\n`);
  }
  if (local.status === "rejected") {
    // Config parse errors ARE fatal per the architecture spec
    throw local.reason;
  }

  return mergeConfig(globalCfg, localCfg);
}

/**
 * Write a .worktreerc template to a directory.
 * Used by `wt init`.
 */
export async function writeConfigTemplate(
  dir: string,
  config: Partial<LocalConfig>,
): Promise<void> {
  const path = `${dir}/.worktreerc`;

  // Build TOML by hand — smol-toml is parse-only; we generate the template manually.
  const lines: string[] = [
    `# .worktreerc -- Worktree automation configuration`,
    `# This file is safe to commit (contains no secrets)`,
    `version = 1`,
    ``,
  ];

  if (config.detect?.types?.length) {
    lines.push(`[detect]`);
    lines.push(`types = [${config.detect.types.map((t) => `"${t}"`).join(", ")}]`);
    lines.push(``);
  }

  if (config.deps) {
    lines.push(`[deps]`);
    if (config.deps.node_pm)   lines.push(`node_pm = "${config.deps.node_pm}"`);
    if (config.deps.python_pm) lines.push(`python_pm = "${config.deps.python_pm}"`);
    lines.push(``);
  }

  if (config.env) {
    lines.push(`[env]`);
    lines.push(`strategy = "${config.env.strategy ?? "copy"}"`);
    if (config.env.patterns?.length) {
      const pats = config.env.patterns.map((p) => `"${p}"`).join(", ");
      lines.push(`patterns = [${pats}]`);
    }
    if (config.env.exclude?.length) {
      const excl = config.env.exclude.map((p) => `"${p}"`).join(", ");
      lines.push(`exclude = [${excl}]`);
    }
    lines.push(``);
  }

  if (config.python) {
    lines.push(`[python]`);
    if (config.python.version)      lines.push(`version = "${config.python.version}"`);
    if (config.python.requirements) lines.push(`requirements = "${config.python.requirements}"`);
    if (config.python.editable)     lines.push(`editable = true`);
    lines.push(``);
  }

  if (config.hooks) {
    lines.push(`[hooks]`);
    if (config.hooks.post_install?.length) {
      const cmds = config.hooks.post_install.map((c) => `    "${c}"`).join(",\n");
      lines.push(`post_install = [\n${cmds},\n]`);
    }
    lines.push(``);
  }

  if (config.worktree) {
    lines.push(`[worktree]`);
    if (config.worktree.base_dir) lines.push(`base_dir = "${config.worktree.base_dir}"`);
    lines.push(``);
  }

  await Bun.write(path, lines.join("\n"));
}
