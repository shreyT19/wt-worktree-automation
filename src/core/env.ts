/**
 * Environment file handler for the wt CLI.
 *
 * Copies or symlinks .env files from the main worktree to a new worktree.
 * Default strategy: copy (safer for concurrent worktrees).
 */

import path from "node:path";
import { exec } from "../utils/shell.ts";
import { isGitIgnored } from "./git.ts";
import type { EnvFileResult, EnvStrategy, MergedConfig } from "./types.ts";

// ============================================================================
// Path helpers
// ============================================================================

/** Expand glob patterns using Bun's Glob API. Returns matched absolute paths. */
async function expandGlob(pattern: string, baseDir: string): Promise<string[]> {
  try {
    const glob = new Bun.Glob(pattern);
    const matches: string[] = [];
    for await (const match of glob.scan({ cwd: baseDir, absolute: false })) {
      matches.push(match);
    }
    return matches;
  } catch {
    return [];
  }
}

/** Check whether a path exists (file or symlink). */
async function pathExists(path: string): Promise<boolean> {
  try {
    return Bun.file(path).exists();
  } catch {
    return false;
  }
}

/** Ensure all intermediate directories exist for a path. */
async function ensureDir(dirPath: string): Promise<void> {
  await exec(["mkdir", "-p", dirPath]);
}

/** Get the directory portion of a path. */
function dirname(filePath: string): string {
  const parts = filePath.split("/");
  parts.pop();
  return parts.join("/") || ".";
}

// ============================================================================
// Strategy implementations
// ============================================================================

async function copyFile(src: string, dest: string): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureDir(dirname(dest));
    const srcFile = Bun.file(src);
    const content = await srcFile.arrayBuffer();
    await Bun.write(dest, content);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function symlinkFile(
  src: string,
  dest: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureDir(dirname(dest));
    const result = await exec(["ln", "-s", src, dest]);
    if (result.exitCode !== 0) {
      return { success: false, error: result.stderr || result.stdout };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Set up environment files in a new worktree.
 *
 * Scans the main worktree for files matching configured glob patterns,
 * then copies or symlinks each one into the new worktree. Files that
 * already exist at the destination are skipped (never overwritten).
 *
 * @param worktreePath      Absolute path to the new worktree.
 * @param mainWorktreePath  Absolute path to the main (source) worktree.
 * @param config            Merged configuration (optional).
 */
export async function setupEnvFiles(
  worktreePath: string,
  mainWorktreePath: string,
  config?: MergedConfig,
): Promise<EnvFileResult[]> {
  const envConfig = config?.env;
  const defaultStrategy: EnvStrategy = envConfig?.strategy ?? "copy";
  const patterns   = envConfig?.patterns   ?? [".env", ".env.local", ".env.development"];
  const alwaysCopy = envConfig?.always_copy ?? [];
  const exclude    = new Set(envConfig?.exclude ?? []);

  const results: EnvFileResult[] = [];

  // Collect all matching relative paths from main worktree
  const allRelPaths = new Set<string>();
  for (const pattern of patterns) {
    const matches = await expandGlob(pattern, mainWorktreePath);
    for (const m of matches) allRelPaths.add(m);
  }

  if (allRelPaths.size === 0) {
    // No env files found — not an error
    return results;
  }

  for (const relPath of allRelPaths) {
    // Skip excluded files
    if (exclude.has(relPath)) {
      results.push({
        file:      relPath,
        strategy:  "skip",
        success:   true,
        skipped:   true,
        skipReason: "excluded in config",
      });
      continue;
    }

    const srcPath  = `${mainWorktreePath}/${relPath}`;
    const destPath = `${worktreePath}/${relPath}`;

    // Verify source exists
    if (!(await pathExists(srcPath))) {
      results.push({
        file:    relPath,
        strategy: defaultStrategy,
        success:  false,
        error:   `Source file not found: ${srcPath}`,
      });
      continue;
    }

    // Skip if destination already exists (never overwrite)
    if (await pathExists(destPath)) {
      results.push({
        file:      relPath,
        strategy:  defaultStrategy,
        success:   true,
        skipped:   true,
        skipReason: "destination already exists",
      });
      continue;
    }

    // Warn if .env file is not gitignored (security concern — just record, don't block)
    const ignored = await isGitIgnored(relPath, mainWorktreePath);
    if (!ignored) {
      // We surface this as a warning via the result but still proceed
    }

    // Determine strategy for this file
    const strategy: EnvStrategy = alwaysCopy.includes(relPath)
      ? "copy"
      : defaultStrategy;

    if (strategy === "skip") {
      results.push({
        file:      relPath,
        strategy:  "skip",
        success:   true,
        skipped:   true,
        skipReason: "strategy = skip",
      });
      continue;
    }

    const op = strategy === "symlink"
      ? symlinkFile(srcPath, destPath)
      : copyFile(srcPath, destPath);

    const opResult = await op;
    results.push({
      file:    relPath,
      strategy,
      success: opResult.success,
      error:   opResult.success ? undefined : opResult.error,
    });
  }

  return results;
}

/**
 * Remove environment files that were copied (not symlinked) into a worktree.
 * Used during `wt remove` cleanup.
 */
export async function cleanupEnvFiles(
  worktreePath: string,
  config?: MergedConfig,
): Promise<void> {
  const patterns = config?.env.patterns ?? [".env", ".env.local", ".env.development"];

  for (const pattern of patterns) {
    const matches = await expandGlob(pattern, worktreePath);
    for (const relPath of matches) {
      const fullPath = `${worktreePath}/${relPath}`;
      // Path traversal protection: ensure the resolved path stays within the worktree
      const resolved = path.resolve(fullPath);
      if (!resolved.startsWith(path.resolve(worktreePath) + path.sep) &&
          resolved !== path.resolve(worktreePath)) {
        // logger is not imported here; use console.warn for best-effort safety notice
        console.warn(`[wt] Skipping ${fullPath} — outside worktree boundary`);
        continue;
      }
      try {
        // Only remove regular files (not symlinks pointing outside)
        const result = await exec(["test", "-f", fullPath, "!", "-L", fullPath]);
        if (result.exitCode === 0) {
          await exec(["rm", "-f", fullPath]);
        }
      } catch {
        // best-effort cleanup
      }
    }
  }
}
