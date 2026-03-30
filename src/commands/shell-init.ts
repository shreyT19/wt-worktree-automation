/**
 * wt shell-init [shell]
 *
 * Outputs a shell function to stdout that the user can eval in their config.
 * Makes `wtcd <branch>` work as a real `cd` command, and wraps `wt cd` so
 * it behaves as a directory change rather than a path print.
 *
 * Usage:
 *   # zsh / bash
 *   eval "$(wt shell-init zsh)"    # or: eval "$(wt shell-init bash)"
 *
 *   # fish
 *   wt shell-init fish | source
 */

function detectShell(): string {
  const shell = process.env.SHELL || "";
  if (shell.includes("zsh")) return "zsh";
  if (shell.includes("bash")) return "bash";
  if (shell.includes("fish")) return "fish";
  return "zsh"; // default
}

function generateBashZshInit(): string {
  return `# wt shell integration
# Add to .zshrc/.bashrc: eval "$(wt shell-init zsh)"

wtcd() {
  local dir
  dir="$(wt cd "$@" 2>/dev/null)"
  if [ $? -eq 0 ] && [ -n "$dir" ]; then
    cd "$dir" || return 1
  else
    echo "wt: worktree not found for '$*'" >&2
    return 1
  fi
}

# Also override 'wt' itself so 'wt cd' becomes a real directory change
wt() {
  if [ "$1" = "cd" ]; then
    shift
    wtcd "$@"
  else
    command wt "$@"
  fi
}
`;
}

function generateFishInit(): string {
  return `# wt shell integration
# Add to config.fish: wt shell-init fish | source

function wtcd
  set -l dir (command wt cd $argv 2>/dev/null)
  if test $status -eq 0 -a -n "$dir"
    cd $dir
  else
    echo "wt: worktree not found for '$argv'" >&2
    return 1
  end
end

function wt
  if test "$argv[1]" = "cd"
    wtcd $argv[2..]
  else
    command wt $argv
  end
end
`;
}

export default async function shellInitCommand(args: string[]): Promise<number> {
  const shell = args[0] || detectShell();

  if (shell === "zsh" || shell === "bash") {
    process.stdout.write(generateBashZshInit());
  } else if (shell === "fish") {
    process.stdout.write(generateFishInit());
  } else {
    process.stderr.write(`Unsupported shell: ${shell}\nSupported: zsh, bash, fish\n`);
    return 1;
  }

  return 0;
}
