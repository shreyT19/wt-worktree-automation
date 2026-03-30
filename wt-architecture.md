# `wt` -- Worktree Automation System Architecture

**Status:** COMPLETE
**Author:** Shreyansh
**Date:** 2026-03-27
**Version:** 1.0

---

## 1. Problem Statement

When creating git worktrees for feature isolation (especially via Claude Code's `isolation: "worktree"`), the new worktree contains source code but lacks:

- Installed dependencies (node_modules, .venv, target/)
- Environment files (.env, .env.local, service-specific configs)
- Language-specific tooling setup (virtualenvs, lockfile resolution)

This leads to broken worktrees that require manual intervention, defeating the purpose of fast isolation.

---

## 2. Architecture Overview

### 2.1 Component Diagram

```
+----------------------------------------------------------------------+
|                        Developer Interface                           |
|                                                                      |
|   +------------------+       +-----------------------------------+   |
|   |   wt CLI         |       |  Claude Code Hooks                |   |
|   |  (shell script)  |       |  (PreToolUse / PostToolUse)       |   |
|   +--------+---------+       +------------------+----------------+   |
|            |                                    |                    |
|            v                                    v                    |
|   +--------------------------------------------------------+        |
|   |              wt-core (setup engine)                     |        |
|   |                                                         |        |
|   |  +-------------+  +-----------+  +------------------+   |        |
|   |  | Project      |  | Env       |  | Dependency       |   |        |
|   |  | Detector     |  | Manager   |  | Installer        |   |        |
|   |  +------+------+  +-----+-----+  +--------+---------+   |        |
|   |         |                |                 |             |        |
|   |         v                v                 v             |        |
|   |  +-------------+  +-----------+  +------------------+   |        |
|   |  | .worktreerc  |  | Symlink / |  | bun / uv / pip  |   |        |
|   |  | Parser       |  | Copy Ops  |  | / cargo / go    |   |        |
|   |  +-------------+  +-----------+  +------------------+   |        |
|   +--------------------------------------------------------+        |
|                                                                      |
+----------------------------------------------------------------------+

Legend:
  wt CLI         = User-facing command-line interface
  Claude Hooks   = Automatic trigger when Claude creates worktrees
  wt-core        = Shared setup logic invoked by either entry point
  Project Detect = Scans marker files to determine ecosystem(s)
  Env Manager    = Handles .env symlink/copy/skip per config
  Dep Installer  = Runs ecosystem-appropriate install commands
  .worktreerc    = Per-repo config file defining custom setup
```

### 2.2 Technology Choice: Shell Script (POSIX sh + bash extensions)

**Rationale:**
- Zero runtime dependencies -- works on any dev machine without installing Node/Python first
- Git itself is a shell-native tool; worktree commands compose naturally
- Bun install is ~1-3s, uv is ~0.5-2s -- shell overhead is negligible
- Claude Code hooks execute shell commands natively
- Easier to install: single file, `chmod +x`, add to PATH

**Trade-off considered:** A Node.js CLI (via bun) would give better JSON parsing and cross-platform support, but adds a bootstrapping problem (need bun to install bun dependencies). Shell avoids this entirely.

---

## 3. Data Flow: Worktree Creation

### 3.1 Direct CLI Invocation

```
User runs: wt add feat-billing

  1. Parse arguments
     |
  2. Resolve branch name (shreyansh/feat-billing)
     |
  3. Resolve worktree path ($WT_BASE_DIR/feat-billing or ../repo-feat-billing)
     |
  4. Execute: git worktree add <path> -b <branch>
     |
  5. cd into new worktree
     |
  6. Load .worktreerc (if exists) from worktree root
     |     |
     |     +-- Override defaults for: deps, env strategy, post-setup
     |
  7. PROJECT DETECTION (parallel scan)
     |-- package.json?        --> Node.js project
     |-- bun.lockb?           --> bun (preferred)
     |-- package-lock.json?   --> npm
     |-- pnpm-lock.yaml?      --> pnpm
     |-- yarn.lock?           --> yarn
     |-- requirements.txt?    --> pip
     |-- pyproject.toml?      --> check for [tool.poetry] or [tool.uv] or [build-system]
     |-- Pipfile?             --> pipenv
     |-- Cargo.toml?          --> Rust/cargo
     |-- go.mod?              --> Go
     |
  8. DEPENDENCY INSTALLATION (per detected ecosystem)
     |-- Node: bun install --frozen-lockfile
     |-- Python: uv venv && uv pip install -r requirements.txt
     |-- Rust: cargo fetch
     |-- Go: go mod download
     |
  9. ENV FILE SETUP
     |-- Scan main worktree for .env* files
     |-- Apply strategy per .worktreerc (default: symlink)
     |     |-- symlink: ln -s <main>/.env <worktree>/.env
     |     |-- copy: cp <main>/.env <worktree>/.env
     |     |-- skip: do nothing
     |
 10. POST-SETUP SCRIPTS (from .worktreerc)
     |-- Run custom commands (e.g., db migrate, codegen)
     |
 11. OUTPUT: Summary of what was set up
     |
 12. DONE -- worktree ready for development
```

### 3.2 Claude Code Hook Invocation

```
Claude Code agent creates worktree (isolation: "worktree")
     |
     v
PostToolUse hook fires (matcher: "Bash" with pattern "git worktree add")
     |
     v
Hook script extracts worktree path from command output
     |
     v
Runs: wt setup <worktree-path>
     |
     v
Steps 6-12 from above execute automatically
```

---

## 4. `.worktreerc` Schema Definition

### 4.1 Format: TOML

**Rationale:** TOML is human-readable, git-friendly (clean diffs), and parsable with simple shell tools or a small parser. JSON would work but is less pleasant to hand-edit. YAML has parsing ambiguities.

### 4.2 Full Schema

```toml
# .worktreerc -- Worktree automation configuration
# This file is safe to commit (contains no secrets)

# Schema version for forward compatibility
version = 1

# =============================================================================
# [detect] -- Override automatic project type detection
# =============================================================================
[detect]
# Explicitly declare project types (skips auto-detection)
# Valid values: "node", "python", "rust", "go", "mixed"
# If omitted, wt auto-detects from marker files
types = ["node", "python"]

# =============================================================================
# [deps] -- Dependency installation configuration
# =============================================================================
[deps]
# Enable/disable automatic dependency installation (default: true)
enabled = true

# Override the detected package manager
# Node options:  "bun", "npm", "pnpm", "yarn"
# Python options: "uv", "pip", "poetry", "pipenv"
# If omitted, wt auto-detects from lockfiles
node_pm = "bun"
python_pm = "uv"

# Custom install commands (overrides all auto-detection)
# Use this for monorepos or unusual setups
# Each command runs from the worktree root
[deps.custom]
commands = [
    "bun install --frozen-lockfile",
    "cd services/api && uv venv && uv pip install -e '.[dev]'",
]

# =============================================================================
# [env] -- Environment file handling
# =============================================================================
[env]
# Strategy for .env files: "symlink" | "copy" | "skip"
# symlink: All worktrees share the same .env (changes propagate instantly)
# copy:    Each worktree gets its own .env (independent, can diverge)
# skip:    Do not touch .env files
strategy = "symlink"

# Glob patterns for env files to process (relative to repo root)
# Default: [".env", ".env.local", ".env.development"]
patterns = [
    ".env",
    ".env.local",
    ".env.development",
    "services/*/.env",
    "services/*/.env.local",
]

# Files that should ALWAYS be copied (never symlinked), even if strategy = "symlink"
# Use for files that worktrees may need to modify independently
always_copy = [
    ".env.test",
]

# Files to explicitly exclude from env handling
exclude = [
    ".env.production",
    ".env.staging",
]

# =============================================================================
# [files] -- Additional files/directories to symlink or copy
# =============================================================================
[files]

# Symlink these paths from the main worktree to the new worktree
# Useful for large binary assets, shared caches, etc.
symlink = [
    "node_modules/.cache",
    ".pytest_cache",
]

# Copy these paths (useful for config files that may need local edits)
copy = [
    ".vscode/settings.json",
]

# =============================================================================
# [python] -- Python-specific configuration
# =============================================================================
[python]
# Python version to use for venv (default: "python3")
version = "python3.11"

# Path to requirements file (default: auto-detect)
requirements = "requirements/dev.txt"

# Install in editable mode (default: false)
editable = true

# =============================================================================
# [hooks] -- Custom scripts to run during setup
# =============================================================================
[hooks]
# Commands to run BEFORE dependency installation
pre_install = [
    "echo 'Starting worktree setup...'",
]

# Commands to run AFTER dependency installation
post_install = [
    "bun run db:migrate",
    "bun run codegen",
]

# Commands to run AFTER everything is complete
post_setup = [
    "echo 'Worktree ready!'",
]

# =============================================================================
# [worktree] -- Worktree path configuration
# =============================================================================
[worktree]
# Base directory for worktrees (default: sibling to main repo)
# Supports ~ expansion and environment variables
base_dir = "../worktrees"

# Naming pattern for worktree directories
# Variables: {repo}, {branch}, {short_branch}
# Default: "{repo}-{short_branch}"
name_pattern = "{repo}-{short_branch}"
```

### 4.3 Schema Validation Rules

| Field | Type | Default | Required |
|---|---|---|---|
| `version` | integer | `1` | yes |
| `detect.types` | string[] | auto | no |
| `deps.enabled` | boolean | `true` | no |
| `deps.node_pm` | enum | auto | no |
| `deps.python_pm` | enum | auto | no |
| `deps.custom.commands` | string[] | `[]` | no |
| `env.strategy` | enum("symlink","copy","skip") | `"symlink"` | no |
| `env.patterns` | string[] | `[".env", ".env.local"]` | no |
| `env.always_copy` | string[] | `[]` | no |
| `env.exclude` | string[] | `[]` | no |
| `files.symlink` | string[] | `[]` | no |
| `files.copy` | string[] | `[]` | no |
| `python.version` | string | `"python3"` | no |
| `python.requirements` | string | auto | no |
| `python.editable` | boolean | `false` | no |
| `hooks.pre_install` | string[] | `[]` | no |
| `hooks.post_install` | string[] | `[]` | no |
| `hooks.post_setup` | string[] | `[]` | no |
| `worktree.base_dir` | string | `"../"` | no |
| `worktree.name_pattern` | string | `"{repo}-{short_branch}"` | no |

---

## 5. CLI Interface Design

### 5.1 Command Structure

```
wt <command> [options] [arguments]
```

### 5.2 Commands

#### `wt add <branch> [--from <base>] [--no-deps] [--no-env] [--path <dir>]`

Primary command. Creates a worktree and runs full setup.

```
USAGE:
    wt add <branch> [options]

ARGUMENTS:
    <branch>        Branch name. Auto-prefixed with user prefix if configured.
                    Examples: "feat-billing" -> creates branch "shreyansh/feat-billing"

OPTIONS:
    --from <base>   Base branch to create from (default: current branch)
    --no-deps       Skip dependency installation
    --no-env        Skip .env file setup
    --no-hooks      Skip pre/post hooks
    --path <dir>    Override worktree directory path
    --dry-run       Show what would be done without doing it
    --existing      Use an existing branch instead of creating a new one

EXAMPLES:
    wt add feat-billing                    # Create worktree + branch from current
    wt add feat-billing --from main        # Branch from main
    wt add fix-auth --no-deps             # Skip deps (e.g., quick text fix)
    wt add feat-ui --path ~/worktrees/ui  # Custom path
    wt add release/v2 --existing          # Checkout existing branch
```

#### `wt setup [<path>]`

Run setup on an existing worktree (or current directory). This is the command Claude Code hooks invoke.

```
USAGE:
    wt setup [<path>]

ARGUMENTS:
    <path>          Path to worktree (default: current directory)

OPTIONS:
    --no-deps       Skip dependency installation
    --no-env        Skip .env file setup
    --no-hooks      Skip pre/post hooks
    --force         Re-run setup even if already completed

EXAMPLES:
    wt setup                              # Setup current directory
    wt setup ../myrepo-feat-billing       # Setup specific worktree
    wt setup --force                      # Re-run (e.g., after .worktreerc change)
```

#### `wt list`

List all worktrees with their setup status.

```
USAGE:
    wt list [options]

OPTIONS:
    --json          Output as JSON (for scripting)
    --status        Show detailed setup status per worktree

OUTPUT EXAMPLE:
    BRANCH                     PATH                          DEPS    ENV     STATUS
    main                       /Users/dev/myrepo             -       -       (bare)
    shreyansh/feat-billing     /Users/dev/myrepo-feat-bill   ok      ok      ready
    shreyansh/fix-auth         /Users/dev/myrepo-fix-auth    skip    ok      ready
    shreyansh/feat-ui          /Users/dev/myrepo-feat-ui     fail    ok      partial
```

#### `wt remove <branch> [--force]`

Remove a worktree cleanly.

```
USAGE:
    wt remove <branch> [options]

ARGUMENTS:
    <branch>        Branch name or worktree path

OPTIONS:
    --force         Force removal even with uncommitted changes
    --keep-branch   Do not delete the branch after removing the worktree

BEHAVIOR:
    1. Check for uncommitted changes (fail if found, unless --force)
    2. Run cleanup hooks from .worktreerc (if defined)
    3. git worktree remove <path>
    4. git branch -d <branch> (unless --keep-branch)
    5. Clean up any dangling symlinks
```

#### `wt cd <branch>`

Print the path to a worktree (for use with cd).

```
USAGE:
    eval $(wt cd <branch>)
    # Or with shell function:
    # wtcd() { cd "$(wt cd "$1")" }

ARGUMENTS:
    <branch>        Branch name (partial match supported)
```

#### `wt init`

Create a `.worktreerc` file interactively.

```
USAGE:
    wt init [options]

OPTIONS:
    --defaults      Use sensible defaults without prompting

BEHAVIOR:
    1. Detect project types in current directory
    2. Scan for .env files
    3. Generate .worktreerc with detected configuration
    4. Prompt for customization (unless --defaults)
```

#### `wt doctor`

Diagnose worktree setup issues.

```
USAGE:
    wt doctor [<path>]

CHECKS:
    - Git version supports worktrees (>= 2.5)
    - .worktreerc syntax is valid
    - Env files exist in main worktree
    - Package managers are installed
    - Symlinks are not broken
    - Dependencies are installed correctly
```

### 5.3 Global Configuration (`~/.config/wt/config.toml`)

```toml
# Global wt configuration (user-level)

[user]
# Branch prefix (auto-prepended to branch names)
branch_prefix = "shreyansh"

[defaults]
# Default env strategy when no .worktreerc exists
env_strategy = "symlink"

# Default base directory pattern
# {parent} = parent of the repo root
# {repo}   = repo directory name
base_dir = "{parent}/worktrees/{repo}"

# Auto-detect and install deps by default
auto_deps = true

[aliases]
# Custom command aliases
a = "add"
r = "remove"
l = "list"
s = "setup"
```

---

## 6. Claude Code Integration

### 6.1 Hook Architecture

Claude Code supports `PreToolUse` and `PostToolUse` hooks that fire when tools (Bash, Write, etc.) are invoked. The `wt` integration uses a **PostToolUse** hook on the Bash tool.

### 6.2 PostToolUse Hook for Worktree Detection

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/shreyt19/.local/bin/wt-claude-hook"
          }
        ]
      }
    ]
  }
}
```

### 6.3 Hook Script Logic (`wt-claude-hook`)

```
INPUT:  $CLAUDE_TOOL_INPUT (JSON with the Bash command that was run)
        $CLAUDE_TOOL_OUTPUT (JSON with the command output)

LOGIC:
  1. Parse $CLAUDE_TOOL_INPUT for the command string
  2. Check if command matches pattern: "git worktree add *"
  3. If no match, exit 0 (no-op)
  4. Extract worktree path from command arguments or from $CLAUDE_TOOL_OUTPUT
  5. Run: wt setup <extracted_path>
  6. Output setup summary to stdout (Claude sees this as hook output)
  7. Exit 0
```

### 6.4 Interaction with `EnterWorktree` / `ExitWorktree` Tools

Claude Code has built-in `EnterWorktree` and `ExitWorktree` deferred tools. The hook should also match these:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "EnterWorktree",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/shreyt19/.local/bin/wt-claude-hook --mode=enter"
          }
        ]
      }
    ]
  }
}
```

When `EnterWorktree` fires, the hook:
1. Reads the worktree path from `$CLAUDE_TOOL_INPUT`
2. Checks if setup has already been run (presence of `.wt-setup-done` marker file)
3. If not set up, runs `wt setup <path>`
4. Creates `.wt-setup-done` marker with timestamp

### 6.5 Integration Sequence Diagram

```
Claude Code Agent                      wt System
      |                                    |
      |  "Create worktree for feat-x"     |
      |                                    |
      |--- git worktree add ../feat-x -b feat-x
      |                                    |
      |   [PostToolUse hook fires]         |
      |------------------------------------+
      |                                    |
      |              wt-claude-hook parses command
      |              detects "git worktree add"
      |              extracts path: ../feat-x
      |                                    |
      |              wt setup ../feat-x    |
      |                |                   |
      |                +-- detect project  |
      |                +-- install deps    |
      |                +-- setup .env      |
      |                +-- run hooks       |
      |                                    |
      |   [hook returns summary to agent]  |
      |<-----------------------------------+
      |                                    |
      |  Agent continues with ready worktree
      |
```

---

## 7. Cross-Ecosystem Support

### 7.1 Detection Matrix

```
+-------------------+--------------------+-------------------+---------------------+
| Marker File       | Ecosystem          | Sub-detection     | Default PM          |
+-------------------+--------------------+-------------------+---------------------+
| package.json      | Node.js            | bun.lockb -> bun  | bun (user pref)     |
|                   |                    | pnpm-lock.yaml    |                     |
|                   |                    | yarn.lock         |                     |
|                   |                    | package-lock.json |                     |
+-------------------+--------------------+-------------------+---------------------+
| requirements.txt  | Python             | (plain pip/uv)    | uv                  |
| pyproject.toml    | Python             | [tool.poetry]     | poetry              |
|                   |                    | [tool.uv]         | uv                  |
|                   |                    | [build-system]    | uv (fallback)       |
| Pipfile           | Python             | (pipenv)          | pipenv              |
+-------------------+--------------------+-------------------+---------------------+
| Cargo.toml        | Rust               | -                 | cargo               |
+-------------------+--------------------+-------------------+---------------------+
| go.mod            | Go                 | -                 | go                  |
+-------------------+--------------------+-------------------+---------------------+
```

### 7.2 Node.js Handling

```
detect_node_pm():
    if exists bun.lockb      -> return "bun"
    if exists pnpm-lock.yaml -> return "pnpm"
    if exists yarn.lock      -> return "yarn"
    if exists package-lock.json -> return "npm"
    # Fallback: check .worktreerc, then global config, then "bun"
    return config.deps.node_pm || global.defaults.node_pm || "bun"

install_node(pm):
    case $pm in
        bun)   bun install --frozen-lockfile ;;
        npm)   npm ci ;;
        pnpm)  pnpm install --frozen-lockfile ;;
        yarn)  yarn install --frozen-lockfile ;;
    esac
```

**Key decision: `--frozen-lockfile` always.** Worktrees should reproduce the exact dependency tree. If the lockfile is stale, that is a problem to surface, not silently fix.

### 7.3 Python Handling

```
detect_python_pm():
    if exists Pipfile         -> return "pipenv"
    if exists pyproject.toml:
        if contains [tool.poetry]  -> return "poetry"
        if contains [tool.uv]     -> return "uv"
    if exists requirements.txt -> return "uv"  # prefer uv over pip
    return config.deps.python_pm || "uv"

install_python(pm, worktree_path):
    case $pm in
        uv)
            uv venv "$worktree_path/.venv"
            uv pip install -r requirements.txt --python "$worktree_path/.venv/bin/python"
            ;;
        pip)
            python3 -m venv "$worktree_path/.venv"
            "$worktree_path/.venv/bin/pip" install -r requirements.txt
            ;;
        poetry)
            cd "$worktree_path" && poetry install
            ;;
        pipenv)
            cd "$worktree_path" && pipenv install --dev
            ;;
    esac
```

**Key decision: Always create a NEW venv per worktree.** Symlinked venvs break because they contain absolute paths. Each worktree must have its own isolated `.venv`.

### 7.4 Mixed Repos (Monorepo Pattern)

For repos that are both Python + Node:

```
detect_all():
    ecosystems = []
    if has_node_markers   -> ecosystems += ["node"]
    if has_python_markers -> ecosystems += ["python"]
    if has_rust_markers   -> ecosystems += ["rust"]
    if has_go_markers     -> ecosystems += ["go"]
    return ecosystems

setup_all(ecosystems):
    for eco in ecosystems:
        install_$eco()
```

The `.worktreerc` `[detect]` section can explicitly declare `types = ["node", "python"]` to skip scanning and ensure correct ordering.

For monorepos with nested projects (e.g., `services/api/` is Python, `services/web/` is Node):

```toml
[deps.custom]
commands = [
    "cd services/web && bun install --frozen-lockfile",
    "cd services/api && uv venv .venv && uv pip install -e '.[dev]'",
]
```

Custom commands override auto-detection entirely when present.

---

## 8. Error Handling Strategy

### 8.1 Error Categories and Responses

| Category | Example | Severity | Behavior |
|---|---|---|---|
| **Git failure** | Branch already exists, path conflict | Fatal | Abort entirely, clean up partial state |
| **PM not found** | `bun` not installed | Degraded | Warn, skip deps, continue with env setup |
| **Dep install fail** | Network error, lockfile conflict | Non-fatal | Warn, mark as "partial", continue |
| **Env file missing** | Source .env doesn't exist in main | Non-fatal | Warn per file, continue |
| **Symlink conflict** | Target .env already exists | Non-fatal | Skip with warning (never overwrite) |
| **Hook script fail** | post_install command returns non-zero | Non-fatal | Warn, continue remaining hooks |
| **Config parse fail** | Malformed .worktreerc | Fatal | Abort setup, show parse error location |
| **Permission error** | Cannot write to target directory | Fatal | Abort with clear error message |

### 8.2 Cleanup on Fatal Error

```
on_fatal_error():
    if worktree_was_created:
        echo "Setup failed. Worktree exists at $path but is not fully configured."
        echo "To retry: wt setup $path"
        echo "To remove: wt remove $branch"
    # NEVER auto-remove the worktree on failure -- the user may want to inspect or fix
```

**Key decision: Never auto-rollback worktree creation.** The git worktree itself is valid; only the setup failed. Let the user decide whether to retry (`wt setup`) or remove (`wt remove`).

### 8.3 Setup Status Tracking

Each worktree gets a `.wt-status.json` marker file:

```json
{
  "version": 1,
  "setup_at": "2026-03-27T14:30:00Z",
  "ecosystems": ["node", "python"],
  "deps": {
    "node": { "status": "ok", "pm": "bun", "duration_ms": 1200 },
    "python": { "status": "ok", "pm": "uv", "duration_ms": 800 }
  },
  "env": {
    "strategy": "symlink",
    "files": [".env", ".env.local", "services/api/.env"],
    "status": "ok"
  },
  "hooks": {
    "post_install": { "status": "ok" },
    "post_setup": { "status": "ok" }
  },
  "overall": "ready"
}
```

This file:
- Prevents re-running setup unnecessarily (Claude hook checks it)
- Enables `wt list --status` to show detailed state
- Is gitignored (added to `.git/info/exclude` automatically)
- Enables `wt setup --force` to re-run by deleting and recreating it

### 8.4 Logging

```
Log location: ~/.local/share/wt/logs/<repo>-<branch>.log
Log format:   [timestamp] [level] message

Levels:
  INFO    Normal operations (detecting project, installing deps)
  WARN    Non-fatal issues (missing .env, PM not found)
  ERROR   Fatal issues (git failure, permission error)
  DEBUG   Detailed output (full command outputs, timing)

Default verbosity: INFO
--verbose flag:    DEBUG
--quiet flag:      ERROR only
```

---

## 9. Security Considerations

### 9.1 Secrets in .env Files

**Threat:** .env files contain AWS keys, database credentials, API tokens. Mishandling them creates risk.

| Concern | Mitigation |
|---|---|
| Symlinked .env visible in worktree | Symlinks point to main worktree, not copies. Single source of truth. `.env` should already be in `.gitignore`. |
| Copied .env creates duplicate secrets | `wt remove` cleans up copied files. `wt doctor` warns about orphaned .env copies. |
| .worktreerc leaks secrets | Schema forbids secret values. .worktreerc is designed to be committed. Only references strategies, not values. |
| Worktree .env committed accidentally | `wt add` verifies `.gitignore` includes `.env*`. Warns if not. |
| `.wt-status.json` contains paths | No secrets in status file. Only paths, timestamps, statuses. |
| Log files contain secret output | Log commands but NOT their stdout/stderr by default. `--debug` warns about verbose output. |

### 9.2 .worktreerc Execution Safety

The `.worktreerc` `[hooks]` section allows arbitrary command execution. This is an intentional design choice (similar to npm scripts, Makefiles, etc.) but requires care:

**Mitigations:**
1. **Audit trail:** All hook commands are logged before execution
2. **Explicit opt-in:** Hooks only run if `.worktreerc` exists and contains `[hooks]`
3. **First-run prompt:** When a `.worktreerc` is encountered for the first time (no `.wt-status.json`), show the hooks that will run and prompt for confirmation (unless `--yes` flag)
4. **No network-fetched configs:** `.worktreerc` must exist in the repo itself, never downloaded
5. **Sandboxing consideration (future):** Could run hooks in a restricted shell, but this limits utility. Left as opt-in for v2.

### 9.3 Path Traversal

The `base_dir` and custom paths in `.worktreerc` could theoretically point outside expected boundaries.

**Mitigations:**
- Resolve all paths to absolute and verify they are within `$HOME` or a configured safe zone
- Reject paths containing `..` that escape the repo parent directory
- Worktree paths must not overlap with the main repo path

### 9.4 Symlink Safety

Symlinks created by `wt` must not:
- Point to files outside the main worktree (no symlink-following attacks)
- Overwrite existing files (always check before creating)
- Create circular symlinks

---

## 10. Implementation Phases

### Phase 1: Core MVP
- `wt add` with auto-detection for Node (bun) and Python (uv)
- `.env` symlink support (single strategy, no config file)
- `wt list` and `wt remove`
- Global config for branch prefix

### Phase 2: Configuration
- `.worktreerc` parser (TOML subset -- only the fields defined above)
- Custom hooks (pre_install, post_install, post_setup)
- Mixed ecosystem support
- `wt init` scaffolding
- `wt doctor` diagnostics

### Phase 3: Claude Code Integration
- PostToolUse hook for `git worktree add`
- PostToolUse hook for `EnterWorktree`
- Setup status tracking (`.wt-status.json`)
- Idempotent re-entry (skip if already set up)

### Phase 4: Polish
- `wt cd` with fuzzy matching
- Parallel dependency installation (Node + Python simultaneously)
- Rust and Go ecosystem support
- `wt setup --force` for re-running
- Comprehensive logging

---

## 11. Open Design Questions

| # | Question | Current Lean | Trade-off |
|---|---|---|---|
| 1 | Symlink vs copy as default .env strategy? | Symlink | Symlink saves disk, propagates changes, but worktrees cannot have independent configs |
| 2 | Should `wt add` auto-cd into the new worktree? | No (print path) | Shell functions cannot change parent shell's cwd; provide `eval $(wt cd ...)` helper |
| 3 | TOML parser in pure shell or require a dependency? | Ship a minimal TOML parser as part of `wt` | Limits TOML features but avoids deps; alternatively use `dasel` or `tomlq` if available |
| 4 | Should node_modules be symlinked between worktrees? | No | Saves disk (~200MB) but causes issues with native modules, different Node versions, etc. |
| 5 | How to handle worktrees for bare repos? | Detect and support | Different path resolution needed; rare but worth supporting in Phase 4 |
| 6 | Should `wt` manage branch naming conventions? | Yes, via config | Nice UX but opinionated; make prefix optional |

---

## 12. File Structure of `wt` Tool

```
wt/
  bin/
    wt                      # Main CLI entry point (bash)
    wt-claude-hook          # Claude Code PostToolUse hook script
  lib/
    detect.sh               # Project type detection functions
    deps.sh                 # Dependency installation functions
    env.sh                  # Environment file handling functions
    config.sh               # .worktreerc TOML parser
    status.sh               # .wt-status.json read/write
    log.sh                  # Logging utilities
    utils.sh                # Path resolution, color output, etc.
  completions/
    wt.zsh                  # Zsh completions
    wt.bash                 # Bash completions
  install.sh                # Installer script (symlinks to ~/.local/bin)
```

---

## Appendix A: Example .worktreerc for Zenskar Backend

```toml
version = 1

[detect]
types = ["python"]

[deps]
python_pm = "uv"

[python]
version = "python3.11"
requirements = "requirements/dev.txt"
editable = true

[env]
strategy = "symlink"
patterns = [
    ".env",
    ".env.local",
    "services/*/.env",
]
exclude = [
    ".env.production",
    ".env.staging",
]

[hooks]
post_install = [
    "python manage.py migrate --check",
]

[worktree]
base_dir = "../worktrees/backend"
```

## Appendix B: Example .worktreerc for Node Frontend

```toml
version = 1

[detect]
types = ["node"]

[deps]
node_pm = "bun"

[env]
strategy = "symlink"
patterns = [".env", ".env.local"]

[hooks]
post_install = [
    "bun run codegen",
]

[worktree]
base_dir = "../worktrees/frontend"
```
