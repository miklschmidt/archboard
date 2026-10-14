import {
	createBoardTransition,
	locateSemanticBoard,
	readSemanticBoard,
	writeSemanticBoard,
} from "../../../../src/runtime/semantic-board-store/index.ts";

/** A board written to a vault, and the node whose binding is bound. */
interface BoundBoard {
	/** The board key an activation names. */
	readonly key: string;
	/** The node id an activation names. */
	readonly node: string;
	/** The file the board lives in, so a test can prove it was not touched. */
	readonly file: string;
}

/**
 * Write one board whose single node is bound to a file in the fixture's
 * repository, through the store that every other writer goes through.
 * @param vault The vault the board goes in.
 * @param repository The repository identity the binding names.
 * @param path The path inside it.
 * @returns The board key, the node's id and the board's file.
 */
async function boundBoard(vault: string, repository: string, path: string): Promise<BoundBoard> {
	const name = `payments-${Math.random().toString(36).slice(2, 8)}`;
	const written = await writeSemanticBoard({
		vault,
		board: name,
		writer: { kind: "agent" },
		transition: createBoardTransition({
			name,
			level: "system",
			nodes: [{ name: "Payments", kind: "service", binding: { repo: repository, path } }],
			edges: [],
			flows: [],
			views: [],
			walkthroughs: [],
		}),
	});
	if (written.outcome !== "applied") {
		throw new Error(`Could not write the bound board: ${written.problem}`);
	}
	const read = readSemanticBoard(vault, name);
	if (!read.ok) {
		throw new Error(`Could not read the bound board: ${read.problem}`);
	}
	const variant = read.board.variants.find((one) => one.id === read.board.current);
	const node = variant?.content.nodes[0];
	if (node === undefined) {
		throw new Error("The written board has no node.");
	}
	return { key: name, node: node.id, file: locateSemanticBoard(name, vault).file };
}

export { type BoundBoard, boundBoard };
