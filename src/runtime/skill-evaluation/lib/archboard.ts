// The archboard CLI as the harness drives it: one call, one parsed JSON
// answer. The harness lays fixtures and reads outcomes through the same
// commands an agent uses, so what the checks read is what the CLI says.

import { SKILL_EVAL_CLI_TIMEOUT_MS } from "@/shared/timing/timing";
import { runProcess } from "@/runtime/skill-evaluation/lib/process";

/** What one call answered. */
interface CliAnswer {
	readonly exitCode: number | null;
	readonly json: unknown;
	readonly stdout: string;
	readonly stderr: string;
}

/** How the CLI is reached. */
interface CliContext {
	readonly checkout: string;
	readonly env: Readonly<Record<string, string>>;
	readonly cwd: string;
	readonly signal?: AbortSignal | undefined;
}

/**
 * The JSON the CLI printed: the whole stdout when it parses, else the last
 * line that does, since a command with diagnostics prints both.
 * @param stdout The output.
 * @returns The parsed value, or null.
 */
function jsonOf(stdout: string): unknown {
	const candidates = [stdout.trim(), ...stdout.trim().split("\n").toReversed()];
	for (const candidate of candidates) {
		if (!candidate.startsWith("{") && !candidate.startsWith("[")) continue;
		try {
			return JSON.parse(candidate);
		} catch {
			// Not this one.
		}
	}
	return null;
}

/**
 * Runs one archboard command.
 * @param context How to reach the CLI.
 * @param args The command line after `archboard`.
 * @param stdin JSON to give it, when the command reads one.
 * @returns The answer.
 */
async function archboard(
	context: CliContext,
	args: readonly string[],
	stdin?: string,
): Promise<CliAnswer> {
	const result = await runProcess({
		argv: [process.execPath, `${context.checkout}/src/bin.ts`, ...args],
		cwd: context.cwd,
		env: context.env,
		stdin,
		timeoutMs: SKILL_EVAL_CLI_TIMEOUT_MS,
		signal: context.signal,
	});
	return {
		exitCode: result.exitCode,
		json: jsonOf(result.stdout),
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

/**
 * Runs one archboard command that must succeed.
 * @param context How to reach the CLI.
 * @param args The command line.
 * @param stdin JSON to give it.
 * @returns The parsed answer.
 */
async function archboardOk(
	context: CliContext,
	args: readonly string[],
	stdin?: string,
): Promise<unknown> {
	const answer = await archboard(context, args, stdin);
	if (answer.exitCode !== 0 || answer.json === null) {
		throw new Error(
			`archboard ${args.join(" ")} failed (${answer.exitCode}): ${answer.stderr.trim() || answer.stdout.trim()}`,
		);
	}
	return answer.json;
}

export { archboard, archboardOk, jsonOf, type CliAnswer, type CliContext };
