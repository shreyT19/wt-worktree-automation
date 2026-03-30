#compdef wt
# Zsh completion for the `wt` worktree automation CLI
#
# Install (choose one):
#   1. Copy to a directory in your $fpath, e.g.:
#        cp wt.zsh /usr/local/share/zsh/site-functions/_wt
#   2. Source directly in your ~/.zshrc:
#        source /path/to/wt.zsh
#   3. Via install.sh — it will place this file automatically.
#
# After installing, run: autoload -Uz compinit && compinit

# ---------------------------------------------------------------------------
# Helper: list existing worktree paths (excluding the main worktree)
# ---------------------------------------------------------------------------
_wt_worktrees() {
    local -a worktrees
    local line

    # `git worktree list --porcelain` outputs blocks separated by blank lines.
    # Each block has: worktree <path>, HEAD <sha>, branch <ref>
    # We skip the first block (main worktree).
    local first=1
    while IFS= read -r line; do
        if [[ "$line" == worktree\ * ]]; then
            if (( first )); then
                first=0
                continue
            fi
            local path="${line#worktree }"
            local branch
            # Read ahead to find the branch name for this worktree.
            IFS= read -r _head_line   # HEAD <sha> line
            IFS= read -r branch_line  # branch refs/heads/<name>
            branch="${branch_line#branch refs/heads/}"
            worktrees+=( "${path}:${branch:-detached}" )
        fi
    done < <(git worktree list --porcelain 2>/dev/null)

    _describe 'worktree' worktrees
}

# ---------------------------------------------------------------------------
# Helper: list local branch names
# ---------------------------------------------------------------------------
_wt_branches() {
    local -a branches
    while IFS= read -r branch; do
        branch="${branch#  }"   # strip leading spaces
        branch="${branch#* }"   # strip "* " for current branch marker
        branch="${branch## }"
        [[ -n "$branch" ]] && branches+=( "$branch" )
    done < <(git branch --list 2>/dev/null)

    _describe 'branch' branches
}

# ---------------------------------------------------------------------------
# Helper: list both local and remote branch names (for --from)
# ---------------------------------------------------------------------------
_wt_all_branches() {
    local -a branches
    while IFS= read -r branch; do
        branch="${branch#  }"
        branch="${branch#* }"
        branch="${branch## }"
        [[ -n "$branch" ]] && branches+=( "$branch" )
    done < <(git branch --list --all 2>/dev/null | sed 's|remotes/||')

    _describe 'branch' branches
}

# ---------------------------------------------------------------------------
# Subcommand definitions
# ---------------------------------------------------------------------------

_wt_add() {
    _arguments \
        '1:branch name:_wt_branches' \
        '--from[base branch to create from]:base branch:_wt_all_branches' \
        '--no-deps[skip dependency installation]' \
        '--no-env[skip .env file setup]' \
        '--no-hooks[skip pre/post hooks]' \
        '--path[override worktree directory]:directory:_files -/' \
        '--dry-run[show what would be done without doing it]' \
        '--existing[use an existing branch instead of creating a new one]' \
        '(-v --verbose)'{-v,--verbose}'[enable verbose output]' \
        '(-q --quiet)'{-q,--quiet}'[suppress non-error output]'
}

_wt_remove() {
    _arguments \
        '1:branch or worktree path:_wt_worktrees' \
        '--force[force removal even with uncommitted changes]' \
        '--keep-branch[do not delete the branch after removing the worktree]' \
        '(-q --quiet)'{-q,--quiet}'[suppress non-error output]'
}

_wt_setup() {
    _arguments \
        '1::worktree path:_files -/' \
        '--no-deps[skip dependency installation]' \
        '--no-env[skip .env file setup]' \
        '--no-hooks[skip pre/post hooks]' \
        '--force[re-run setup even if already completed]' \
        '(-q --quiet)'{-q,--quiet}'[suppress non-error output]' \
        '(-v --verbose)'{-v,--verbose}'[enable verbose output]'
}

_wt_list() {
    _arguments \
        '--json[output as JSON for scripting]' \
        '--status[show detailed setup status per worktree]'
}

_wt_cd() {
    _arguments \
        '1:branch name or partial match:_wt_worktrees'
}

_wt_init() {
    _arguments \
        '--defaults[use sensible defaults without prompting]'
}

_wt_doctor() {
    _arguments \
        '1::worktree path:_files -/'
}

# ---------------------------------------------------------------------------
# Main dispatcher
# ---------------------------------------------------------------------------

_wt() {
    local state

    # Top-level: subcommand + global flags
    _arguments -C \
        '(-h --help)'{-h,--help}'[show help]' \
        '(-V --version)'{-V,--version}'[show version]' \
        '1:subcommand:->subcommands' \
        '*::args:->args'

    case "$state" in
        subcommands)
            local -a subcmds
            subcmds=(
                'add:create a new worktree and run full setup'
                'remove:remove an existing worktree cleanly'
                'list:list all worktrees with setup status'
                'setup:run setup on an existing worktree'
                'cd:print the path to a worktree (use with eval)'
                'init:create a .worktreerc file interactively'
                'doctor:diagnose worktree setup issues'
            )
            _describe 'subcommand' subcmds
            ;;
        args)
            case "${words[1]}" in
                add)    _wt_add    ;;
                remove) _wt_remove ;;
                list)   _wt_list   ;;
                setup)  _wt_setup  ;;
                cd)     _wt_cd     ;;
                init)   _wt_init   ;;
                doctor) _wt_doctor ;;
            esac
            ;;
    esac
}

_wt "$@"
