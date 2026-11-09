// Run a program and keep what it printed. The one place the actions start a process.

import { spawnSync } from "node:child_process";

/** What a finished process left. */
interface ProcessResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

/** The answer of `archboard check` is large: it carries the revision of every vault file. */
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;

/**
 * Run a program to the end.
 * @param command The program.
 * @param args Its arguments.
 * @param options The directory it runs in and the environment it adds to this process's.
 * @param options.cwd The directory.
 * @param options.env Extra environment variables.
 * @returns Its exit status and output. A program that cannot start has exit status 127 and says why on stderr.
 */
function run(
	command: string,
	args: readonly string[],
	options: { readonly cwd?: string; readonly env?: Readonly<Record<string, string>> } = {},
): ProcessResult {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		encoding: "utf8",
		maxBuffer: MAX_OUTPUT_BYTES,
	});
	if (result.error !== undefined) {
		return { exitCode: 127, stdout: "", stderr: `${command}: ${result.error.message}` };
	}
	return { exitCode: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Read a required environment variable that an action step sets from its inputs.
 * @param name The variable.
 * @param fallback The value when it is unset or empty.
 * @returns Its value.
 */
function input(name: string, fallback: string): string {
	const value = process.env[name];
	return value === undefined || value === "" ? fallback : value;
}

/**
 * Parse the JSON object a program printed. The caller reads it as a shape of its own, in which
 * every field that an older program may omit is optional.
 * @param text What the program printed.
 * @returns The object, or undefined when the text is not a JSON object.
 */
function parseJson(text: string): object | undefined {
	try {
		const parsed: unknown = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null ? parsed : undefined;
	} catch {
		return undefined;
	}
}

export { input, parseJson, run, type ProcessResult };
