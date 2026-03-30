# Bash completion for the `wt` worktree automation CLI
#
# Install (choose one):
#   1. Copy to /etc/bash_completion.d/ or /usr/local/etc/bash_completion.d/
#   2. Source directly in your ~/.bashrc:
#        source /path/to/wt.bash
#   3. Via install.sh — it will place this file automatically.

# ---------------------------------------------------------------------------
# Helper: list local branch names
# ---------------------------------------------------------------------------
_wt_branches() {
    git branch --list 2>/dev/null \
        | sed 's/^[* ] //' \
        | tr -d ' '
}

# ---------------------------------------------------------------------------
# Helper: list all branch names including remotes (strip remote prefix)
# ---------------------------------------------------------------------------
_wt_all_branches() {
    git branch --list --all 2>/dev/null \
        | sed 's/^[* ] //' \
        | sed 's|remotes/[^/]*/||' \
        | sort -u
}

# ---------------------------------------------------------------------------
# Helper: list worktree paths (excluding the first / main worktree)
# ---------------------------------------------------------------------------
_wt_worktree_paths() {
    local first=1
    local line
    while IFS= read -r line; do
        if [[ "$line" == worktree\ * ]]; then
            if (( first )); then
                first=0
                continue
            fi
            echo "${line#worktree }"
        fi
    done < <(git worktree list --porcelain 2>/dev/null)
}

# ---------------------------------------------------------------------------
# Helper: list worktree branch names (short name, for convenience)
# ---------------------------------------------------------------------------
_wt_worktree_branches() {
    local first=1
    local line
    while IFS= read -r line; do
        case "$line" in
            worktree\ *)
                if (( first )); then first=0; fi
                ;;
            branch\ refs/heads/*)
                if ! (( first )); then
                    echo "${line#branch refs/heads/}"
                fi
                ;;
        esac
    done < <(git worktree list --porcelain 2>/dev/null)
}

# ---------------------------------------------------------------------------
# Main completion function
# ---------------------------------------------------------------------------
_wt_complete() {
    local cur prev words cword
    # Use _init_completion if available (bash-completion v2), else do it manually.
    if declare -f _init_completion >/dev/null 2>&1; then
        _init_completion || return
    else
        cur="${COMP_WORDS[COMP_CWORD]}"
        prev="${COMP_WORDS[COMP_CWORD-1]}"
        words=("${COMP_WORDS[@]}")
        cword=$COMP_CWORD
    fi

    # Subcommands list.
    local subcmds="add remove list setup cd init doctor"

    # ----- Determine the active subcommand -----
    local subcmd=""
    local i
    for (( i=1; i < cword; i++ )); do
        case "${words[$i]}" in
            add|remove|list|setup|cd|init|doctor)
                subcmd="${words[$i]}"
                break
                ;;
        esac
    done

    # ----- No subcommand yet: complete subcommands and global flags -----
    if [[ -z "$subcmd" ]]; then
        case "$cur" in
            -*)
                COMPREPLY=( $(compgen -W "--help --version" -- "$cur") )
                ;;
            *)
                COMPREPLY=( $(compgen -W "$subcmds" -- "$cur") )
                ;;
        esac
        return 0
    fi

    # ----- Subcommand-specific completion -----
    case "$subcmd" in

        add)
            case "$prev" in
                --from)
                    COMPREPLY=( $(compgen -W "$(_wt_all_branches)" -- "$cur") )
                    return 0
                    ;;
                --path)
                    # Directory completion.
                    COMPREPLY=( $(compgen -d -- "$cur") )
                    compopt -o nospace 2>/dev/null
                    return 0
                    ;;
            esac
            case "$cur" in
                -*)
                    COMPREPLY=( $(compgen -W \
                        "--from --no-deps --no-env --no-hooks --path --dry-run --existing --verbose --quiet" \
                        -- "$cur") )
                    ;;
                *)
                    # First positional: branch name.
                    COMPREPLY=( $(compgen -W "$(_wt_branches)" -- "$cur") )
                    ;;
            esac
            ;;

        remove)
            case "$cur" in
                -*)
                    COMPREPLY=( $(compgen -W "--force --keep-branch --quiet" -- "$cur") )
                    ;;
                *)
                    # Complete on worktree paths AND branch names for convenience.
                    local choices
                    choices="$(_wt_worktree_paths) $(_wt_worktree_branches)"
                    COMPREPLY=( $(compgen -W "$choices" -- "$cur") )
                    ;;
            esac
            ;;

        list)
            COMPREPLY=( $(compgen -W "--json --status" -- "$cur") )
            ;;

        setup)
            case "$cur" in
                -*)
                    COMPREPLY=( $(compgen -W \
                        "--no-deps --no-env --no-hooks --force --quiet --verbose" \
                        -- "$cur") )
                    ;;
                *)
                    # Optional path argument — offer existing worktree paths and directories.
                    local wt_paths
                    wt_paths=$(_wt_worktree_paths)
                    COMPREPLY=( $(compgen -W "$wt_paths" -- "$cur") )
                    # Also allow directory completion.
                    COMPREPLY+=( $(compgen -d -- "$cur") )
                    ;;
            esac
            ;;

        cd)
            case "$cur" in
                -*)
                    COMPREPLY=()
                    ;;
                *)
                    # Complete on branch names and worktree paths.
                    local choices
                    choices="$(_wt_worktree_branches) $(_wt_worktree_paths)"
                    COMPREPLY=( $(compgen -W "$choices" -- "$cur") )
                    ;;
            esac
            ;;

        init)
            COMPREPLY=( $(compgen -W "--defaults" -- "$cur") )
            ;;

        doctor)
            case "$cur" in
                -*)
                    COMPREPLY=()
                    ;;
                *)
                    # Optional path: existing worktrees or any directory.
                    local wt_paths
                    wt_paths=$(_wt_worktree_paths)
                    COMPREPLY=( $(compgen -W "$wt_paths" -- "$cur") )
                    COMPREPLY+=( $(compgen -d -- "$cur") )
                    ;;
            esac
            ;;
    esac

    return 0
}

# Register the completion function.
complete -F _wt_complete wt
