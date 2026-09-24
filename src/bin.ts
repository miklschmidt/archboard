#!/usr/bin/env bun

// The package's single bin entry (`archboard`; `bin/archboard` in the repo):
//
//   no arguments  -> CLI help
//   <subcommand>  -> CLI command
//
// IMPORTANT: never statically import ./server.js here. The CLI reaches the
// Archboard server by spawning src/server.ts as a child process (see runtime/engine/spawn.ts).

// Disable colors to prevent ANSI color codes from breaking JSON parsing
process.env["NODE_DISABLE_COLORS"] = "1";
process.env["NO_COLOR"] = "1";

const argv = process.argv.slice(2);
// Must run before importing anything that reads runtime configuration. A help
// request is answered from the command table alone, so it configures nothing.
const { applyCliBootstrap } = await import("@/cli/command-contract/bootstrap");
const bootstrap = applyCliBootstrap(argv);

if (!bootstrap.help) {
	const { renamedUrlMessage } = await import("@/runtime/engine/config");
	const renamed = renamedUrlMessage();
	if (renamed !== null) {
		process.stderr.write(`${renamed}\n`);
		process.exit(2);
	}
}

const { runCli } = await import("@/cli/commands/run");
await runCli(argv, bootstrap);
