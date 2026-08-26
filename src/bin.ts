#!/usr/bin/env bun

// The package's single bin entry (`archboard`; `bin/canvas` in the repo):
//
//   no arguments  -> CLI help
//   <subcommand>  -> CLI command
//
// IMPORTANT: never statically import ./server.js here. The CLI reaches the
// canvas by spawning src/server.ts as a child process (see runtime/engine/spawn.ts).

// Disable colors to prevent ANSI color codes from breaking JSON parsing
process.env.NODE_DISABLE_COLORS = "1";
process.env.NO_COLOR = "1";

const argv = process.argv.slice(2);
// Must run before importing anything that reads runtime configuration.
const { applyCliBootstrap } = await import("./cli/command-contract/bootstrap.js");
applyCliBootstrap(argv);

const { runCli } = await import("./cli/commands/run.js");
await runCli(argv);
