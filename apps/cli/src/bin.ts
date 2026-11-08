#!/usr/bin/env bun

// The package's single bin entry (`archboard`; `bin/archboard` in the repo):
//
//   no arguments  -> CLI help
//   <subcommand>  -> CLI command
//
// The CLI reaches the Archboard server by spawning the `serverCommand` of its
// installation. See runtime/operations/spawn.ts in @archboard/server-lifecycle.

const argv = process.argv.slice(2);

// A process that is neither a release nor in a checkout has no program to run (ADR 0076).
const { installation } = await import("@archboard/workspace/installation");
let installed: ReturnType<typeof installation>;
try {
	installed = installation();
} catch (error) {
	const { errorMessage } = await import("@archboard/diagnostics/thrown-error");
	process.stderr.write(`Error: ${errorMessage(error)}\n`);
	process.exit(1);
}

// A release is one executable, and its serverCommand starts it again with the
// server's argument. Started so, it runs the server's entry, which it embeds,
// and no command (ADR 0076).
const [, ...serverArguments] = installed.serverCommand;
if (installed.mode === "release" && argv.join("\0") === serverArguments.join("\0")) {
	await import(installed.serverModule);
} else {
	// Inside another archboard checkout, that checkout's source runs the command
	// (ADR 0049). Decided first, so that it gets the environment as it was given.
	const { handOff } = await import("@archboard/workspace/source-checkout");
	const handedOff = await handOff(argv);
	if (handedOff !== null) {
		process.exit(handedOff);
	}

	// Must run before importing anything that reads runtime configuration. A help
	// request is answered from the command table alone, so it configures nothing.
	const { applyCliBootstrap } = await import("#cli/routing/operations/bootstrap.ts");
	const bootstrap = applyCliBootstrap(argv);

	if (!bootstrap.help) {
		// Output to a pipe or a file is often JSON that an agent parses, and an ANSI colour code
		// breaks it. So such output has no colour, even when the caller forces colour. A terminal,
		// and every program that a command starts in it, keeps its colours. Help prints no JSON,
		// and neither does `--text`, which colours by the usual rules where it writes.
		if (!process.stdout.isTTY && !bootstrap.text) {
			process.env["NODE_DISABLE_COLORS"] = "1";
			process.env["NO_COLOR"] = "1";
			delete process.env["FORCE_COLOR"];
		}
		const { removedEnvironmentMessage } = await import("@archboard/server-lifecycle/config");
		const removed = removedEnvironmentMessage();
		if (removed !== null) {
			process.stderr.write(`${removed}\n`);
			process.exit(2);
		}
	}

	const { runCli } = await import("#cli/routing/operations/run.ts");
	await runCli(argv, bootstrap);
}
