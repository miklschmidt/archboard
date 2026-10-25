// How a request to the agent names the archboard it must use: the vault the
// person is reading with -C, and the server this browser shows with --url. The
// agent may work in another checkout than the one the person reads (ADR 0049),
// and -C on a vault directory finds that same vault.

/**
 * The start of every archboard command the agent runs for this request.
 * @param serverUrl The server's origin.
 * @param vault The vault the request is about.
 * @returns `archboard -C '<vault>' --url <server>`, the vault quoted for a shell.
 */
function archboardIn(serverUrl: string, vault: string): string {
	const named = `'${vault.replaceAll("'", String.raw`'\''`)}'`;
	return `archboard -C ${named} --url ${serverUrl}`;
}

export { archboardIn };
