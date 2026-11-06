import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, InvalidArgumentError } from "commander";

export interface ExampleOptions {
	readonly checkout: string;
	readonly state: string;
	readonly browserDirectory: string;
	readonly port: number;
	readonly codex?: string;
}

/**
 * Parse a TCP port, including zero for an operating-system-assigned port.
 * @param value The CLI argument.
 * @returns The requested port.
 */
function portNumber(value: string): number {
	if (!/^\d+$/.test(value) || Number(value) > 65_535)
		throw new InvalidArgumentError("Use a port from 0 to 65535.");
	return Number(value);
}

/**
 * Read explicit host inputs and admit one real checkout directory.
 * @param argv The process arguments.
 * @returns Canonical host paths and the requested listener port.
 */
export function exampleOptions(argv: readonly string[]): ExampleOptions {
	const parsed = new Command()
		.name("workbench-example")
		.description("Run a private Codex workbench for one checkout.")
		.requiredOption("--checkout <path>", "Directory that the workhorse works in")
		.requiredOption("--state <path>", "Private application state directory")
		.option("--port <number>", "Localhost HTTP port", portNumber, 4317)
		.option("--codex <path>", "Absolute executable path with the pinned Codex version")
		.option(
			"--browser-directory <path>",
			"Directory containing the built browser assets",
			fileURLToPath(new URL("../../../../../../dist/workbench-example", import.meta.url)),
		)
		.parse([...argv])
		.opts<ExampleOptions>();
	let checkout: string;
	try {
		checkout = realpathSync(parsed.checkout);
		if (!statSync(checkout).isDirectory()) throw new Error("not a directory");
	} catch {
		throw new Error(
			`Cannot open checkout ${parsed.checkout}. Pass a readable directory with --checkout.`,
		);
	}
	return {
		...parsed,
		checkout,
		state: resolve(parsed.state),
		browserDirectory: resolve(parsed.browserDirectory),
	};
}
