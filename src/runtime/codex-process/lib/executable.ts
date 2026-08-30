import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CODEX_PROTOCOL_BINARY_VERSION } from "../../codex-protocol/index.js";

export interface VerifiedCodexExecutable {
	readonly executablePath: string;
	readonly version: typeof CODEX_PROTOCOL_BINARY_VERSION;
}

export type CodexExecutableFailureCode =
	| "not_absolute"
	| "missing"
	| "not_file"
	| "not_executable"
	| "version_unavailable"
	| "wrong_version"
	| "outside_checkout";

export class CodexExecutableError extends Error {
	readonly code: CodexExecutableFailureCode;
	readonly executablePath: string;

	constructor(init: {
		readonly code: CodexExecutableFailureCode;
		readonly executablePath: string;
		readonly message: string;
		readonly cause?: unknown;
	}) {
		super(init.message, { cause: init.cause });
		this.name = "CodexExecutableError";
		this.code = init.code;
		this.executablePath = init.executablePath;
	}
}

function absolutePath(candidate: string): string {
	if (typeof candidate !== "string" || candidate.length === 0 || candidate.includes("\0"))
		throw new CodexExecutableError({
			code: "not_absolute",
			executablePath: String(candidate),
			message: "The configured Codex executable must be a nonempty NUL-free absolute path.",
		});
	if (!path.isAbsolute(candidate))
		throw new CodexExecutableError({
			code: "not_absolute",
			executablePath: candidate,
			message: `The configured Codex executable must be absolute, received ${JSON.stringify(candidate)}. PATH lookup is disabled.`,
		});
	return path.resolve(candidate);
}

/** Resolve only the package-local wrapper selected by the pinned dependency. */
export function resolveProjectCodexExecutable(): string {
	const require = createRequire(import.meta.url);
	const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
	let resolved: string;
	try {
		resolved = require.resolve("@openai/codex/bin/codex.js");
	} catch (cause) {
		throw new CodexExecutableError({
			code: "missing",
			executablePath: "@openai/codex/bin/codex.js",
			message:
				"The pinned project-local @openai/codex executable is unavailable. Run bun install and retry.",
			cause,
		});
	}
	const localNodeModules = `${path.join(projectRoot, "node_modules")}${path.sep}`;
	const absolute = path.resolve(resolved);
	if (!absolute.startsWith(localNodeModules))
		throw new CodexExecutableError({
			code: "outside_checkout",
			executablePath: absolute,
			message: `The resolved Codex executable is outside this checkout: ${absolute}. PATH and global package resolution are disabled.`,
		});
	return absolute;
}

/** Verify the exact pinned executable without consulting PATH or ambient args. */
export function verifyCodexExecutable(candidate: string): VerifiedCodexExecutable {
	const executablePath = absolutePath(candidate);
	let stats: fs.Stats;
	try {
		stats = fs.statSync(executablePath);
	} catch (cause) {
		throw new CodexExecutableError({
			code: "missing",
			executablePath,
			message: `The configured Codex executable does not exist: ${executablePath}. Provide the pinned Codex ${CODEX_PROTOCOL_BINARY_VERSION} binary.`,
			cause,
		});
	}
	if (!stats.isFile())
		throw new CodexExecutableError({
			code: "not_file",
			executablePath,
			message: `The configured Codex executable is not a file: ${executablePath}.`,
		});
	try {
		fs.accessSync(executablePath, fs.constants.X_OK);
	} catch (cause) {
		throw new CodexExecutableError({
			code: "not_executable",
			executablePath,
			message: `The configured Codex executable is not executable: ${executablePath}.`,
			cause,
		});
	}

	let version: string;
	try {
		version = execFileSync(executablePath, ["--version"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
		}).trim();
	} catch (cause) {
		throw new CodexExecutableError({
			code: "version_unavailable",
			executablePath,
			message: `Could not run ${executablePath} --version. Provide the exact Codex ${CODEX_PROTOCOL_BINARY_VERSION} executable; PATH lookup is disabled.`,
			cause,
		});
	}
	if (version !== CODEX_PROTOCOL_BINARY_VERSION)
		throw new CodexExecutableError({
			code: "wrong_version",
			executablePath,
			message: `The configured Codex executable reported ${version || "<empty output>"}; expected ${CODEX_PROTOCOL_BINARY_VERSION}.`,
		});
	return Object.freeze({ executablePath, version: CODEX_PROTOCOL_BINARY_VERSION });
}
