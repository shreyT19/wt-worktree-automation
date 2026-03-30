#!/usr/bin/env bun

import { logger, configureLogger } from "./utils/logger.ts";
import addCommand from "./commands/add.ts";
import setupCommand from "./commands/setup.ts";
import listCommand from "./commands/list.ts";
import removeCommand from "./commands/remove.ts";
import cdCommand from "./commands/cd.ts";
import initCommand from "./commands/init.ts";
import doctorCommand from "./commands/doctor.ts";

const VERSION = "0.1.0";

const HELP = `
wt — worktree automation

USAGE:
    wt <command> [options] [arguments]

COMMANDS:
    add <branch>        Create a worktree and run full setup
    setup [path]        Run setup on an existing worktree
    list                List all worktrees with setup status
    remove <branch>     Remove a worktree cleanly
    cd <branch>         Print worktree path (for use with cd)
    init                Generate .worktreerc for this repo
    doctor [path]       Diagnose worktree setup issues

GLOBAL OPTIONS:
    --help, -h          Show this help message
    --version, -v       Show version
    --quiet, -q         Only show errors
    --verbose           Show debug output

Run 'wt <command> --help' for command-specific help.
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
  path?: string;
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
    } else if (arg.startsWith("--path=")) {
      flags.path = arg.slice("--path=".length);
    } else if (arg === "--path") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags.path = next;
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
  const { command, args, flags } = parseArgs(argv);

  // Apply global flags to logger
  configureLogger({
    quiet: flags.quiet === true,
    verbose: flags.verbose === true,
  });

  if (flags.version) {
    process.stdout.write(`wt v${VERSION}\n`);
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
      default:
        logger.error(`Unknown command: '${resolvedCommand}'. Run 'wt --help' for usage.`);
        return 1;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Unexpected error: ${message}`);
    if (flags.verbose && err instanceof Error && err.stack) {
      logger.debug(err.stack);
    }
    return 1;
  }
}

const exitCode = await main();
process.exit(exitCode);
