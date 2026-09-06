// What a pane's write must state (ADR 0022): the note's version as the pane
// last saw it. A test standing in for a pane reads it the way a pane would
// have been told it, from the board, just before writing.

type InfoRequest = (path: string) => Promise<{ body: unknown }>;

/** The note's current version, or 0 for a note carrying none. */
export async function noteVersionOf(request: InfoRequest, board: string): Promise<number> {
	const { body } = await request(`/api/boards/info?board=${encodeURIComponent(board)}`);
	const version = (body as { version?: unknown } | null)?.version;
	return typeof version === "number" ? version : 0;
}

/** The query for a human write of `board` against the note as it stands now. */
export async function humanWriteQuery(request: InfoRequest, board: string): Promise<string> {
	return `?board=${encodeURIComponent(board)}&expectVersion=${await noteVersionOf(request, board)}`;
}
