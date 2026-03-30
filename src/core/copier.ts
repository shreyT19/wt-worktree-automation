/**
 * copier.ts — copy ignored dirs (e.g. node_modules) between worktrees.
 *
 * Uses copy-on-write (cp -c) on macOS for instant, zero-extra-disk copies.
 * Falls back to hardlinks (cp -al) on Linux, then rsync as a last resort.
 */

import { exec } from "../utils/shell.ts";
import type { DetectedEcosystem } from "./types.ts";

// ============================================================================
// Public types
// ============================================================================

export interface CopyResult {
  /** e.g. "node_modules" */
  dir: string;
  success: boolean;
  /** milliseconds */
  duration: number;
  method: "clonefile" | "hardlink" | "rsync";
  /** Reason the copy was skipped (dir not present, lockfile mismatch, etc.) */
  skipped?: string;
}

// ============================================================================
// Lockfile helpers
// ============================================================================

const LOCKFILES = [
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

/**
 * Compute a SHA-256 hash of a file's raw bytes.
 * Returns null when the file does not exist or cannot be read.
 */
async function hashFile(filePath: string): Promise<string | null> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) return null;

  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    // Convert to hex string
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/**
 * Return true when both directories contain the same lockfile with identical
 * content.  Returns false when no lockfile exists in either directory.
 */
export async function lockfilesMatch(
  sourcePath: string,
  targetPath: string,
): Promise<boolean> {
  for (const lockfile of LOCKFILES) {
    const srcHash = await hashFile(`${sourcePath}/${lockfile}`);
    if (srcHash === null) continue; // this lockfile not present in source

    const tgtHash = await hashFile(`${targetPath}/${lockfile}`);
    if (tgtHash === null) return false; // source has it but target does not

    return srcHash === tgtHash;
  }
  // No lockfile found in source at all — cannot verify
  return false;
}

// ============================================================================
// OS detection + copy strategy
// ============================================================================

type CopyMethod = "clonefile" | "hardlink" | "rsync";

function detectOS(): "macos" | "linux" | "other" {
  const platform = process.platform;
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return "other";
}

/**
 * Attempt to copy `src` into `dest` using the preferred method.
 * Returns { method, success }.
 */
async function tryCopy(
  src: string,
  dest: string,
  os: "macos" | "linux" | "other",
): Promise<{ method: CopyMethod; success: boolean }> {
  if (os === "macos") {
    // cp -c  — copy-on-write (APFS clonefile), macOS 10.12+
    const result = await exec(["cp", "-Rc", src, dest]);
    if (result.exitCode === 0) return { method: "clonefile", success: true };
  }

  if (os === "linux" || os === "macos") {
    // cp -al  — hardlinks, Linux + most macOS volumes
    const result = await exec(["cp", "-Ral", src, dest]);
    if (result.exitCode === 0) return { method: "hardlink", success: true };
  }

  // Final fallback: rsync
  const result = await exec([
    "rsync",
    "-a",
    "--delete",
    `${src}/`,
    `${dest}/`,
  ]);
  return { method: "rsync", success: result.exitCode === 0 };
}

// ============================================================================
// Per-ecosystem dir resolution
// ============================================================================

/**
 * Return the directory name to copy for a given ecosystem.
 * Returns null when the ecosystem should be skipped.
 */
function dirsForEcosystem(ecosystem: DetectedEcosystem): string | null {
  switch (ecosystem.type) {
    case "node":
      return "node_modules";
    case "rust":
      return "target";
    case "go":
      // go mod cache is global — nothing to copy
      return null;
    case "python":
      // .venv contains absolute paths and will break in a different directory
      return null;
    default:
      return null;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Copy ignored dirs (node_modules, target, …) from one worktree to another.
 *
 * For node_modules the lockfiles are compared first; a mismatch causes the
 * copy to be skipped and the caller should fall back to a normal install.
 *
 * Never throws — all errors are captured in CopyResult.success / skipped.
 */
export async function copyIgnoredDirs(
  sourcePath: string,
  targetPath: string,
  ecosystems: DetectedEcosystem[],
): Promise<CopyResult[]> {
  const os = detectOS();
  const results: CopyResult[] = [];

  for (const ecosystem of ecosystems) {
    const dirName = dirsForEcosystem(ecosystem);
    if (dirName === null) continue;

    const start = Date.now();
    const srcDir = `${sourcePath}/${dirName}`;
    const destDir = `${targetPath}/${dirName}`;

    // Check source dir exists
    if (!(await Bun.file(srcDir).exists())) {
      // Bun.file doesn't work for dirs; use a quick stat via exec
      const stat = await exec(["test", "-d", srcDir]);
      if (stat.exitCode !== 0) {
        results.push({
          dir: dirName,
          success: false,
          duration: Date.now() - start,
          method: "clonefile",
          skipped: `source directory '${srcDir}' does not exist`,
        });
        continue;
      }
    }

    // For node_modules: verify lockfiles match
    if (dirName === "node_modules") {
      const match = await lockfilesMatch(sourcePath, targetPath);
      if (!match) {
        results.push({
          dir: dirName,
          success: false,
          duration: Date.now() - start,
          method: "clonefile",
          skipped: "lockfile mismatch",
        });
        continue;
      }
    }

    // Perform the copy
    const { method, success } = await tryCopy(srcDir, destDir, os);

    // Verify the destination now exists
    const verify = await exec(["test", "-d", destDir]);
    const verified = verify.exitCode === 0;

    results.push({
      dir: dirName,
      success: success && verified,
      duration: Date.now() - start,
      method,
    });
  }

  return results;
}
