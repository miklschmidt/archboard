import { parseDocument, type LegacyBoard } from "@archboard/model-contract";

/**
 * A fixture's legacy board, read the way the store reads one.
 * @param raw The board as a fixture states it.
 * @returns The board.
 * @throws {Error} When the fixture is not a board the store would read.
 */
function legacyBoardOf(raw: unknown): LegacyBoard {
	const parsed = parseDocument("legacyBoard", raw);
	if (!parsed.success) throw new Error(`fixture document is incoherent: ${parsed.error}`);
	return parsed.data;
}

export { legacyBoardOf };
