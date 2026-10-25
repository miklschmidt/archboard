#!/usr/bin/env bun

// The package's single bin entry (`archboard`; `bin/archboard` in the repo):
//
//   no arguments  -> CLI help
//   <subcommand>  -> CLI command
//
// The CLI reaches the Archboard server by spawning apps/server/src/server.ts.
// See runtime/operations/spawn.ts in @archboard/server-lifecycle.

const argv = process.argv.slice(2);

// Inside another archboard checkout, that checkout's source runs the command
// (ADR 0049). Decided first, so that it gets the environment as it was given.
const { handOff } = await import("@archboard/workspace/source-checkout");
const handedOff = await handOff(argv);
if (handedOff !== null) {
	process.exit(handedOff);
}

// Must run before importing anything that reads runtime configuration. A help
// request is answered from the command table alone, so it configures nothing.
const { applyCliBootstrap } = await import("#cli/operations/bootstrap/bootstrap.ts");
const bootstrap = applyCliBootstrap(argv);

if (!bootstrap.help) {
	// Disable colors to prevent ANSI color codes from breaking JSON parsing. Help
	// prints no JSON, so it keeps the terminal's colors.
	process.env["NODE_DISABLE_COLORS"] = "1";
	process.env["NO_COLOR"] = "1";
	const { removedEnvironmentMessage } = await import("@archboard/server-lifecycle/config");
	const removed = removedEnvironmentMessage();
	if (removed !== null) {
		process.stderr.write(`${removed}\n`);
		process.exit(2);
	}
}

const { runCli } = await import("#cli/operations/invocation/run.ts");
await runCli(argv, bootstrap);
