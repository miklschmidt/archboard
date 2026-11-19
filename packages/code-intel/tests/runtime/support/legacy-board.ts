// A legacy board as a test builds it: read through the contract, so a fixture is as coherent as a
// board file on disk must be.

import { parseDocument, type LegacyBoard } from "@archboard/model-contract";

/**
 * Read a fixture as a legacy board.
 * @param raw The board as a test writes it.
 * @returns The board.
 * @throws When the fixture is not a coherent board; the message says why.
 */
function legacyBoard(raw: unknown): LegacyBoard {
	const parsed = parseDocument("legacyBoard", raw);
	if (!parsed.success) throw new Error(parsed.error);
	return parsed.data;
}

export { legacyBoard };
