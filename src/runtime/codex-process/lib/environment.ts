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

const CODEX_RETAINED_ENVIRONMENT_KEYS: readonly string[] = Object.freeze([
	...RETAINED_ENVIRONMENT_KEYS,
]);

type CodexAmbientEnvironment = Readonly<Record<string, string | undefined>>;
type CodexChildEnvironment = Readonly<Record<string, string>>;

/**
 * The Archboard server that owns the child. A thread runs `archboard` like any agent does, and
 * that CLI finds its server in its environment, so the child must name its own. The child names
 * no vault (ADR 0050): a thread's command finds its vault from its directory or `-C`.
 */
interface CodexArchboardServer {
	/** The URL the server listens at. */
	readonly url: string;
}

interface CodexChildEnvironmentInput {
	/** The reviewed ambient environment; the current process environment when absent. */
	readonly ambient?: CodexAmbientEnvironment;
	/** The canonical private CODEX_HOME root. */
	readonly codexHome: string;
	/** The canonical private CODEX_SQLITE_HOME root. */
	readonly sqliteHome: string;
	/** The server that started the child. */
	readonly archboardServer: CodexArchboardServer;
}

class CodexEnvironmentError extends Error {
	public readonly key: string | undefined;

	/**
	 * Name the environment key that made the child environment unbuildable.
	 * @param message - Why the environment was refused.
	 * @param key - The offending environment key, when one key is to blame.
	 * @param cause - The underlying failure, when there is one.
	 */
	public constructor(message: string, key?: string, cause?: unknown) {
		super(message, { cause });
		this.name = "CodexEnvironmentError";
		this.key = key;
	}
}

/**
 * Refuse a Codex root that is empty, contains a NUL byte, or is not absolute,
 * because the child would otherwise resolve it against its own cwd.
 * @param value - The candidate root.
 * @param name - The environment variable the root will be assigned to, for the message.
 * @returns The same value once it is known to be a usable absolute path.
 */
function requirePath(value: string, name: string): string {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
		throw new CodexEnvironmentError(`${name} must be a nonempty NUL-free absolute path.`);
	}
	if (!path.isAbsolute(value)) {
		throw new CodexEnvironmentError(
			`${name} must be an absolute path, received ${JSON.stringify(value)}.`,
		);
	}
	return value;
}

/**
 * Read one allowlisted key from the ambient environment, refusing values the
 * child could not receive intact.
 * @param ambient - The reviewed ambient environment.
 * @param key - The allowlisted key to copy.
 * @returns The string value, or undefined when the key is absent or unset.
 */
function retainedValue(ambient: CodexAmbientEnvironment, key: string): string | undefined {
	if (!Object.hasOwn(ambient, key)) return undefined;
	const value = ambient[key];
	if (value === undefined) return undefined;
	if (typeof value !== "string") {
		throw new CodexEnvironmentError(
			`Retained environment key ${key} must have a string value.`,
			key,
		);
	}
	if (value.includes("\0")) {
		throw new CodexEnvironmentError(`Retained environment key ${key} contains a NUL byte.`, key);
	}
	return value;
}

/**
 * Build the child environment from the reviewed allowlist. The Codex roots and
 * the server's address are assigned last so ambient values can never win by
 * insertion order or precedence.
 *
 * Auto-start is off in the child. It lives only as long as its server, so a thread's CLI that
 * finds no server has outlived it, and starting one would put a second server nobody asked for
 * beside it. An explicit `archboard start` still overrides it.
 * @param input - Canonical private Codex roots, the owning server and an optional reviewed ambient
 * environment.
 * @returns The frozen allowlisted environment for the owned app-server child.
 */
function buildCodexChildEnvironment(input: CodexChildEnvironmentInput): CodexChildEnvironment {
	const codexHome = requirePath(input.codexHome, "CODEX_HOME");
	const sqliteHome = requirePath(input.sqliteHome, "CODEX_SQLITE_HOME");
	const ambient = input.ambient ?? process.env;
	const child: Record<string, string> = {};

	for (const key of RETAINED_ENVIRONMENT_KEYS) {
		const value = retainedValue(ambient, key);
		if (value !== undefined) child[key] = value;
	}

	child["CODEX_HOME"] = codexHome;
	child["CODEX_SQLITE_HOME"] = sqliteHome;
	child["ARCHBOARD_URL"] = input.archboardServer.url;
	child["ARCHBOARD_NO_AUTOSTART"] = "1";
	return Object.freeze(child);
}

export { CODEX_RETAINED_ENVIRONMENT_KEYS, CodexEnvironmentError, buildCodexChildEnvironment };
export type {
	CodexAmbientEnvironment,
	CodexArchboardServer,
	CodexChildEnvironment,
	CodexChildEnvironmentInput,
};
