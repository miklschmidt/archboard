// Which drill-downs a move rewrites, and how (ADR 0051).
//
// A drill-down without a repository opens a board of the vault that carries
// it. So when a board moves to another repository's vault, two kinds of link
// change their meaning, and only those two are rewritten:
//
//   a drill-down on another board of the source vault that opens the moved
//     board. It names the target's identity from now on;
//   a drill-down on the moved board that opens another board of the source
//     vault. It names the source's identity from now on.
//
// A drill-down that already names a repository keeps it, unless it names the
// source vault's own identity and opens the moved board, which leaves that
// vault. A drill-down on the moved board that opens the moved board itself
// opens it in its new vault as it did in the old one, and is left alone.
//
// This half is pure: it reads no file. Which board a name opens is a question
// about the source vault, answered by the caller (`move.ts`).

import type {
	DrillDown,
	MovedDrillDown,
	SemanticBoard,
	SemanticNode,
} from "@/shared/semantic-board/index";

/** The two repository identities of a move, when the vault has one. */
interface MoveIdentities {
	/** The identity of the source vault's checkout, or undefined for an untracked vault. */
	readonly source: string | undefined;
	/** The identity of the target vault's checkout, or undefined for an untracked vault. */
	readonly target: string | undefined;
}

/** What one drill-down becomes, or null when the move leaves it as it is. */
type DrillRewrite = (drill: DrillDown) => DrillDown | null;

/**
 * A board with every drill-down that a rewrite answers for rewritten, and where
 * each one is. Every variant is rewritten, history too: a drill-down on a frozen
 * variant opened a board of this vault, and after the move it would open nothing.
 * @param board The board.
 * @param rewrite What each drill-down becomes.
 * @returns The board, and the drill-downs that changed, without their vault.
 */
function rewriteDrillDowns(
	board: SemanticBoard,
	rewrite: DrillRewrite,
): { readonly board: SemanticBoard; readonly rewritten: Omit<MovedDrillDown, "vault">[] } {
	const rewritten: Omit<MovedDrillDown, "vault">[] = [];
	const variants = board.variants.map((variant) => {
		const before = rewritten.length;
		const nodes = variant.content.nodes.map((node): SemanticNode => {
			const drill = node.drillDown === undefined ? null : rewrite(node.drillDown);
			if (drill === null) return node;
			rewritten.push({ board: board.name, variant: variant.id, node: node.id, drillDown: drill });
			return { ...node, drillDown: drill };
		});
		return rewritten.length > before
			? { ...variant, content: { ...variant.content, nodes } }
			: variant;
	});
	return { board: rewritten.length === 0 ? board : { ...board, variants }, rewritten };
}

/**
 * What a drill-down on another board of the source vault becomes: one that
 * opens the moved board names the target's identity.
 * @param identities The two identities of the move.
 * @param opensMoved Whether a board name, read in the source vault, opens the moved board.
 * @returns The rewrite. It needs the target's identity, and answers a drill-down
 * that needs one it does not have with the drill-down unchanged, for the caller to refuse.
 */
function inboundRewrite(
	identities: MoveIdentities,
	opensMoved: (name: string) => boolean,
): DrillRewrite {
	return (drill) => {
		const local = drill.repo === undefined || drill.repo === identities.source;
		if (!local || !opensMoved(drill.board)) return null;
		return identities.target === undefined ? drill : { ...drill, repo: identities.target };
	};
}

/**
 * What a drill-down on the moved board becomes: one that opens another board
 * of the source vault names the source's identity.
 * @param identities The two identities of the move.
 * @param opensMoved Whether a board name, read in the source vault, opens the moved board.
 * @returns The rewrite, answering a drill-down that needs an identity the
 * source does not have with the drill-down unchanged, for the caller to refuse.
 */
function outboundRewrite(
	identities: MoveIdentities,
	opensMoved: (name: string) => boolean,
): DrillRewrite {
	return (drill) => {
		if (drill.repo !== undefined || opensMoved(drill.board)) return null;
		return identities.source === undefined ? drill : { ...drill, repo: identities.source };
	};
}

export {
	type DrillRewrite,
	type MoveIdentities,
	inboundRewrite,
	outboundRewrite,
	rewriteDrillDowns,
};
