// What one CLI invocation says about itself on every request it makes: which
// board it is for, what it says it is doing, and which version of that board it
// believes it is writing against.
//
// Carried here rather than threaded through thirty call sites. The CLI is one
// command per process, so "this invocation" is a process-wide fact and stating
// it once is what keeps a write's `--board`, `--doing` and `--expect-version`
// from being forgotten by whichever call site was written last.

/** The board this invocation names, or null when it names none. */
let requestedBoard: string | null = null;

/**
 * The vault this invocation names, which every server call states (ADR 0049):
 * one server serves several vaults and cannot guess which this command means.
 * A command that finds its vault (`-C`, the working directory) names the one it
 * found; until it does, there is none.
 */
let requestedVault: string | null = null;

/** What this invocation says it is doing, or null when it says nothing. */
let writeDoing: string | null = null;
let writeSession: string | null = null;

/**
 * The version this invocation states it is writing against: a number, null for
 * "against a board that carries no version", or undefined for "states none".
 */
let expectedVersion: number | null | undefined;

/**
 * A path with one more query parameter on it.
 * @param path The path, with or without a query string already.
 * @param key The parameter.
 * @param value Its value.
 * @returns The path.
 */
function addQuery(path: string, key: string, value: string | number): string {
	const separator = path.includes("?") ? "&" : "?";
	return `${path}${separator}${key}=${encodeURIComponent(String(value))}`;
}

/**
 * A path carrying the vault this invocation names. Only an API call states
 * one: the health probe asks about the server, and no vault holds its answer.
 * @param requestPath The path.
 * @returns The path, with `?vault=` when it is an API call and there is a vault to state.
 */
function withVault(requestPath: string): string {
	if (requestedVault === null || !requestPath.startsWith("/api/")) {
		return requestPath;
	}
	return /[?&]vault=/u.test(requestPath)
		? requestPath
		: addQuery(requestPath, "vault", requestedVault);
}

/**
 * A path carrying the board this invocation named, when it named one.
 * @param path The path.
 * @returns The path, with `?board=` when there is a board to state.
 */
function withBoard(path: string): string {
	return requestedBoard === null ? path : addQuery(path, "board", requestedBoard);
}

/**
 * A path carrying what this invocation is doing, when it said.
 *
 * Unless the caller has already said it. A command that builds its own query —
 * a semantic write states its line and the version it read together — is the
 * one that knows; adding a second `doing=` behind it would put two values on
 * the wire, and the server would read an array where it expects a line and
 * refuse the write as undescribed.
 * @param path The path.
 * @returns The path, with `?doing=` when there is a line to state and none yet.
 */
function withDoing(path: string): string {
	if (writeDoing === null || /[?&]doing=/u.test(path)) {
		return path;
	}
	return addQuery(path, "doing", writeDoing);
}

/**
 * A path carrying the version this invocation states, when it states one.
 * @param path The path.
 * @returns The path, with `?expectVersion=` when there is one to state.
 */
function withExpectedVersion(path: string): string {
	if (expectedVersion === undefined || expectedVersion === null) {
		return path;
	}
	// The same rule, for the same reason: the caller that built the query is the
	// one that knows what it is writing against.
	return /[?&]expectVersion=/u.test(path) ? path : addQuery(path, "expectVersion", expectedVersion);
}

/**
 * A path carrying everything a write states about itself: the line it is doing
 * under, and the version it believes it is writing against. Only a write, so a
 * read never carries either.
 * @param path The path, board already stated.
 * @param method The request method; anything but GET is a write.
 * @returns The path.
 */
function withWriteClaims(path: string, method?: string): string {
	if (method === undefined || method.toUpperCase() === "GET") {
		return path;
	}
	return withExpectedVersion(withDoing(path));
}

/** What one invocation states about itself, which every later request carries. */
interface InvocationStatement {
	/** The board it names, or null. */
	readonly board: string | null;
	/** The vault directory it names, absolute, or null. */
	readonly vault: string | null;
	/** What it says it is doing, or null. */
	readonly doing: string | null;
	/**
	 * The agent session it writes as, or null. Per invocation, never from the environment: one
	 * private app-server child serves every thread of a workbench, so a value read out of that
	 * process's environment would stamp one session's identity on another's writes. It lets that
	 * session skip the board news it wrote itself, and nothing on a board rests on it.
	 */
	readonly session: string | null;
	/** The version it writes against: null for a board that carries none, undefined for unstated. */
	readonly expectedVersion: number | null | undefined;
}

/**
 * State facts of this invocation. A fact left out keeps what was stated before.
 * @param stated The facts to state.
 */
function stateInvocation(stated: Partial<InvocationStatement>): void {
	const next = { ...statedInvocation(), ...stated };
	requestedBoard = next.board;
	requestedVault = next.vault;
	writeDoing = next.doing;
	writeSession = next.session;
	expectedVersion = next.expectedVersion;
}

/**
 * What this invocation has stated about itself.
 * @returns The facts.
 */
function statedInvocation(): InvocationStatement {
	return {
		board: requestedBoard,
		vault: requestedVault,
		doing: writeDoing,
		session: writeSession,
		expectedVersion,
	};
}

export { type InvocationStatement, stateInvocation, statedInvocation, withBoard, withVault, withWriteClaims };
