import fs from "node:fs";
import path from "node:path";

import type { BoundedCodexDiagnostics } from "@/runtime/codex-process/lib/diagnostics";
import { CodexExecutableError } from "@/runtime/codex-process/lib/executable";
import {
	CODEX_APP_SERVER_ARGUMENTS,
	CodexProcessError,
	type ChildExit,
	type CodexProcessFailureCode,
	type CodexProcessTestOptions,
} from "@/runtime/codex-process/lib/process-contract";

const SECRET_ENVIRONMENT_KEY = /(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|PRIVATE)/iu;

/**
 * Cut text to a UTF-8 byte budget without splitting a character, marking the
 * cut with an ellipsis.
 * @param text - The text to bound.
 * @param limitBytes - The byte budget.
 * @returns The text unchanged when it fits, otherwise a marked prefix.
 */
function truncateUtf8(text: string, limitBytes: number): string {
	const bytes = Buffer.from(text, "utf8");
	if (bytes.byteLength <= limitBytes) return text;
	const marker = limitBytes >= 3 ? "…" : ".";
	const markerBytes = Buffer.byteLength(marker, "utf8");
	let end = Math.max(0, limitBytes - markerBytes);
	while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
	return `${bytes.subarray(0, end).toString("utf8")}${marker}`;
}

/**
 * Refuse a checkout cwd that is not an absolute path.
 * @param value - The configured checkout root.
 */
function assertAbsoluteCheckout(value: string): void {
	if (!value || value.includes("\0") || !path.isAbsolute(value))
		throw new CodexProcessError({
			code: "storage_refused",
			terminal: true,
			message: `The Codex checkout cwd must be an existing absolute path, received ${JSON.stringify(value)}.`,
		});
}

/**
 * Resolve the checkout root the child runs in, refusing anything that is not
 * an existing directory.
 * @param candidate - The configured checkout root.
 * @returns The real path of the checkout directory.
 */
function canonicalCheckout(candidate: string | undefined): string {
	const value = candidate ?? "";
	assertAbsoluteCheckout(value);
	try {
		const canonical = fs.realpathSync(value);
		if (!fs.statSync(canonical).isDirectory()) throw new Error("not a directory");
		return canonical;
	} catch {
		throw new CodexProcessError({
			code: "storage_refused",
			terminal: true,
			message: `The Codex checkout cwd ${value} is missing or not a directory.`,
		});
	}
}

/**
 * Require the child argv to be exactly the executable plus the app-server
 * strict arguments; any caller addition is refused before spawn.
 * @param candidate - A caller-supplied argv, when tests provide one.
 * @param executablePath - The verified executable.
 * @returns The frozen exact argv.
 */
function exactArguments(
	candidate: readonly string[] | undefined,
	executablePath: string,
): readonly string[] {
	const expected = [executablePath, ...CODEX_APP_SERVER_ARGUMENTS];
	if (candidate === undefined) return Object.freeze(expected);
	if (
		candidate.length !== expected.length ||
		candidate.some((value, index) => value !== expected[index])
	)
		throw new CodexProcessError({
			code: "binary_invalid",
			terminal: true,
			message:
				"The Codex child argv must contain only the configured executable, app-server, --stdio, and --strict-config. Daemon, proxy, listen, websocket, analytics-default, code-mode-host, Desktop MCP, and caller-supplied extra arguments are refused.",
		});
	return Object.freeze([...candidate]);
}

/**
 * Recognise stderr text that looks like the app-server rejecting its strict
 * configuration.
 * @param text - A stderr fragment.
 * @returns True when the fragment names a config or argument rejection.
 */
function strictConfigHint(text: string): boolean {
	return /strict(?:[- ]config)|unknown argument|unrecognized option|invalid config/iu.test(text);
}

/**
 * Describe an unexpected child exit with its code, signal, argv and retained
 * stderr.
 * @param classification - How the exit was classified.
 * @param exit - The exit code and signal.
 * @param argv - The child's exact argv.
 * @param stderr - The retained redacted stderr.
 * @returns The failure message.
 */
function exitFailureMessage(
	classification: "early_exit" | "crash" | "strict_config",
	exit: ChildExit,
	argv: readonly string[],
	stderr: BoundedCodexDiagnostics,
): string {
	const detail = stderr.text ? ` stderr=${JSON.stringify(stderr.text)}` : "";
	return `Codex child ${classification} with code=${String(exit.code)} signal=${String(exit.signal)} argv=${JSON.stringify(argv)}.${detail}`;
}

/**
 * Collect the secrets to redact from diagnostics: the caller's list plus every
 * ambient environment value whose key looks secret-bearing.
 * @param options - The process options.
 * @returns The frozen secret list.
 */
function diagnosticSecrets(options: CodexProcessTestOptions): readonly string[] {
	const ambientSecrets = Object.entries(options.ambientEnvironment ?? process.env)
		.filter(([key, value]) => value !== undefined && SECRET_ENVIRONMENT_KEY.test(key))
		.map(([, value]) => value!);
	return Object.freeze([...(options.diagnosticSecrets ?? []), ...ambientSecrets]);
}

/**
 * Map an executable verification failure onto the process failure code the
 * owner reports.
 * @param cause - The executable error.
 * @returns The process failure code.
 */
function executableFailureCode(cause: CodexExecutableError): CodexProcessFailureCode {
	if (cause.code === "wrong_version") return "binary_wrong_version";
	if (cause.code === "missing" || cause.code === "version_unavailable") return "binary_missing";
	return "binary_invalid";
}

export {
	canonicalCheckout,
	diagnosticSecrets,
	exactArguments,
	executableFailureCode,
	exitFailureMessage,
	strictConfigHint,
	truncateUtf8,
};
