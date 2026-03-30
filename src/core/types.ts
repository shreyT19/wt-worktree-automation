// Shared TypeScript types and interfaces for the wt CLI tool

// ============================================================================
// Ecosystem types
// ============================================================================

export type NodePM = "bun" | "npm" | "pnpm" | "yarn";
export type PythonPM = "uv" | "pip" | "poetry" | "pipenv";
export type EcosystemType = "node" | "python" | "rust" | "go";
export type EnvStrategy = "symlink" | "copy" | "skip";

export interface DetectedEcosystem {
  type: EcosystemType;
  pm: string;
  lockfile?: string;
  markerFile?: string;
}

// ============================================================================
// Install result types
// ============================================================================

export interface InstallResult {
  ecosystem: EcosystemType;
  success: boolean;
  durationMs: number;
  pm: string;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

// ============================================================================
// Env setup result types
// ============================================================================

export interface EnvFileResult {
  file: string;
  strategy: EnvStrategy;
  success: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

// ============================================================================
// Hook result types
// ============================================================================

export interface HookResult {
  command: string;
  success: boolean;
  durationMs: number;
  exitCode: number;
  error?: string;
}

// ============================================================================
// Shell execution types
// ============================================================================

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number; // ms
  input?: string;
}

// ============================================================================
// Git types
// ============================================================================

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  head: string;
  isBare: boolean;
  isLocked: boolean;
  isPrunable: boolean;
  isMain: boolean;
}

export interface AddWorktreeOptions {
  branch?: string;       // existing branch to checkout
  newBranch?: string;    // create new branch with this name
  from?: string;         // base branch/commit for new branch
  force?: boolean;
  detach?: boolean;
}

// ============================================================================
// Config types (matches .worktreerc schema)
// ============================================================================

export interface DetectConfig {
  types?: EcosystemType[];
}

export interface DepsCustomConfig {
  commands?: string[];
}

export interface DepsConfig {
  enabled?: boolean;
  node_pm?: NodePM;
  python_pm?: PythonPM;
  custom?: DepsCustomConfig;
}

export interface EnvConfig {
  strategy?: EnvStrategy;
  patterns?: string[];
  always_copy?: string[];
  exclude?: string[];
}

export interface FilesConfig {
  symlink?: string[];
  copy?: string[];
}

export interface PythonConfig {
  version?: string;
  requirements?: string;
  editable?: boolean;
}

export interface HooksConfig {
  pre_install?: string[];
  post_install?: string[];
  post_setup?: string[];
}

export interface WorktreeConfig {
  base_dir?: string;
  name_pattern?: string;
}

export interface LocalConfig {
  version?: number;
  detect?: DetectConfig;
  deps?: DepsConfig;
  env?: EnvConfig;
  files?: FilesConfig;
  python?: PythonConfig;
  hooks?: HooksConfig;
  worktree?: WorktreeConfig;
}

export interface GlobalUserConfig {
  branch_prefix?: string;
}

export interface GlobalDefaultsConfig {
  env_strategy?: EnvStrategy;
  base_dir?: string;
  auto_deps?: boolean;
}

export interface GlobalAliasesConfig {
  [alias: string]: string;
}

export interface GlobalConfig {
  user?: GlobalUserConfig;
  defaults?: GlobalDefaultsConfig;
  aliases?: GlobalAliasesConfig;
}

export interface MergedConfig {
  version: number;
  detect: { types: EcosystemType[] | null };
  deps: {
    enabled: boolean;
    node_pm: NodePM | null;
    python_pm: PythonPM | null;
    custom: DepsCustomConfig;
  };
  env: {
    strategy: EnvStrategy;
    patterns: string[];
    always_copy: string[];
    exclude: string[];
  };
  files: {
    symlink: string[];
    copy: string[];
  };
  python: {
    version: string;
    requirements: string | null;
    editable: boolean;
  };
  hooks: {
    pre_install: string[];
    post_install: string[];
    post_setup: string[];
  };
  worktree: {
    base_dir: string;
    name_pattern: string;
  };
  user: {
    branch_prefix: string | null;
  };
}

// ============================================================================
// Status types (matches .wt-status.json schema)
// ============================================================================

export type SetupOverallStatus = "ready" | "partial" | "failed" | "pending";

export interface DepStatusEntry {
  status: "ok" | "fail" | "skip";
  pm: string;
  durationMs: number;
  error?: string;
}

export interface EnvStatusEntry {
  strategy: EnvStrategy;
  files: string[];
  status: "ok" | "partial" | "fail" | "skip";
}

export interface HookStatusEntry {
  status: "ok" | "fail" | "skip";
  error?: string;
}

export interface WtStatus {
  version: number;
  setupAt: string;        // ISO timestamp
  ecosystems: EcosystemType[];
  deps: Partial<Record<EcosystemType, DepStatusEntry>>;
  env: EnvStatusEntry;
  hooks: {
    pre_install?: HookStatusEntry;
    post_install?: HookStatusEntry;
    post_setup?: HookStatusEntry;
  };
  overall: SetupOverallStatus;
}
