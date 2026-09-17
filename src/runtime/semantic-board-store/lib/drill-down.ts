// What the vault can say about a link from one board to another (ADR 0029).
//
// A drill-down is the one thing on a board that names something outside it, so
// it is the one thing no single board can check. The board knows it opens
// "Canvas server"; whether the vault holds that board, and what level it is
// at, is a fact about the vault. That is why these three diagnostics live in
// the vault checker and nowhere near the write boundary: refusing a write
// would mean reading another board inside the lease of this one, and the
// answer would go stale the moment the other board was renamed anyway.
//
// The three things it reports, from ADR 0029:
//
//   - a node that exists only to carry its link. It has no relationship, no
//     children and no part in a flow, so the only thing it says is "there is
//     another board" — a button, and a diagram has no buttons;
//   - a link to a board the vault does not hold, which opens nothing;
//   - a kind that disagrees with the level of the board it opens, because a
//     node standing for what another board describes carries that board's
//     level as its kind.
//
// All three are warnings. The board still draws, and the repair is an ordinary
// agent write (ADR 0026) — and every repair the three name rewrites the
// variant's own nodes, which is why they are reported only over the variants
// that still accept content edits (see `content-checks.ts`). On frozen history
// the same warning would name a write the store refuses.

import type { SemanticBoard, SemanticNode, VariantContent } from "@/shared/semantic-board/index";
import type { VaultDiagnostic } from "@/shared/semantic-policy/index";
import { contentCheckedVariants } from "@/runtime/semantic-board-store/lib/content-checks";
import { semanticBoardAddress } from "@/runtime/semantic-board-store/lib/location";

/** What the checker knows about one board it read, as another board's target. */
interface DrillDownTarget {
	/** The board's own name, as the document spells it. */
	readonly name: string;
	/** The level it declares. */
	readonly level: string;
}

/**
 * The address a drill-down names, without touching the filesystem.
 * @param board The board name as the node spells it.
 * @returns Its comparison key, or null when the name is not a usable address.
 */
function targetKey(board: string): string | null {
	try {
		return semanticBoardAddress(board).key;
	} catch {
		return null;
	}
}

/**
 * Whether a node is on the board for any reason other than its link.
 *
 * A part that is really there is wired to something: it sends or receives a
 * relationship, holds children, or takes part in an exchange. A node with none
 * of the three and a `drillDown` is there to be clicked.
 * @param node The node carrying the link.
 * @param content The variant it belongs to.
 * @returns True when the board says something about the node besides the link.
 */
function participates(node: SemanticNode, content: VariantContent): boolean {
	return (
		content.edges.some((edge) => edge.from === node.id || edge.to === node.id) ||
		content.nodes.some((other) => other.parent === node.id) ||
		content.flows.some(
			(flow) =>
				flow.participants.includes(node.id) ||
				flow.steps.some((step) => step.from === node.id || step.to === node.id),
		)
	);
}

/**
 * Everything wrong with one board's links out of it, over the variants
 * somebody can still edit.
 * @param board The board as read.
 * @param file The file it was read from.
 * @param targets Every board the vault holds, by address key.
 * @returns One diagnostic per problem, in board order.
 */
function semanticDrillDownDiagnostics(
	board: SemanticBoard,
	file: string,
	targets: ReadonlyMap<string, DrillDownTarget>,
): VaultDiagnostic[] {
	return contentCheckedVariants(board).flatMap((variant) =>
		variant.content.nodes.flatMap((node) =>
			node.drillDown === undefined
				? []
				: linkDiagnostics(node, node.drillDown.board, variant.content, targets, {
						file,
						board: board.name,
						variant: variant.id,
						path: `variants.${variant.id}.content.nodes.${node.id}.drillDown`,
					}),
		),
	);
}

/** Where one link is, in the words every vault diagnostic uses. */
type DiagnosticSite = Pick<VaultDiagnostic, "file" | "board" | "variant" | "path">;

/**
 * Everything wrong with one node's link.
 * @param node The node carrying it.
 * @param opens The board its drill-down names.
 * @param content The variant it belongs to.
 * @param targets Every board the vault holds, by address key.
 * @param where The diagnostic site.
 * @returns One diagnostic per problem.
 */
function linkDiagnostics(
	node: SemanticNode,
	opens: string,
	content: VariantContent,
	targets: ReadonlyMap<string, DrillDownTarget>,
	where: DiagnosticSite,
): VaultDiagnostic[] {
	const diagnostics: VaultDiagnostic[] = [];
	if (!participates(node, content))
		diagnostics.push({
			...where,
			severity: "warning",
			code: "DRILL_DOWN_ONLY_NODE",
			message:
				`Node ${JSON.stringify(node.name)} carries a drill-down to ${JSON.stringify(opens)} and ` +
				"nothing else: it has no relationship, no children and no part in a flow, so it is on " +
				"the board only to be opened. A drill-down is an affordance on a part that is really " +
				"there. Draw the actual participant this board reaches and put the link on it, or move " +
				"an upward link onto the container the board describes, and remove this node.",
		});
	const key = targetKey(opens);
	const target = key === null ? undefined : targets.get(key);
	if (target === undefined)
		diagnostics.push({
			...where,
			severity: "warning",
			code: "DRILL_DOWN_UNKNOWN_BOARD",
			message:
				`Node ${JSON.stringify(node.name)} opens board ${JSON.stringify(opens)}, which this vault ` +
				"does not hold, so the link opens nothing. Create that board, name the board that does " +
				"describe these internals, or remove the drill-down.",
		});
	else if (node.kind !== target.level)
		diagnostics.push({
			...where,
			severity: "warning",
			code: "DRILL_DOWN_LEVEL_MISMATCH",
			message:
				`Node ${JSON.stringify(node.name)} is of kind ${JSON.stringify(node.kind)} and opens board ` +
				`${JSON.stringify(target.name)}, which is at level ${JSON.stringify(target.level)}. A node ` +
				"standing for what another board describes carries that board's level as its kind: use " +
				`kind ${JSON.stringify(target.level)} (defining it under nodeKinds in ` +
				".archboard/config.yaml when the vault has no such kind yet), or point the drill-down at " +
				"the board this part really is.",
		});
	return diagnostics;
}

export { type DrillDownTarget, semanticDrillDownDiagnostics };
