import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CODEX_PROTOCOL_BINARY_VERSION } from "@/runtime/codex-protocol";
import { CODEX_REQUEST_SETTLEMENT_MS } from "@/shared/timing/timing";

const CODEX_EXECUTABLE_PROOF_MAX_BYTES = 64 * 1024;
const VERIFICATION_ENVIRONMENT_KEYS = [
	"PATH",
	"HOME",
	"SystemRoot",
	"WINDIR",
	"TMPDIR",
	"TMP",
	"TEMP",
] as const;

interface VerifiedCodexExecutable {
	readonly executablePath: string;
	readonly version: typeof CODEX_PROTOCOL_BINARY_VERSION;
}

type CodexExecutableFailureCode =
	| "not_absolute"
	| "missing"
	| "not_file"
	| "not_executable"
	| "verification_timeout"
	| "version_unavailable"
	| "wrong_version"
	| "outside_checkout";

class CodexExecutableError extends Error {
	readonly code: CodexExecutableFailureCode;
	readonly executablePath: string;

	constructor(init: {
		readonly code: CodexExecutableFailureCode;
		readonly executablePath: string;
		readonly message: string;
	}) {
		super(init.message);
		this.name = "CodexExecutableError";
		this.code = init.code;
		this.executablePath = init.executablePath;
	}
}

function verificationEnvironment(): NodeJS.ProcessEnv {
	const environment: NodeJS.ProcessEnv = {};
	for (const key of VERIFICATION_ENVIRONMENT_KEYS) {
		const value = process.env[key];
		if (value === undefined) {
			continue;
		}
		if (value.includes("\0")) {
			throw new Error(`The executable verification environment contains a NUL in ${key}.`);
		}
		environment[key] = value;
	}
	return Object.freeze(environment);
}

function absolutePath(candidate: string): string {
	if (typeof candidate !== "string" || candidate.length === 0 || candidate.includes("\0")) {
		throw new CodexExecutableError({
			code: "not_absolute",
			executablePath: String(candidate),
			message: "The configured Codex executable must be a nonempty NUL-free absolute path.",
		});
	}
	if (!path.isAbsolute(candidate)) {
		throw new CodexExecutableError({
			code: "not_absolute",
			executablePath: candidate,
			message: `The configured Codex executable must be absolute, received ${JSON.stringify(candidate)}. PATH lookup is disabled.`,
		});
	}
	return path.resolve(candidate);
}

function verificationTimedOut(cause: unknown): boolean {
	if (cause === null || typeof cause !== "object") {
		return false;
	}
	const value = cause as {
		readonly code?: unknown;
		readonly killed?: unknown;
		readonly signal?: unknown;
	};
	return (
		value.code === "ETIMEDOUT" ||
		(value.killed === true && (value.signal === "SIGKILL" || value.signal === "SIGTERM"))
	);
}

/** Resolve only the package-local wrapper selected by the pinned dependency. */
function resolveProjectCodexExecutable(): string {
	const require = createRequire(import.meta.url);
	const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
	let resolved: string;
	try {
		resolved = require.resolve("@openai/codex/bin/codex.js");
	} catch {
		throw new CodexExecutableError({
			code: "missing",
			executablePath: "@openai/codex/bin/codex.js",
			message:
				"The pinned project-local @openai/codex executable is unavailable. Run bun install and retry.",
		});
	}
	const localNodeModules = `${path.join(projectRoot, "node_modules")}${path.sep}`;
	const absolute = path.resolve(resolved);
	if (!absolute.startsWith(localNodeModules)) {
		throw new CodexExecutableError({
			code: "outside_checkout",
			executablePath: absolute,
			message: `The resolved Codex executable is outside this checkout: ${absolute}. PATH and global package resolution are disabled.`,
		});
	}
	return absolute;
}

/** Verify the exact pinned executable without consulting PATH or ambient args. */
function verifyCodexExecutable(
	candidate: string,
	options: { readonly execFileSync?: typeof execFileSync } = {},
): VerifiedCodexExecutable {
	const executablePath = absolutePath(candidate);
	let stats: fs.Stats;
	try {
		stats = fs.statSync(executablePath);
	} catch {
		throw new CodexExecutableError({
			code: "missing",
			executablePath,
			message: `The configured Codex executable does not exist: ${executablePath}. Run bun install to restore the pinned Codex ${CODEX_PROTOCOL_BINARY_VERSION} runtime, then retry.`,
		});
	}
	if (!stats.isFile()) {
		throw new CodexExecutableError({
			code: "not_file",
			executablePath,
			message: `The configured Codex executable is not a file: ${executablePath}. Run bun install to restore the exact package-local runtime, then retry.`,
		});
	}
	try {
		fs.accessSync(executablePath, fs.constants.X_OK);
	} catch {
		throw new CodexExecutableError({
			code: "not_executable",
			executablePath,
			message: `The configured Codex executable is not executable: ${executablePath}. Run bun install to restore its executable mode, then retry.`,
		});
	}

	let version: string;
	try {
		const execute = options.execFileSync ?? execFileSync;
		version = execute(executablePath, ["--version"], {
			encoding: "utf8",
			env: verificationEnvironment(),
			maxBuffer: CODEX_EXECUTABLE_PROOF_MAX_BYTES,
			timeout: CODEX_REQUEST_SETTLEMENT_MS,
			killSignal: "SIGKILL",
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		}).trim();
	} catch (cause) {
		if (verificationTimedOut(cause)) {
			throw new CodexExecutableError({
				code: "verification_timeout",
				executablePath,
				message:
					`Codex ${CODEX_PROTOCOL_BINARY_VERSION} did not answer the bounded --version proof. ` +
					"Run bun install to restore the exact package-local runtime, then retry.",
			});
		}
		throw new CodexExecutableError({
			code: "version_unavailable",
			executablePath,
			message: `Could not run ${executablePath} --version. Run bun install to restore the exact Codex ${CODEX_PROTOCOL_BINARY_VERSION} runtime; PATH lookup is disabled.`,
		});
	}
	if (version !== CODEX_PROTOCOL_BINARY_VERSION) {
		throw new CodexExecutableError({
			code: "wrong_version",
			executablePath,
			message: `The configured Codex executable reported an unexpected version; expected ${CODEX_PROTOCOL_BINARY_VERSION}. Run bun install to restore the pinned package, then retry.`,
		});
	}
	return Object.freeze({ executablePath, version: CODEX_PROTOCOL_BINARY_VERSION });
}

export {
	CODEX_EXECUTABLE_PROOF_MAX_BYTES,
	type VerifiedCodexExecutable,
	type CodexExecutableFailureCode,
	CodexExecutableError,
	resolveProjectCodexExecutable,
	verifyCodexExecutable,
};
