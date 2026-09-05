import path from "node:path";

const RETAINED_ENVIRONMENT_KEYS = [
	"HOME",
	"USER",
	"LOGNAME",
	"SHELL",
	"PATH",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"TZ",
	"TERM",
	"COLORTERM",
	"TMPDIR",
	"TMP",
	"TEMP",
	"XDG_CACHE_HOME",
	"XDG_CONFIG_HOME",
	"XDG_RUNTIME_DIR",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"ALL_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"all_proxy",
	"no_proxy",
	"SSL_CERT_FILE",
	"SSL_CERT_DIR",
	"NIX_SSL_CERT_FILE",
	"GIT_SSL_CAINFO",
	"NODE_EXTRA_CA_CERTS",
	"SSH_AUTH_SOCK",
] as const;

export const CODEX_RETAINED_ENVIRONMENT_KEYS: readonly string[] = Object.freeze([
	...RETAINED_ENVIRONMENT_KEYS,
]);

export type CodexAmbientEnvironment = Readonly<Record<string, string | undefined>>;
export type CodexChildEnvironment = Readonly<Record<string, string>>;

export class CodexEnvironmentError extends Error {
	readonly key?: string;

	constructor(message: string, key?: string, cause?: unknown) {
		super(message, { cause });
		this.name = "CodexEnvironmentError";
		this.key = key;
	}
}

function requirePath(value: string, name: string): string {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0"))
		throw new CodexEnvironmentError(`${name} must be a nonempty NUL-free absolute path.`);
	if (!path.isAbsolute(value))
		throw new CodexEnvironmentError(
			`${name} must be an absolute path, received ${JSON.stringify(value)}.`,
		);
	return value;
}

/**
 * Build the child environment from the reviewed allowlist. The two Codex
 * roots are assigned last so ambient values can never win by insertion order
 * or precedence.
 */
export function buildCodexChildEnvironment(input: {
	readonly ambient?: CodexAmbientEnvironment;
	readonly codexHome: string;
	readonly sqliteHome: string;
}): CodexChildEnvironment {
	const codexHome = requirePath(input.codexHome, "CODEX_HOME");
	const sqliteHome = requirePath(input.sqliteHome, "CODEX_SQLITE_HOME");
	const ambient = input.ambient ?? process.env;
	const child: Record<string, string> = {};

	for (const key of RETAINED_ENVIRONMENT_KEYS) {
		if (!Object.prototype.hasOwnProperty.call(ambient, key)) continue;
		const value = ambient[key];
		if (value === undefined) continue;
		if (typeof value !== "string")
			throw new CodexEnvironmentError(
				`Retained environment key ${key} must have a string value.`,
				key,
			);
		if (value.includes("\0"))
			throw new CodexEnvironmentError(`Retained environment key ${key} contains a NUL byte.`, key);
		child[key] = value;
	}

	child["CODEX_HOME"] = codexHome;
	child["CODEX_SQLITE_HOME"] = sqliteHome;
	return Object.freeze(child);
}
