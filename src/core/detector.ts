/**
 * Project type detector for the wt CLI.
 *
 * Scans a directory for well-known marker files and infers the ecosystem(s)
 * and preferred package manager(s) present.
 */

import type { DetectedEcosystem, EcosystemType, NodePM, PythonPM } from "./types.ts";

// ============================================================================
// File existence helpers (Bun.file)
// ============================================================================

async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

async function readFileText(path: string): Promise<string | null> {
  try {
    const f = Bun.file(path);
    if (!(await f.exists())) return null;
    return await f.text();
  } catch {
    return null;
  }
}

// ============================================================================
// Node.js detection
// ============================================================================

/**
 * Determine the Node.js package manager from lockfiles present in `dir`.
 * Priority order matches the architecture spec:
 *   bun.lockb > pnpm-lock.yaml > yarn.lock > package-lock.json > fallback
 */
async function detectNodePM(dir: string): Promise<{ pm: NodePM; lockfile: string | undefined }> {
  const candidates: Array<{ lockfile: string; pm: NodePM }> = [
    { lockfile: "bun.lockb",        pm: "bun"  },
    { lockfile: "pnpm-lock.yaml",   pm: "pnpm" },
    { lockfile: "yarn.lock",        pm: "yarn" },
    { lockfile: "package-lock.json", pm: "npm" },
  ];

  for (const { lockfile, pm } of candidates) {
    if (await fileExists(`${dir}/${lockfile}`)) {
      return { pm, lockfile };
    }
  }

  // No lockfile found — default to bun
  return { pm: "bun", lockfile: undefined };
}

async function detectNode(dir: string): Promise<DetectedEcosystem | null> {
  if (!(await fileExists(`${dir}/package.json`))) return null;

  const { pm, lockfile } = await detectNodePM(dir);
  return {
    type:       "node",
    pm,
    lockfile,
    markerFile: "package.json",
  };
}

// ============================================================================
// Python detection
// ============================================================================

/**
 * Determine the Python package manager.
 * Priority: Pipfile > pyproject.toml (poetry > uv > fallback) > requirements.txt
 */
async function detectPython(dir: string): Promise<DetectedEcosystem | null> {
  // Pipfile — pipenv project
  if (await fileExists(`${dir}/Pipfile`)) {
    return { type: "python", pm: "pipenv", lockfile: "Pipfile.lock", markerFile: "Pipfile" };
  }

  // pyproject.toml — check for [tool.poetry] or [tool.uv]
  if (await fileExists(`${dir}/pyproject.toml`)) {
    const content = await readFileText(`${dir}/pyproject.toml`);
    if (content !== null) {
      if (content.includes("[tool.poetry]")) {
        return { type: "python", pm: "poetry", markerFile: "pyproject.toml" };
      }
      if (content.includes("[tool.uv]") || content.includes("[tool.uv.")) {
        return { type: "python", pm: "uv", markerFile: "pyproject.toml" };
      }
      // Has [build-system] but no tool.poetry/tool.uv — fallback to uv
      if (content.includes("[build-system]") || content.includes("[project]")) {
        return { type: "python", pm: "uv", markerFile: "pyproject.toml" };
      }
    }
    // pyproject.toml exists but unrecognised — still treat as python/uv
    return { type: "python", pm: "uv", markerFile: "pyproject.toml" };
  }

  // requirements.txt — plain pip / uv project
  if (await fileExists(`${dir}/requirements.txt`)) {
    return { type: "python", pm: "uv", lockfile: "requirements.txt", markerFile: "requirements.txt" };
  }

  return null;
}

// ============================================================================
// Rust detection
// ============================================================================

async function detectRust(dir: string): Promise<DetectedEcosystem | null> {
  if (!(await fileExists(`${dir}/Cargo.toml`))) return null;
  return {
    type:       "rust",
    pm:         "cargo",
    lockfile:   "Cargo.lock",
    markerFile: "Cargo.toml",
  };
}

// ============================================================================
// Go detection
// ============================================================================

async function detectGo(dir: string): Promise<DetectedEcosystem | null> {
  if (!(await fileExists(`${dir}/go.mod`))) return null;
  return {
    type:       "go",
    pm:         "go",
    lockfile:   "go.sum",
    markerFile: "go.mod",
  };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Scan `dir` for known marker files and return an array of detected ecosystems.
 *
 * Results are deduplicated and ordered: node, python, rust, go.
 * An explicit `overrideTypes` list (from .worktreerc [detect].types) skips
 * file scanning and just returns those types with auto-detected PMs.
 */
export async function detectProjectTypes(
  dir: string,
  overrideTypes?: EcosystemType[],
): Promise<DetectedEcosystem[]> {
  if (overrideTypes && overrideTypes.length > 0) {
    // honour explicit declaration — still detect PM from lockfiles
    const results: DetectedEcosystem[] = [];

    for (const type of overrideTypes) {
      switch (type) {
        case "node": {
          const detected = await detectNode(dir);
          results.push(detected ?? { type: "node", pm: "bun" });
          break;
        }
        case "python": {
          const detected = await detectPython(dir);
          results.push(detected ?? { type: "python", pm: "uv" });
          break;
        }
        case "rust": {
          results.push({ type: "rust", pm: "cargo" });
          break;
        }
        case "go": {
          results.push({ type: "go", pm: "go" });
          break;
        }
      }
    }

    return results;
  }

  // Auto-detection: run all detectors in parallel
  const [node, python, rust, go] = await Promise.all([
    detectNode(dir),
    detectPython(dir),
    detectRust(dir),
    detectGo(dir),
  ]);

  return [node, python, rust, go].filter((e): e is DetectedEcosystem => e !== null);
}

/**
 * Format detected ecosystems for display.
 * Example output: "node (bun), python (uv)"
 */
export function formatEcosystems(ecosystems: DetectedEcosystem[]): string {
  return ecosystems.map((e) => `${e.type} (${e.pm})`).join(", ");
}
