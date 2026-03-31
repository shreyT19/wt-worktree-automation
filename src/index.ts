#!/usr/bin/env bun

import pc from "picocolors";
import { logger, configureLogger } from "./utils/logger.ts";
import addCommand from "./commands/add.ts";
import setupCommand from "./commands/setup.ts";
import listCommand from "./commands/list.ts";
import removeCommand from "./commands/remove.ts";
import cdCommand from "./commands/cd.ts";
import initCommand from "./commands/init.ts";
import doctorCommand from "./commands/doctor.ts";
import shellInitCommand from "./commands/shell-init.ts";

const VERSION = "0.1.0";

const HELP = `
${pc.bold("wt")} — worktree automation

${pc.bold("USAGE")}
    wt <command> [options] [arguments]

${pc.bold("COMMANDS")}
    ${pc.cyan("add")} <branch>        ${pc.dim("Create a worktree and run full setup")}
    ${pc.cyan("setup")} [path]        ${pc.dim("Run setup on an existing worktree")}
    ${pc.cyan("list")}                ${pc.dim("List all worktrees with setup status")}
    ${pc.cyan("remove")} <branch>     ${pc.dim("Remove a worktree cleanly")}
    ${pc.cyan("cd")} <branch>         ${pc.dim("Print worktree path (for use with cd)")}
    ${pc.cyan("init")}                ${pc.dim("Generate .worktreerc for this repo")}
    ${pc.cyan("doctor")} [path]       ${pc.dim("Diagnose worktree setup issues")}
    ${pc.cyan("shell-init")} [shell]  ${pc.dim("Print shell integration (eval in .zshrc/.bashrc)")}

${pc.bold("GLOBAL OPTIONS")}
    ${pc.dim("--help, -h")}          Show this help message
    ${pc.dim("--version, -v")}       Show version
    ${pc.dim("--quiet, -q")}         Only show errors
    ${pc.dim("--verbose")}           Show debug output

${pc.bold("Get started")}
    ${pc.dim("$")} wt init                  ${pc.dim("Generate a .worktreerc config")}
    ${pc.dim("$")} wt add feat-billing      ${pc.dim("Create a worktree + install deps")}
    ${pc.dim("$")} wt list                  ${pc.dim("See all worktrees at a glance")}

Run ${pc.cyan("wt <command> --help")} for command-specific help.
`.trim();

export interface ParsedFlags {
  help?: boolean;
  version?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  "dry-run"?: boolean;
  force?: boolean;
  "no-deps"?: boolean;
  "no-env"?: boolean;
  "no-hooks"?: boolean;
  bare?: boolean;
  existing?: boolean;
  "keep-branch"?: boolean;
  json?: boolean;
  status?: boolean;
  defaults?: boolean;
  clean?: boolean;
  from?: string;
  "copy-from"?: string;
  path?: string;
  exec?: string;
  [key: string]: string | boolean | undefined;
}

interface ParsedArgs {
  command: string | null;
  args: string[];
  flags: ParsedFlags;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags: ParsedFlags = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      flags.version = true;
    } else if (arg === "--quiet" || arg === "-q") {
      flags.quiet = true;
    } else if (arg === "--verbose") {
      flags.verbose = true;
    } else if (arg === "--dry-run") {
      flags["dry-run"] = true;
    } else if (arg === "--force") {
      flags.force = true;
    } else if (arg === "--no-deps") {
      flags["no-deps"] = true;
    } else if (arg === "--no-env") {
      flags["no-env"] = true;
    } else if (arg === "--no-hooks") {
      flags["no-hooks"] = true;
    } else if (arg === "--bare") {
      flags.bare = true;
    } else if (arg === "--existing") {
      flags.existing = true;
    } else if (arg === "--keep-branch") {
      flags["keep-branch"] = true;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg === "--status") {
      flags.status = true;
    } else if (arg === "--defaults") {
      flags.defaults = true;
    } else if (arg === "--clean") {
      flags.clean = true;
    } else if (arg.startsWith("--from=")) {
      flags.from = arg.slice("--from=".length);
    } else if (arg === "--from") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags.from = next;
        i++;
      }
    } else if (arg.startsWith("--copy-from=")) {
      flags["copy-from"] = arg.slice("--copy-from=".length);
    } else if (arg === "--copy-from") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags["copy-from"] = next;
        i++;
      }
    } else if (arg.startsWith("--path=")) {
      flags.path = arg.slice("--path=".length);
    } else if (arg === "--path") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags.path = next;
        i++;
      }
    } else if (arg.startsWith("--exec=")) {
      flags.exec = arg.slice("--exec=".length);
    } else if (arg === "--exec" || arg === "-x") {
      const next = argv[i + 1];
      if (next !== undefined) {
        flags.exec = next;
        i++;
      }
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  const [command = null, ...args] = positional;
  return { command, args, flags };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  // shell-init is handled before flag parsing so its positional arg
  // (the shell name) is never misinterpreted as a flag.
  if (argv[0] === "shell-init") {
    return await shellInitCommand(argv.slice(1));
  }

  const { command, args, flags } = parseArgs(argv);

  // Apply global flags to logger
  configureLogger({
    quiet: flags.quiet === true,
    verbose: flags.verbose === true,
  });

  if (flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  if (!command && !flags.help) {
    process.stdout.write(HELP + "\n");
    return 1;
  }

  if (!command && flags.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }

  // Resolve aliases from global config — basic set hardcoded
  const aliases: Record<string, string> = {
    a: "add",
    r: "remove",
    l: "list",
    s: "setup",
    d: "doctor",
  };

  const resolvedCommand = aliases[command!] ?? command!;

  try {
    switch (resolvedCommand) {
      case "add":
        return await addCommand(args, flags);
      case "setup":
        return await setupCommand(args, flags);
      case "list":
        return await listCommand(args, flags);
      case "remove":
        return await removeCommand(args, flags);
      case "cd":
        return await cdCommand(args, flags);
      case "init":
        return await initCommand(args, flags);
      case "doctor":
        return await doctorCommand(args, flags);
      case "shell-init":
        return await shellInitCommand(args);
      default:
        logger.error(`Unknown command: '${resolvedCommand}'`);
        logger.hint("Run 'wt --help' for usage.");
        return 1;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Unexpected error: ${message}`);
    if (flags.verbose && err instanceof Error && err.stack) {
      logger.debug(err.stack);
    }
    logger.hint("Run with --verbose for more details.");
    return 1;
  }
}

const exitCode = await main();
process.exit(exitCode);
