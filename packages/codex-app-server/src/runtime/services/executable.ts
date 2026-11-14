import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import {
	CODEX_PROTOCOL_BINARY_VERSION,
	CODEX_PROTOCOL_VERSION,
} from "#runtime/protocol/protocol-version.ts";
import { CODEX_SESSION_MS } from "#shared/constants/durations.ts";

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

/** Which Codex executable `resolveCodexExecutable` proves. */
interface CodexExecutableOptions {
	/** An absolute path to prove in place of the installed `@openai/codex` package. */
	readonly executablePath?: string;
	/**
	 * Refuse an installed `@openai/codex` outside `<installedIn>/node_modules`, such as a global
	 * install or the install of another project. It does not apply to `executablePath`.
	 */
	readonly installedIn?: string;
	/**
	 * The directory of a host's compiled release: its platform package. The Codex binary
	 * lies in the `@openai/codex-<os>-<cpu>` package that npm installed beside it or above it,
	 * and it starts without Node.js. It does not apply to `executablePath`.
	 */
	readonly releasedIn?: string;
}

/** The seam that runs the bounded `--version` proof, injected by tests. */
interface CodexExecutableVerificationOptions {
	readonly execFileSync?: typeof execFileSync;
}

/** What a failed executable verification records about itself. */
interface CodexExecutableErrorInit {
	readonly code: CodexExecutableFailureCode;
	readonly executablePath: string;
	readonly message: string;
}

class CodexExecutableError extends Error {
	readonly code: CodexExecutableFailureCode;
	readonly executablePath: string;

	/**
	 * Record which executable failed verification and why, so the process owner
	 * can map the failure to a terminal process failure code.
	 * @param init - The failure code, the executable path examined, and the message.
	 */
	constructor(init: CodexExecutableErrorInit) {
		super(init.message);
		this.name = "CodexExecutableError";
		this.code = init.code;
		this.executablePath = init.executablePath;
	}
}

/**
 * Copy only the environment keys the `--version` proof needs, so ambient
 * secrets never reach the verification child.
 * @returns A frozen minimal environment for the bounded version probe.
 */
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

/**
 * Require an absolute executable path, because PATH lookup is disabled for
 * the Codex child.
 * @param candidate - The configured executable path, untrusted.
 * @returns The resolved absolute path.
 */
function absolutePath(candidate: unknown): string {
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

/**
 * Decide whether a failed `--version` probe was the bounded timeout firing
 * rather than the executable refusing to answer.
 * @param cause - The value thrown by execFileSync.
 * @returns True when the probe was killed by its timeout.
 */
function verificationTimedOut(cause: unknown): boolean {
	if (cause === null || typeof cause !== "object") {
		return false;
	}
	const code = "code" in cause ? cause.code : undefined;
	return code === "ETIMEDOUT" || killedBySignal(cause);
}

/**
 * Whether a spawn failure says the child was killed by one of the signals the bounded probe
 * uses to stop an executable that will not answer.
 * @param cause - The value thrown by execFileSync, already known to be an object.
 * @returns True when the probe reported a kill by TERM or KILL.
 */
function killedBySignal(cause: object): boolean {
	if (!("killed" in cause) || cause.killed !== true) {
		return false;
	}
	const signal = "signal" in cause ? cause.signal : undefined;
	return signal === "SIGKILL" || signal === "SIGTERM";
}

/**
 * Resolve the wrapper of the installed `@openai/codex` package, as the code that runs this module
 * resolves its own dependencies.
 * @param installedIn - The directory whose `node_modules` must hold it, when the host requires one.
 * @returns The absolute path of the Codex wrapper.
 */
function installedCodexExecutable(installedIn: string | undefined): string {
	const require = createRequire(import.meta.url);
	let resolved: string;
	try {
		resolved = require.resolve("@openai/codex/bin/codex.js");
	} catch {
		throw new CodexExecutableError({
			code: "missing",
			executablePath: "@openai/codex/bin/codex.js",
			message: `The @openai/codex ${CODEX_PROTOCOL_VERSION} package is not installed. Run bun install where it is a dependency, or bun add @openai/codex@${CODEX_PROTOCOL_VERSION}, and retry.`,
		});
	}
	return installedIn === undefined
		? path.resolve(resolved)
		: requireCheckoutLocal(resolved, installedIn);
}

/**
 * Refuse an executable that is not in the `node_modules` of one directory, such as a global
 * install or the install of another checkout.
 * @param resolved - The path that module resolution found.
 * @param checkout - The real path of the directory whose `node_modules` must hold it.
 * @returns The absolute path of the executable.
 */
function requireCheckoutLocal(resolved: string, checkout: string): string {
	const localNodeModules = `${path.join(checkout, "node_modules")}${path.sep}`;
	const absolute = path.resolve(resolved);
	if (!absolute.startsWith(localNodeModules)) {
		throw new CodexExecutableError({
			code: "outside_checkout",
			executablePath: absolute,
			message: `The resolved Codex executable is outside ${localNodeModules}: ${absolute}. PATH and global package resolution are disabled.`,
		});
	}
	return absolute;
}

/** The native target of each platform that a compiled release supports. */
const RELEASE_TARGETS: Readonly<
	Record<string, { readonly triple: string; readonly suffix: string }>
> = {
	"linux-x64": { triple: "x86_64-unknown-linux-musl", suffix: "linux-x64" },
	"linux-arm64": { triple: "aarch64-unknown-linux-musl", suffix: "linux-arm64" },
	"darwin-arm64": { triple: "aarch64-apple-darwin", suffix: "darwin-arm64" },
};

/**
 * Find the native Codex binary of a release, the way Node.js resolves a dependency of the
 * release's platform package: in its own `node_modules` (a nested layout), else in the
 * `node_modules` of each directory above it (a hoisted layout, as `bun add -g` makes).
 * @param releasedIn - The real path of the release's platform package.
 * @returns The absolute path of the binary.
 */
function releasedCodex(releasedIn: string): string {
	const target = RELEASE_TARGETS[`${process.platform}-${process.arch}`];
	if (target === undefined) {
		throw new CodexExecutableError({
			code: "missing",
			executablePath: releasedIn,
			message: `A compiled release has no Codex for ${process.platform} on ${process.arch}.`,
		});
	}
	const packageName = path.join("@openai", `codex-${target.suffix}`);
	for (let directory = releasedIn; ; directory = path.dirname(directory)) {
		const candidate = path.join(directory, "node_modules", packageName);
		if (path.basename(directory) !== "node_modules" && fs.existsSync(candidate)) {
			const packageRoot = fs.realpathSync(candidate);
			return path.join(packageRoot, "vendor", target.triple, "bin", "codex");
		}
		if (path.dirname(directory) === directory) break;
	}
	throw new CodexExecutableError({
		code: "missing",
		executablePath: path.join(releasedIn, "node_modules", packageName),
		message: `The Codex ${CODEX_PROTOCOL_VERSION} package ${path.basename(packageName)} is not installed beside the release at ${releasedIn}. Reinstall the release, then retry.`,
	});
}

/**
 * The root of the platform package that holds a native Codex binary.
 * @param executablePath - A proven executable.
 * @returns The package root, or null when the executable is not `<package>/vendor/<triple>/bin/codex`
 * of an `@openai/codex-*` package.
 */
function nativePackageRoot(executablePath: string): string | null {
	const binDirectory = path.dirname(executablePath);
	const packageRoot = path.dirname(path.dirname(path.dirname(binDirectory)));
	const isNative =
		path.basename(executablePath) === "codex" &&
		path.basename(binDirectory) === "bin" &&
		path.basename(path.dirname(packageRoot)) === "@openai" &&
		path.basename(packageRoot).startsWith("codex-");
	return isNative ? packageRoot : null;
}

/**
 * The environment that `bin/codex.js` gives the native binary it starts: the root of the package
 * that holds the binary, and the one `CODEX_MANAGED_BY_*` variable of the package manager that
 * installed it. A release starts the binary itself, so it must set them. The wrapper sets them
 * for itself.
 * @param executablePath - The proven executable.
 * @returns The variables, or none when the executable is not the binary of a platform package.
 */
function nativeCodexEnvironment(executablePath: string): Readonly<Record<string, string>> {
	const packageRoot = nativePackageRoot(executablePath);
	if (packageRoot === null) return {};
	const segments = packageRoot.split(path.sep);
	const manager = segments.includes(".bun")
		? "CODEX_MANAGED_BY_BUN"
		: segments.includes(".pnpm")
			? "CODEX_MANAGED_BY_PNPM"
			: "CODEX_MANAGED_BY_NPM";
	return { CODEX_MANAGED_PACKAGE_ROOT: packageRoot, [manager]: "1" };
}

/**
 * Prove the path names an existing, regular, executable file before anything
 * is run from it.
 * @param executablePath - The absolute executable path.
 */
function assertExecutableFile(executablePath: string): void {
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
}

/**
 * Run the bounded `--version` proof and return what the executable reported.
 * @param executablePath - The verified executable path.
 * @param execute - The synchronous spawner, injectable for tests.
 * @returns The trimmed version text.
 */
function reportedVersion(executablePath: string, execute: typeof execFileSync): string {
	try {
		return execute(executablePath, ["--version"], {
			encoding: "utf8",
			env: verificationEnvironment(),
			maxBuffer: CODEX_EXECUTABLE_PROOF_MAX_BYTES,
			timeout: CODEX_SESSION_MS.requestSettlement,
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
}

/**
 * Verify the exact pinned executable without consulting PATH or ambient args.
 * @param candidate - The configured executable path.
 * @param options - An injectable synchronous spawner for the version proof.
 * @returns The resolved path together with the pinned version it reported.
 */
function verifyCodexExecutable(
	candidate: string,
	options: CodexExecutableVerificationOptions = {},
): VerifiedCodexExecutable {
	const executablePath = absolutePath(candidate);
	assertExecutableFile(executablePath);
	const version = reportedVersion(executablePath, options.execFileSync ?? execFileSync);
	if (version !== CODEX_PROTOCOL_BINARY_VERSION) {
		throw new CodexExecutableError({
			code: "wrong_version",
			executablePath,
			message: `The configured Codex executable reported an unexpected version; expected ${CODEX_PROTOCOL_BINARY_VERSION}. Run bun install to restore the pinned package, then retry.`,
		});
	}
	return Object.freeze({ executablePath, version: CODEX_PROTOCOL_BINARY_VERSION });
}

/**
 * Find the Codex executable and prove it before anything runs it: an absolute, regular,
 * executable file that reports exactly the pinned Codex version. PATH is never consulted.
 * @param options - An explicit path, or where the installed package must be.
 * @returns The absolute path of the proven executable.
 * @throws {CodexExecutableError} When the executable is missing, outside `installedIn`, not
 * executable, or reports another version.
 */
function resolveCodexExecutable(options: CodexExecutableOptions = {}): string {
	const candidate =
		options.executablePath ??
		(options.releasedIn === undefined
			? installedCodexExecutable(options.installedIn)
			: releasedCodex(options.releasedIn));
	return verifyCodexExecutable(candidate).executablePath;
}

export {
	CODEX_EXECUTABLE_PROOF_MAX_BYTES,
	type VerifiedCodexExecutable,
	CodexExecutableError,
	requireCheckoutLocal,
	nativeCodexEnvironment,
	resolveCodexExecutable,
	verifyCodexExecutable,
};
