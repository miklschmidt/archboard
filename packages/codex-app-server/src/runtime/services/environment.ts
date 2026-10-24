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

interface CodexChildEnvironmentInput {
	/** The reviewed ambient environment; the current process environment when absent. */
	readonly ambient?: CodexAmbientEnvironment;
	/** The canonical private CODEX_HOME root. */
	readonly codexHome: string;
	/** The canonical private CODEX_SQLITE_HOME root. */
	readonly sqliteHome: string;
	/** Explicit host additions override retained ambient values, except the protected Codex roots. */
	readonly hostEnvironment?: CodexChildEnvironment | undefined;
	/** Absolute directories that lead the resulting PATH, in the supplied order. */
	readonly pathPrefixes?: readonly string[] | undefined;
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
	return value === undefined ? undefined : requireEnvironmentValue(value, key);
}

/**
 * Refuse a value that a child cannot receive intact.
 * @param value - The candidate environment value.
 * @param key - The environment key for the refusal.
 * @returns The validated string.
 */
function requireEnvironmentValue(value: unknown, key: string): string {
	if (typeof value !== "string") {
		throw new CodexEnvironmentError(`Environment key ${key} must have a string value.`, key);
	}
	if (value.includes("\0")) {
		throw new CodexEnvironmentError(`Environment key ${key} contains a NUL byte.`, key);
	}
	return value;
}

/**
 * Build the child environment from the ambient allowlist and explicit host additions.
 * Assign the private Codex roots last so neither source can replace them.
 * @param input - Private Codex roots, host additions, PATH prefixes and reviewed ambient values.
 * @returns The frozen environment for the owned app-server child.
 */
function buildCodexChildEnvironment(input: CodexChildEnvironmentInput): CodexChildEnvironment {
	const codexHome = requirePath(input.codexHome, "CODEX_HOME");
	const sqliteHome = requirePath(input.sqliteHome, "CODEX_SQLITE_HOME");
	const ambient = input.ambient ?? process.env;
	const retained: Record<string, string> = {};

	for (const key of RETAINED_ENVIRONMENT_KEYS) {
		const value = retainedValue(ambient, key);
		if (value !== undefined) retained[key] = value;
	}

	const child = { ...retained, ...hostAdditions(input.hostEnvironment) };
	prependPath(child, input.pathPrefixes);
	child["CODEX_HOME"] = codexHome;
	child["CODEX_SQLITE_HOME"] = sqliteHome;
	return Object.freeze(child);
}

/**
 * Validate explicit additions before merging them into the child environment.
 * @param additions - Host-owned environment entries.
 * @returns The validated host additions.
 */
function hostAdditions(additions: CodexChildEnvironment = {}): CodexChildEnvironment {
	for (const [key, value] of Object.entries(additions)) {
		if (key.length === 0 || key.includes("=") || key.includes("\0")) {
			throw new CodexEnvironmentError(
				"Host environment keys must be nonempty and contain no equals sign or NUL byte.",
				key,
			);
		}
		requireEnvironmentValue(value, key);
	}
	return additions;
}

/**
 * Put host executable directories before the resulting PATH.
 * @param child - The merged child environment.
 * @param directories - Absolute directories in precedence order.
 */
function prependPath(child: Record<string, string>, directories: readonly string[] = []): void {
	const prefixes = directories.map((prefix) => requirePath(prefix, "PATH prefix"));
	if (prefixes.length > 0) {
		child["PATH"] = [...prefixes, ...(child["PATH"] === undefined ? [] : [child["PATH"]])].join(
			path.delimiter,
		);
	}
}

export { CODEX_RETAINED_ENVIRONMENT_KEYS, CodexEnvironmentError, buildCodexChildEnvironment };
export type { CodexAmbientEnvironment, CodexChildEnvironment, CodexChildEnvironmentInput };
