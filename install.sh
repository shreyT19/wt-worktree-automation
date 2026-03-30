#!/usr/bin/env bash
# install.sh — Interactive installer for the `wt` worktree automation tool
#
# What this script does:
#   1. Checks prerequisites (bun, git >= 2.5)
#   2. Installs npm/bun dependencies
#   3. Creates `wt` symlink in ~/.local/bin (or a custom PREFIX)
#   4. Optionally installs the post-checkout hook into specified repos
#   5. Optionally configures Claude Code hooks in ~/.claude/settings.json
#   6. Optionally installs shell completions
#
# Usage:
#   ./install.sh                  # interactive
#   ./install.sh --non-interactive --prefix ~/.local  # unattended

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_BIN_DIR="${HOME}/.local/bin"
BIN_DIR="${PREFIX:-$DEFAULT_BIN_DIR}"
WT_ENTRY="${REPO_ROOT}/src/index.ts"
WT_HOOK_SRC="${REPO_ROOT}/hooks/post-checkout"
WT_CLAUDE_HOOK_SRC="${REPO_ROOT}/hooks/wt-claude-hook"
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

# Colour codes (disabled in non-interactive / dumb terminals)
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
    RED=$(tput setaf 1)
    GREEN=$(tput setaf 2)
    YELLOW=$(tput setaf 3)
    CYAN=$(tput setaf 6)
    BOLD=$(tput bold)
    RESET=$(tput sgr0)
else
    RED="" GREEN="" YELLOW="" CYAN="" BOLD="" RESET=""
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

info()    { printf '%s[wt install]%s %s\n' "$CYAN"  "$RESET" "$*"; }
success() { printf '%s[wt install]%s %s\n' "$GREEN" "$RESET" "$*"; }
warn()    { printf '%s[wt install]%s %s\n' "$YELLOW" "$RESET" "$*"; }
error()   { printf '%s[wt install ERROR]%s %s\n' "$RED" "$RESET" "$*" >&2; }
die()     { error "$*"; exit 1; }

# Prompt user with a yes/no question. Returns 0 for yes, 1 for no.
# In non-interactive mode always returns the default.
ask() {
    local question="$1"
    local default="${2:-y}"  # "y" or "n"

    if [[ "${NON_INTERACTIVE:-0}" == "1" ]]; then
        [[ "$default" == "y" ]] && return 0 || return 1
    fi

    local prompt
    if [[ "$default" == "y" ]]; then
        prompt="${BOLD}${question} [Y/n]${RESET} "
    else
        prompt="${BOLD}${question} [y/N]${RESET} "
    fi

    local answer
    read -rp "$prompt" answer
    answer="${answer:-$default}"
    [[ "${answer,,}" == "y" ]]
}

# Prompt for a string value with an optional default.
ask_value() {
    local question="$1"
    local default="${2:-}"

    if [[ "${NON_INTERACTIVE:-0}" == "1" ]]; then
        echo "$default"
        return
    fi

    local prompt="${BOLD}${question}${RESET}"
    [[ -n "$default" ]] && prompt+=" [${CYAN}${default}${RESET}]"
    prompt+=": "

    local answer
    read -rp "$prompt" answer
    echo "${answer:-$default}"
}

# Check that a command exists and meets a minimum semantic version.
# Usage: require_version <command> <min_version> [version_flag]
require_version() {
    local cmd="$1"
    local min_ver="$2"
    local ver_flag="${3:---version}"

    if ! command -v "$cmd" >/dev/null 2>&1; then
        return 1
    fi

    local actual_ver
    actual_ver=$("$cmd" $ver_flag 2>&1 | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' | head -1)

    # Compare using sort -V (version sort).
    local lowest
    lowest=$(printf '%s\n%s\n' "$min_ver" "$actual_ver" | sort -V | head -1)
    [[ "$lowest" == "$min_ver" ]]
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

NON_INTERACTIVE=0

for arg in "$@"; do
    case "$arg" in
        --non-interactive|-y) NON_INTERACTIVE=1 ;;
        --prefix=*)           BIN_DIR="${arg#--prefix=}" ;;
        --prefix)             shift; BIN_DIR="${1:-$DEFAULT_BIN_DIR}" ;;
        --help|-h)
            printf 'Usage: %s [--non-interactive] [--prefix <dir>]\n' "$(basename "$0")"
            exit 0
            ;;
    esac
done

export NON_INTERACTIVE

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

printf '\n%s%s wt — Worktree Automation Installer %s\n' "$BOLD" "$CYAN" "$RESET"
printf '%s━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━%s\n\n' "$CYAN" "$RESET"

# ---------------------------------------------------------------------------
# Step 1: Prerequisites
# ---------------------------------------------------------------------------

info "Checking prerequisites..."

PREREQS_OK=1

# git >= 2.5 (worktrees were introduced in 2.5)
if ! require_version git "2.5" "--version"; then
    error "git >= 2.5 is required. Found: $(git --version 2>/dev/null || echo 'not found')"
    PREREQS_OK=0
fi

# bun — required to run index.ts and for JSON parsing in the Claude hook
if ! command -v bun >/dev/null 2>&1; then
    error "bun is required but was not found on PATH."
    printf '  Install bun: %scurl -fsSL https://bun.sh/install | bash%s\n' "$CYAN" "$RESET"
    PREREQS_OK=0
fi

[[ "$PREREQS_OK" == "1" ]] || die "Please install the missing prerequisites and re-run this script."

GIT_VER=$(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
BUN_VER=$(bun --version 2>/dev/null || echo "unknown")
success "git $GIT_VER  bun $BUN_VER  — all prerequisites met."

# ---------------------------------------------------------------------------
# Step 2: Install dependencies
# ---------------------------------------------------------------------------

info "Installing bun dependencies in ${REPO_ROOT}..."
(cd "$REPO_ROOT" && bun install --frozen-lockfile)
success "Dependencies installed."

# ---------------------------------------------------------------------------
# Step 3: Create wt binary symlink
# ---------------------------------------------------------------------------

info "Installing wt binary to ${BIN_DIR}/wt"

if [[ ! -d "$BIN_DIR" ]]; then
    mkdir -p "$BIN_DIR"
    info "Created directory $BIN_DIR"
fi

WT_BIN="${BIN_DIR}/wt"
WT_CLAUDE_HOOK_LINK="${BIN_DIR}/wt-claude-hook"

# Wrapper script — invokes index.ts with bun.
# A wrapper is used instead of a direct symlink to index.ts so that bun
# is invoked correctly even if the PATH is minimal (e.g., in git hooks).
cat > "$WT_BIN" <<WRAPPER
#!/usr/bin/env bash
exec bun run "${WT_ENTRY}" "\$@"
WRAPPER
chmod +x "$WT_BIN"
success "Installed: ${WT_BIN}"

# Also install wt-claude-hook into BIN_DIR so the Claude settings path works.
if [[ -f "$WT_CLAUDE_HOOK_SRC" ]]; then
    ln -sf "$WT_CLAUDE_HOOK_SRC" "$WT_CLAUDE_HOOK_LINK"
    chmod +x "$WT_CLAUDE_HOOK_SRC"
    success "Installed: ${WT_CLAUDE_HOOK_LINK}"
fi

# Warn if BIN_DIR is not on PATH.
if ! echo ":${PATH}:" | grep -q ":${BIN_DIR}:"; then
    warn "${BIN_DIR} is not on your PATH."
    printf '  Add this to your shell rc file:\n'
    printf '  %sexport PATH="%s:$PATH"%s\n\n' "$CYAN" "$BIN_DIR" "$RESET"
fi

# ---------------------------------------------------------------------------
# Step 4: Post-checkout hook into repos (optional)
# ---------------------------------------------------------------------------

printf '\n'
if ask "Install git post-checkout hook into a repository?" "n"; then
    while true; do
        REPO_PATH=$(ask_value "Repository path (absolute, or leave empty to stop)" "")
        [[ -z "$REPO_PATH" ]] && break

        if [[ ! -d "${REPO_PATH}/.git" ]]; then
            warn "No .git directory found at ${REPO_PATH} — skipping."
            continue
        fi

        HOOK_DIR="${REPO_PATH}/.git/hooks"
        HOOK_DEST="${HOOK_DIR}/post-checkout"
        mkdir -p "$HOOK_DIR"

        if [[ -f "$HOOK_DEST" ]]; then
            warn "post-checkout hook already exists at ${HOOK_DEST}"
            if ask "Overwrite it?" "n"; then
                cp "$WT_HOOK_SRC" "$HOOK_DEST"
                chmod +x "$HOOK_DEST"
                success "Replaced ${HOOK_DEST}"
            else
                info "Skipped ${REPO_PATH}"
            fi
        else
            cp "$WT_HOOK_SRC" "$HOOK_DEST"
            chmod +x "$HOOK_DEST"
            success "Installed hook at ${HOOK_DEST}"
        fi

        ask "Install into another repository?" "n" || break
    done
fi

# ---------------------------------------------------------------------------
# Step 5: Claude Code hook configuration (optional)
# ---------------------------------------------------------------------------

printf '\n'
if ask "Configure Claude Code PostToolUse hooks in ~/.claude/settings.json?" "n"; then

    mkdir -p "$(dirname "$CLAUDE_SETTINGS")"

    # Load existing settings or start from scratch.
    local_settings="{}"
    if [[ -f "$CLAUDE_SETTINGS" ]]; then
        local_settings=$(cat "$CLAUDE_SETTINGS")
        # Back up before modifying.
        cp "$CLAUDE_SETTINGS" "${CLAUDE_SETTINGS}.bak"
        info "Backed up existing settings to ${CLAUDE_SETTINGS}.bak"
    fi

    # We need bun to merge JSON safely.
    HOOK_BIN="${WT_CLAUDE_HOOK_LINK}"

    NEW_SETTINGS=$(bun -e "
const fs = require('fs');
const settingsPath = process.env.CLAUDE_SETTINGS_PATH;
const hookBin = process.env.WT_HOOK_BIN;

let settings = {};
try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch {}

settings.hooks = settings.hooks || {};
settings.hooks.PostToolUse = settings.hooks.PostToolUse || [];

const existing = settings.hooks.PostToolUse;

// Remove any old wt entries so we don't duplicate.
settings.hooks.PostToolUse = existing.filter(h => {
    const cmds = (h.hooks || []).map(x => x.command || '');
    return !cmds.some(c => c.includes('wt-claude-hook'));
});

// Add Bash matcher
settings.hooks.PostToolUse.push({
    matcher: 'Bash',
    hooks: [{ type: 'command', command: hookBin }]
});

// Add EnterWorktree matcher
settings.hooks.PostToolUse.push({
    matcher: 'EnterWorktree',
    hooks: [{ type: 'command', command: hookBin + ' --mode=enter' }]
});

process.stdout.write(JSON.stringify(settings, null, 2) + '\n');
" CLAUDE_SETTINGS_PATH="$CLAUDE_SETTINGS" WT_HOOK_BIN="$HOOK_BIN")

    TMP_SETTINGS=$(mktemp)
    echo "$NEW_SETTINGS" > "$TMP_SETTINGS"
    mv "$TMP_SETTINGS" "$CLAUDE_SETTINGS"
    success "Updated ${CLAUDE_SETTINGS}"
    info "Hooks registered for: Bash (git worktree add) and EnterWorktree"
fi

# ---------------------------------------------------------------------------
# Step 6: Shell completions (optional)
# ---------------------------------------------------------------------------

printf '\n'
if ask "Install shell completions?" "y"; then

    # ---- Zsh ----
    ZSH_COMPLETION_DIRS=(
        "${HOME}/.zsh/completions"
        "${HOME}/.local/share/zsh/site-functions"
        "/usr/local/share/zsh/site-functions"
    )
    ZSH_COMPLETION_SRC="${REPO_ROOT}/completions/wt.zsh"

    if command -v zsh >/dev/null 2>&1; then
        # Find the first writable location.
        ZSH_COMP_DEST=""
        for dir in "${ZSH_COMPLETION_DIRS[@]}"; do
            if [[ -d "$dir" && -w "$dir" ]]; then
                ZSH_COMP_DEST="$dir"
                break
            elif [[ ! -e "$dir" ]]; then
                mkdir -p "$dir" 2>/dev/null && ZSH_COMP_DEST="$dir" && break
            fi
        done

        if [[ -n "$ZSH_COMP_DEST" ]]; then
            ln -sf "$ZSH_COMPLETION_SRC" "${ZSH_COMP_DEST}/_wt"
            success "Zsh completion installed: ${ZSH_COMP_DEST}/_wt"
            # Check that the dir is in fpath.
            if ! grep -qF "$ZSH_COMP_DEST" "${HOME}/.zshrc" 2>/dev/null; then
                info "Add this to ~/.zshrc if ${ZSH_COMP_DEST} is not in your fpath:"
                printf '  %sfpath=("%s" $fpath)%s\n' "$CYAN" "$ZSH_COMP_DEST" "$RESET"
                printf '  %sautoload -Uz compinit && compinit%s\n\n' "$CYAN" "$RESET"
            fi
        else
            warn "Could not find a writable zsh completion directory — skipping."
        fi
    fi

    # ---- Bash ----
    BASH_COMPLETION_DIRS=(
        "/etc/bash_completion.d"
        "/usr/local/etc/bash_completion.d"
        "${HOME}/.local/share/bash-completion/completions"
    )
    BASH_COMPLETION_SRC="${REPO_ROOT}/completions/wt.bash"

    if command -v bash >/dev/null 2>&1; then
        BASH_COMP_DEST=""
        for dir in "${BASH_COMPLETION_DIRS[@]}"; do
            if [[ -d "$dir" && -w "$dir" ]]; then
                BASH_COMP_DEST="$dir"
                break
            elif [[ ! -e "$dir" ]]; then
                mkdir -p "$dir" 2>/dev/null && BASH_COMP_DEST="$dir" && break
            fi
        done

        if [[ -n "$BASH_COMP_DEST" ]]; then
            ln -sf "$BASH_COMPLETION_SRC" "${BASH_COMP_DEST}/wt"
            success "Bash completion installed: ${BASH_COMP_DEST}/wt"
        else
            info "Manual bash completion: add this to ~/.bashrc:"
            printf '  %ssource "%s"%s\n\n' "$CYAN" "$BASH_COMPLETION_SRC" "$RESET"
        fi
    fi
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

printf '\n%s%s Installation complete! %s\n\n' "$BOLD" "$GREEN" "$RESET"
printf 'Quick start:\n'
printf '  %swt add feat-my-feature%s   # Create a new worktree + run setup\n' "$CYAN" "$RESET"
printf '  %swt list%s                  # List all worktrees and their status\n' "$CYAN" "$RESET"
printf '  %swt doctor%s                # Diagnose any issues\n\n' "$CYAN" "$RESET"
printf 'If wt is not found, ensure %s%s%s is on your PATH.\n\n' "$CYAN" "$BIN_DIR" "$RESET"
