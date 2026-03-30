# wt — worktree automation

Instantly create a fully configured git worktree with dependencies installed and `.env` files in place.

---

## The Problem

Switching between features in a large codebase means either stashing changes, losing your running dev server, or waiting for `bun install` / `uv sync` to finish every time you context-switch. Git worktrees solve the isolation problem, but they arrive as empty checkouts — you still have to manually install packages, copy `.env` files, and run any required codegen before you can start work.

## The Solution

`wt` wraps `git worktree add` with a four-step setup pipeline: create the worktree, detect your project ecosystem, install dependencies, and wire up environment files — all in one command. Configuration lives in a `.worktreerc` file you commit alongside your code, so every developer on the team gets the same setup behaviour automatically.

---

## Quick Demo

```
$ wt add feat-billing

Creating worktree for branch 'shreyansh/feat-billing'
  path: ../worktrees/myapp-feat-billing

[1/4] Creating worktree ........................ done (312ms)
[2/4] Detecting project type .................. node(bun), python(uv) (28ms)
[3/4] Installing dependencies ................. done (8.4s)
[4/4] Setting up env files .................... 2 files (11ms)

Worktree ready at: /Users/dev/worktrees/myapp-feat-billing
  Branch: shreyansh/feat-billing
  cd into it:  cd "/Users/dev/worktrees/myapp-feat-billing"
```

---

## Installation

### Prerequisites

- **bun** >= 1.0 — `curl -fsSL https://bun.sh/install | bash`
- **git** >= 2.5 — worktree support was added in git 2.5

### Quick install

```bash
git clone https://github.com/shreyT19/git-wt ~/tools/wt
cd ~/tools/wt
./install.sh
```

The installer is interactive and will:

1. Verify prerequisites
2. Run `bun install`
3. Create a `wt` wrapper script in `~/.local/bin` (or a `--prefix` of your choice)
4. Optionally install the `post-checkout` git hook into your repos
5. Optionally configure Claude Code hooks in `~/.claude/settings.json`
6. Optionally install shell completions for zsh or bash

For unattended installs:

```bash
./install.sh --non-interactive --prefix ~/.local
```

### Manual install

If you prefer full control:

```bash
# 1. Clone and install dependencies
git clone https://github.com/shreyT19/git-wt ~/tools/wt
cd ~/tools/wt && bun install

# 2. Create the wt wrapper (adjust path as needed)
cat > ~/.local/bin/wt <<'EOF'
#!/usr/bin/env bash
exec bun run /path/to/wt/src/index.ts "$@"
EOF
chmod +x ~/.local/bin/wt

# 3. Ensure the bin dir is on PATH
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

### Verify installation

```bash
wt --version   # wt v0.1.0
wt doctor      # runs a checklist of all prerequisites
```

---

## Getting Started

**1. Generate a config for your repo**

Run this from your repository root:

```bash
cd ~/projects/myapp
wt init
```

`wt init` scans for package managers and `.env` files, then writes a `.worktreerc`. Review the preview, press Enter to confirm, then commit the file:

```bash
git add .worktreerc && git commit -m 'chore: add worktreerc'
```

**2. Create your first worktree**

```bash
wt add feat-payments
```

This creates the branch, runs the full setup pipeline, and prints the path when done.

**3. See all worktrees**

```bash
wt list
```

```
  BRANCH                          PATH                                  DEPS    ENV     STATUS
  ------------------------------------------------------------------------------------------------
> main                            /Users/dev/myapp                      ok      ok      ready
  shreyansh/feat-payments         /Users/dev/worktrees/myapp-feat-p...  ok      ok      ready
```

---

## Commands Reference

### `wt add <branch>`

Create a new git worktree and run the full setup pipeline.

```
wt add <branch> [options]

OPTIONS:
    --from <base>     Base branch or commit to create the new branch from
                      (default: current HEAD)
    --existing        Check out an existing branch instead of creating one
    --path <dir>      Override the worktree directory path
    --no-deps         Skip dependency installation
    --no-env          Skip .env file setup
    --no-hooks        Skip pre/post hook commands
    --bare            Create a bare worktree (no branch checkout)
    --dry-run         Print what would happen without executing anything
    --copy-from <b>   Copy node_modules from an existing worktree instead
                      of fresh install (uses clonefile on macOS)
    --exec, -x <cmd>  Run a command inside the new worktree after setup
```

**Examples**

```bash
# Create a worktree branching from current HEAD
wt add feat-billing

# Branch from main, with a branch prefix applied automatically
wt add feat-billing --from main
# -> creates shreyansh/feat-billing if branch_prefix = "shreyansh" in global config

# Custom path
wt add feat-ui --path ~/worktrees/ui

# Check out an existing branch (e.g. a colleague's PR branch)
wt add release/v2 --existing

# Quick worktree for a code review — skip the slow install step
wt add fix-typo --no-deps

# Copy deps from main worktree instead of reinstalling (instant on macOS)
wt add feat-billing --copy-from main

# Create worktree and open VS Code in it
wt add feat-billing --exec "code ."

# Create worktree and launch Claude Code
wt add feat-billing -x claude

# Preview without making changes
wt add feat-billing --dry-run
```

**Exit codes**: `0` success, `1` error (see output for details).

---

### `wt setup [path]`

Run the setup pipeline on an existing worktree. This is the command invoked automatically by the git hook and Claude Code hook.

```
wt setup [path] [options]

ARGUMENTS:
    [path]     Path to the worktree to set up (default: current directory)

OPTIONS:
    --force      Re-run even if setup was already completed
    --clean      Remove node_modules / .venv before reinstalling
    --no-deps    Skip dependency installation
    --no-env     Skip .env file setup
    --no-hooks   Skip hook commands
```

**Examples**

```bash
# Set up the current directory
wt setup

# Set up a specific worktree by path
wt setup ../myapp-feat-billing

# Re-run after changing .worktreerc
wt setup --force

# Clean reinstall (removes node_modules and .venv first)
wt setup --clean --force
```

**Exit codes**: `0` success, `1` fatal error, `2` completed with warnings.

---

### `wt list`

List all git worktrees with their setup status.

```
wt list [options]

OPTIONS:
    --json     Output as JSON (for scripting)
    --status   Show per-worktree ecosystem and timing detail
```

**Examples**

```bash
wt list
wt list --status      # show ecosystems, env strategy, setup timestamp
wt list --json        # machine-readable output
```

The `>` prefix marks your current working directory. Status values:

| Status    | Meaning                                         |
|-----------|-------------------------------------------------|
| `ready`   | Setup completed successfully                    |
| `partial` | Setup ran but one or more steps had warnings    |
| `failed`  | Setup could not complete                        |
| `pending` | Worktree created but setup has not run yet      |
| `-`       | Bare worktree or no status file                 |

**Exit codes**: `0` always (list commands do not fail).

---

### `wt remove <branch>`

Remove a git worktree cleanly, checking for uncommitted changes first.

```
wt remove <branch> [options]

ARGUMENTS:
    <branch>     Branch name or partial match.
                 "feat" matches "shreyansh/feat-billing"

OPTIONS:
    --force        Remove even if there are uncommitted changes;
                   also force-deletes the branch (-D instead of -d)
    --keep-branch  Remove the worktree but keep the git branch
```

**Behaviour**

1. Find the worktree by branch name (exact or partial match)
2. Check for uncommitted changes — abort unless `--force`
3. Run `git worktree remove`
4. Delete the git branch with `git branch -d` (unless `--keep-branch`)

**Examples**

```bash
wt remove feat-billing
wt remove feat-billing --keep-branch   # preserve the branch for later
wt remove feat-billing --force         # discard uncommitted changes
```

**Exit codes**: `0` success, `1` error, `2` partial success (worktree removed but branch deletion failed).

---

### `wt cd <branch>`

Print the absolute path to a worktree. Use with command substitution to navigate.

```
wt cd <branch>

ARGUMENTS:
    <branch>    Branch name (partial matching supported)
```

`wt cd` writes the path to stdout and all other output to stderr, so the path can be captured cleanly.

**Examples**

```bash
# Direct use
cd "$(wt cd feat-billing)"

# Partial match — "feat" resolves to "shreyansh/feat-billing" unambiguously
cd "$(wt cd feat)"
```

**Recommended shell function** — add to `~/.zshrc` or `~/.bashrc`:

```bash
wtcd() { cd "$(wt cd "$1")" }
```

Then `wtcd feat` navigates directly.

**Exit codes**: `0` success (path printed), `1` no match or ambiguous match.

---

### `wt init`

Interactively generate a `.worktreerc` for the current repository.

```
wt init [options]

OPTIONS:
    --defaults    Write the file immediately using detected defaults,
                  without prompting for confirmation
```

**Behaviour**

1. Detect project ecosystems by scanning for marker files
2. Scan for `.env` files (root and one level deep)
3. Generate a `.worktreerc` tailored to what was found
4. Show a preview and ask for confirmation (skipped with `--defaults`)
5. Write `.worktreerc` to the repo root

**Examples**

```bash
wt init                  # interactive — shows preview before writing
wt init --defaults       # write immediately, no prompts
```

**Exit codes**: `0` success or user-aborted, `1` not in a git repository.

---

### `wt doctor [path]`

Diagnose setup issues. Runs a checklist and prints pass/warn/fail for each item.

```
wt doctor [path]

ARGUMENTS:
    [path]    Directory to diagnose (default: current directory)
```

**Checks performed**

- git version >= 2.5
- `.worktreerc` TOML syntax is valid (if present)
- `.gitignore` covers `.env` files
- Required package managers are on PATH (bun, uv, npm, etc.)
- `.env` files referenced in `env.patterns` exist in the main worktree
- Symlinks in the worktree are not broken
- `node_modules` / `.venv` are present when expected

**Examples**

```bash
wt doctor                            # check current directory
wt doctor ../myapp-feat-billing      # check a specific worktree
```

Output format:

```
  [ ok ]  git version >= 2.5 (worktree support)
           git version 2.47.1
  [warn]  .env file: .env.local
           Not found in main worktree
           fix: Create the file or remove it from env.patterns
  [ ok ]  node_modules present
```

**Exit codes**: `0` all passed, `1` one or more failures, `2` warnings only.

---

### `wt shell-init [shell]`

Print a shell function that makes `wt cd` actually change your working directory.

```
wt shell-init [zsh|bash|fish]
```

**Setup (one-time)**

```bash
# Zsh — add to ~/.zshrc
eval "$(wt shell-init zsh)"

# Bash — add to ~/.bashrc
eval "$(wt shell-init bash)"

# Fish — add to ~/.config/fish/config.fish
wt shell-init fish | source
```

After sourcing, these work as real `cd`:

```bash
wt cd feat-billing      # actually changes directory
wtcd feat               # shorthand, same thing
```

---

## Configuration

### `.worktreerc` (per-repo)

Place this file in your repository root and commit it. It contains no secrets — only strategies and commands.

Run `wt init` to generate one automatically, or create it manually using `.worktreerc.example` as a reference.

```toml
version = 1
```

#### `[detect]`

Override automatic ecosystem detection. When `types` is set, `wt` skips file scanning and uses exactly these ecosystems (while still detecting the package manager from lockfiles).

```toml
[detect]
# Accepted values: "node", "python", "rust", "go"
# Omit this section entirely to use auto-detection.
types = ["node", "python"]
```

#### `[deps]`

Controls dependency installation.

```toml
[deps]
# Set to false to disable dep installation repo-wide.
# Equivalent to always passing --no-deps.
# Default: true
enabled = true

# Override the Node.js package manager.
# Options: "bun" | "npm" | "pnpm" | "yarn"
# Auto-detected from lockfiles when absent:
#   bun.lockb → bun, pnpm-lock.yaml → pnpm,
#   yarn.lock → yarn, package-lock.json → npm
node_pm = "bun"

# Override the Python package manager.
# Options: "uv" | "pip" | "poetry" | "pipenv"
# Auto-detected from pyproject.toml markers and Pipfile when absent.
python_pm = "uv"

# Custom commands replace all auto-detection when present.
# Runs from the worktree root in the order listed.
# Useful for monorepos or non-standard setups.
[deps.custom]
commands = [
    "bun install --frozen-lockfile",
    "cd services/api && uv venv .venv && uv pip install -e '.[dev]'",
]
```

#### `[env]`

Controls how `.env` files are propagated from the main worktree to new ones.

```toml
[env]
# How to handle .env files.
#   "symlink"  All worktrees share the same files via symlinks.
#              Changes are immediately visible everywhere.
#              Recommended when all worktrees share a single .env.
#   "copy"     Each worktree gets an independent copy.
#              Use when worktrees need divergent config (e.g., different ports).
#   "skip"     Do not touch .env files.
# Default: "copy"
strategy = "symlink"

# Glob patterns (relative to repo root) to process.
# Supports single-level globs: "services/*/.env"
# Default: [".env", ".env.local", ".env.development"]
patterns = [
    ".env",
    ".env.local",
]

# Files that must always be copied regardless of strategy.
# Use for files with per-worktree values (port numbers, DB names).
always_copy = [
    ".env.test",
]

# Files to exclude from env handling entirely.
# Always exclude production and staging credentials.
exclude = [
    ".env.production",
    ".env.staging",
]
```

#### `[files]`

Symlink or copy arbitrary paths into new worktrees.

```toml
[files]
# Symlink these paths from the main worktree into the new worktree.
# Useful for large caches that are expensive to recreate.
symlink = [
    "node_modules/.cache",
    ".pytest_cache",
]

# Copy these paths into the new worktree.
# They start identical to the source but can diverge.
copy = [
    ".vscode/settings.json",
]
```

#### `[python]`

Python virtualenv configuration.

```toml
[python]
# Python executable for venv creation.
# Default: "python3"
version = "python3.11"

# Requirements file (relative to worktree root).
# Default: auto-detect (requirements.txt, requirements/base.txt, etc.)
requirements = "requirements/dev.txt"

# Install the package in editable mode (-e) after creating the venv.
# Default: false
editable = true
```

#### `[hooks]`

Shell commands that run at specific points in the setup pipeline. Each command runs from the worktree root via `sh -c`.

```toml
[hooks]
# Runs BEFORE dependency installation.
# Use for generating source files the installer needs.
pre_install = [
    "cp .env.example .env",
]

# Runs AFTER dependency installation succeeds.
# Use for codegen, migration checks, compilation.
post_install = [
    "bun run codegen",
    "python manage.py migrate --check",
]

# Runs AFTER the entire setup is complete.
# Use for final validation or onboarding messages.
post_setup = [
    "echo 'Worktree ready. Run: bun dev'",
]
```

> **Security note**: hook commands run with the same permissions as your user. Review any `.worktreerc` from an untrusted source before running `wt setup`.

#### `[worktree]`

Controls where new worktrees are placed on disk.

```toml
[worktree]
# Base directory for new worktrees.
# Supports ~ and $VARIABLE expansion.
# Default: "../" (sibling of the main repo)
#
# Examples:
#   "../worktrees"       → sibling worktrees/ directory
#   "~/dev/worktrees"    → fixed location in home
#   "$WT_BASE"           → from environment variable
base_dir = "../worktrees"

# Directory name pattern for each new worktree.
# Variables:
#   {repo}          repository directory name (e.g. "myapp")
#   {branch}        full branch name (e.g. "shreyansh/feat-billing")
#   {short_branch}  branch after the last / (e.g. "feat-billing")
# Default: "{repo}-{short_branch}"
name_pattern = "{repo}-{short_branch}"
```

---

### Global config (`~/.config/wt/config.toml`)

User-level defaults that apply across all repositories. Per-repo `.worktreerc` values override these.

```toml
[user]
# Prefix automatically prepended to new branch names.
# "feat-billing" becomes "shreyansh/feat-billing"
branch_prefix = "shreyansh"

[defaults]
# Default env strategy when no .worktreerc is present.
# Options: "symlink" | "copy" | "skip"
env_strategy = "symlink"

# Default base directory for worktrees (overridden by .worktreerc).
base_dir = "~/dev/worktrees"

# Set to false to disable automatic dep installation globally.
auto_deps = true

[aliases]
# Define short aliases for commands.
# These are in addition to the built-in single-letter aliases
# (a=add, r=remove, l=list, s=setup, d=doctor).
new = "add"
```

---

## Ecosystem Support

`wt` auto-detects the following ecosystems by scanning for marker files:

| Ecosystem | Package Managers       | Detection Signal                                                     |
|-----------|------------------------|----------------------------------------------------------------------|
| Node.js   | bun, pnpm, yarn, npm   | `package.json` + lockfile (`bun.lockb` > `pnpm-lock.yaml` > `yarn.lock` > `package-lock.json`) |
| Python    | uv, poetry, pipenv, pip| `Pipfile` → pipenv; `pyproject.toml` ([tool.poetry] / [tool.uv]) → poetry/uv; `requirements.txt` → uv |
| Rust      | cargo                  | `Cargo.toml`                                                         |
| Go        | go                     | `go.mod`                                                             |

Lockfile priority for Node.js: `bun.lockb` is checked first. If none is found, `bun` is the default.

For Python, `pyproject.toml` with `[tool.poetry]` selects poetry; `[tool.uv]` or `[build-system]` / `[project]` selects uv; `Pipfile` selects pipenv. Repos with only `requirements.txt` use uv.

Repos with multiple ecosystems (e.g. a Node.js frontend + Python backend) are handled correctly — `wt` runs the appropriate installer for each detected ecosystem.

---

## Claude Code Integration

`wt` ships two hooks designed for Claude Code. Both are installed by `./install.sh`.

### PostToolUse hook (`wt-claude-hook`)

**What it does**: After every Bash tool call, checks whether the command was `git worktree add`. If so, extracts the destination path and runs `wt setup <path> --quiet` immediately, so the worktree is fully configured before Claude's next step.

The hook also handles the `EnterWorktree` tool (with `--mode=enter`): when Claude enters a worktree that has not been set up yet, it runs `wt setup` automatically.

**How to install manually** — add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "/path/to/wt-claude-hook" }
        ]
      },
      {
        "matcher": "EnterWorktree",
        "hooks": [
          { "type": "command", "command": "/path/to/wt-claude-hook --mode=enter" }
        ]
      }
    ]
  }
}
```

Replace `/path/to/wt-claude-hook` with `~/.local/bin/wt-claude-hook` if you used the default install prefix.

The hook uses `CLAUDE_TOOL_INPUT` (JSON) to read the Bash command or the worktree path. A `.wt-setup-done` marker file prevents double-setup when both the Bash hook and the EnterWorktree hook fire for the same worktree.

### WorktreeCreate hook (`wt-worktree-create`)

**What it does**: Replaces Claude Code's default `git worktree add` behaviour when Claude is launched with `claude --worktree` or when a subagent specifies `isolation: "worktree"`. It creates the worktree using `wt`'s path logic, then runs `wt setup` automatically, and prints the absolute path to stdout (which Claude Code requires).

**How to install manually** — add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "WorktreeCreate": [
      {
        "hooks": [
          { "type": "command", "command": "/path/to/wt-worktree-create" }
        ]
      }
    ]
  }
}
```

---

## Git Hook Integration

The `post-checkout` hook triggers `wt setup` automatically whenever `git worktree add` creates a new worktree. It detects new worktrees by checking whether the previous HEAD is the null SHA (`0000...`).

**Install into a repo**:

```bash
cp /path/to/wt/hooks/post-checkout /path/to/myrepo/.git/hooks/post-checkout
chmod +x /path/to/myrepo/.git/hooks/post-checkout
```

Or let the installer handle it interactively during `./install.sh`.

The hook exits `0` even if `wt` is not on PATH — it prints a warning and lets the checkout succeed. It never blocks a git operation.

---

## Shell Completions

### Zsh

The installer places a completion file at `~/.zsh/completions/_wt`. If that directory is not in your `fpath`, add this to `~/.zshrc`:

```zsh
fpath=("$HOME/.zsh/completions" $fpath)
autoload -Uz compinit && compinit
```

### Bash

The installer places a completion file in `~/.local/share/bash-completion/completions/wt`. If bash-completion is not set up, add this to `~/.bashrc`:

```bash
source /path/to/wt/completions/wt.bash
```

---

## Recipes

### Quick worktree for a hotfix

```bash
wt add hotfix-login-crash --from main
cd "$(wt cd hotfix)"
# make changes, then:
wt remove hotfix-login-crash
```

### Worktree with a custom path

```bash
wt add feat-payments --path ~/sandbox/payments
```

### Skip deps for a quick code review

```bash
wt add review/pr-482 --existing --no-deps --no-env
cd "$(wt cd pr-482)"
```

### Re-run setup after a config change

```bash
# You updated .worktreerc — re-apply to an existing worktree
wt setup --force ../myapp-feat-billing

# Clean reinstall (removes node_modules and .venv)
wt setup --clean --force ../myapp-feat-billing
```

### Navigate between worktrees

```bash
# Exact match
cd "$(wt cd feat-billing)"

# Partial match — resolves unambiguously
cd "$(wt cd billing)"

# Shell function shorthand (add to ~/.zshrc)
wtcd() { cd "$(wt cd "$1")" }
wtcd billing
```

### Clean up all worktrees

```bash
# List everything first
wt list

# Remove one by one (partial names work)
wt remove billing
wt remove payments
```

---

## Troubleshooting

**`wt setup` hangs**

The package manager install step is blocking. Check whether your package manager is prompting for input (e.g. an interactive credential prompt). Run `wt setup --verbose` to see the exact command being executed, then run it manually in the worktree to observe the output directly.

**Dependencies not installing / wrong package manager detected**

Run `wt doctor` — it checks which package managers are on PATH and whether the expected lockfiles are present. If the wrong PM is detected, pin it explicitly in `.worktreerc`:

```toml
[deps]
node_pm = "pnpm"
```

**`.env` file not copied or symlinked**

Check two things: (1) the file exists in the main worktree (`wt doctor` will flag it if not), and (2) the filename matches a pattern in `env.patterns`. If the file is listed in `env.exclude`, it will be skipped intentionally. Run `wt doctor` for a full diagnosis including a broken-symlink check.

**"Worktree already exists" error**

If `wt add` fails because the worktree path already exists, you have options:

```bash
# If the worktree is registered with git, navigate to it
cd "$(wt cd feat-billing)"

# If it was created but setup never ran
wt setup /path/to/existing/worktree

# If the directory is stale (not registered with git)
git worktree prune
wt add feat-billing
```

**`wt: command not found` after install**

Ensure `~/.local/bin` (or your custom `--prefix`) is on your PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## Architecture

```
wt
├── src/
│   ├── index.ts          CLI entry point — parses args, dispatches commands
│   ├── commands/
│   │   ├── add.ts        wt add — create worktree + run pipeline
│   │   ├── setup.ts      wt setup — run pipeline on existing worktree
│   │   ├── list.ts       wt list — tabular/JSON output
│   │   ├── remove.ts     wt remove — clean removal + branch delete
│   │   ├── cd.ts         wt cd — fuzzy path lookup
│   │   ├── init.ts       wt init — generate .worktreerc
│   │   └── doctor.ts     wt doctor — diagnostic checklist
│   ├── core/
│   │   ├── config.ts     Load and merge .worktreerc + global config
│   │   ├── detector.ts   Ecosystem detection (node/python/rust/go)
│   │   ├── installer.ts  Run the right package manager install command
│   │   ├── env.ts        Symlink or copy .env files
│   │   ├── git.ts        git worktree add/remove/list wrappers
│   │   └── status.ts     Read/write .wt-status.json
│   └── utils/
│       ├── logger.ts     Step-counter output ([1/4] ...) + log levels
│       └── shell.ts      exec() wrapper with timeout support
├── hooks/
│   ├── post-checkout     Git hook — triggers wt setup on new worktrees
│   ├── wt-claude-hook    Claude Code PostToolUse hook
│   └── wt-worktree-create Claude Code WorktreeCreate hook
└── completions/
    ├── wt.zsh
    └── wt.bash
```

Config resolution order (highest priority first): CLI flags > `.worktreerc` > `~/.config/wt/config.toml` > compiled defaults.

---

## Contributing

```bash
# Clone and install dependencies
git clone https://github.com/shreyT19/git-wt
cd modules-link
bun install

# Run wt directly during development
bun run src/index.ts add feat-test

# Type-check (no emit)
bun x tsc --noEmit

# Run tests
bun test
```

The project is a single-runtime TypeScript application that runs directly on bun without a build step. Each command is a separate module in `src/commands/`. Core logic (detection, installation, env handling) lives in `src/core/` and is shared across commands.

---

## License

MIT
