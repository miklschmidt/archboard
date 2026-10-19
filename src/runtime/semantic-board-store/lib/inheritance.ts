// A proposal holds the whole architecture at its point, not a patch (TASK-487).
// Two single writes break that while leaving a valid board, so no other rule
// refuses them. One removes most of what the variant inherited, and the
// proposal then holds only its own change. One adds a part that an ancestor
// still holds under another id, and every view that names the original then
// draws nothing on it, and every comparison reads a removal beside an addition.
// Each is refused unless the edit confirms its code; a confirmed write lands
// and its answer names each confirmed act.

import type { ConfirmableRefusal, VariantEditInput } from "@archboard/board/board-input";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import type { SemanticNode, VariantContent } from "@archboard/board/content";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import type { WriteNotice } from "@/runtime/semantic-board-store/lib/replaced-relationships";

/** One act the edit performs that needs a confirmation. */
interface ConfirmableAct {
	readonly code: Exclude<ConfirmableRefusal, "RESTORE_UNCONFIRMED">;
	/** Why the edit is refused when it does not confirm the code. */
	readonly refusal: string;
	/** What the answer says when it does. */
	readonly notices: readonly WriteNotice[];
}

/** A part the edit adds under a new id, and the ancestor's part it repeats. */
interface Recreation {
	readonly added: SemanticNode;
	readonly original: SemanticNode;
	readonly ancestor: SemanticVariant;
}

/**
 * Whether an edit keeps what its variant inherited, or confirms each way it does not.
 * @param board The board as it stands.
 * @param variant The edited variant, as it stood.
 * @param after Its content as the edit leaves it.
 * @param input The edit as stated, with the codes it confirms.
 * @returns The notices for each confirmed act, or the refusal of the first unconfirmed one.
 */
function guardInheritance(
	board: SemanticBoard,
	variant: SemanticVariant,
	after: VariantContent,
	input: VariantEditInput,
): { readonly ok: true; readonly notices: readonly WriteNotice[] } | SemanticRefusal {
	const acts = [recreatedParts(board, variant, after), droppedInheritance(board, variant, after)];
	const performed = acts.filter((act) => act !== undefined);
	const unconfirmed = performed.find((act) => input.confirm?.includes(act.code) !== true);
	if (unconfirmed !== undefined) {
		return refuse(unconfirmed.code, unconfirmed.refusal);
	}
	return { ok: true, notices: performed.flatMap((act) => act.notices) };
}

/**
 * The variant's predecessors, nearest first.
 * @param board The board as it stands.
 * @param variant The variant.
 * @returns Its parent, the parent's parent, and so on.
 */
function ancestors(board: SemanticBoard, variant: SemanticVariant): SemanticVariant[] {
	const chain: SemanticVariant[] = [];
	let next = board.variants.find((one) => one.id === variant.parent);
	while (next !== undefined && !chain.includes(next)) {
		chain.push(next);
		const child = next;
		next = board.variants.find((one) => one.id === child.parent);
	}
	return chain;
}

/**
 * Whether two nodes state the same part: the same name, or exactly the same
 * code binding. A binding is refined over time (directory, file, symbol), so
 * only an equal one counts, and a node without one never matches by it.
 * @param one A node.
 * @param other Another node.
 * @returns True when they read as one part.
 */
function samePart(one: SemanticNode, other: SemanticNode): boolean {
	if (one.name === other.name) return true;
	const [a, b] = [one.binding, other.binding];
	if (a === undefined || b === undefined) return false;
	return a.repo === b.repo && a.path === b.path && a.symbol === b.symbol;
}

/**
 * Every part the edit adds under a freshly minted id while an ancestor holds it
 * under an id the variant no longer holds, matched to the nearest such ancestor.
 * @param board The board as it stands.
 * @param variant The edited variant, as it stood.
 * @param after Its content as the edit leaves it.
 * @returns The act, or nothing when the edit re-creates no part.
 */
function recreatedParts(
	board: SemanticBoard,
	variant: SemanticVariant,
	after: VariantContent,
): ConfirmableAct | undefined {
	// A minted id is one no variant of the board holds (`idsInUse`).
	const known = new Set(board.variants.flatMap((one) => one.content.nodes.map((node) => node.id)));
	const kept = new Set(after.nodes.map((node) => node.id));
	const chain = ancestors(board, variant);
	const found = after.nodes
		.filter((node) => !known.has(node.id))
		.flatMap((added) => repeated(added, chain, kept));
	if (found.length === 0) return undefined;
	const restorable = inheritedNodeIds(board, variant);
	return {
		code: "PART_RECREATED",
		refusal:
			`this edit adds ${found.map((one) => recreation(one, restorable)).join("; ")}. ` +
			"A new id makes every view and comparison that names the original lose the part " +
			"(PART_RECREATED). Add --confirm PART_RECREATED when it is a different part",
		notices: found.map((one) => ({
			code: "PART_RECREATED",
			path: `nodes.${one.added.id}`,
			message:
				`added "${one.added.name}" under a new id though "${one.ancestor.name}" holds ` +
				`node "${one.original.id}"; confirmed as a different part`,
		})),
	};
}

/**
 * The nearest ancestor's part that an added node repeats, when one does.
 * @param added The node the edit adds under a new id.
 * @param chain The edited variant's ancestors, nearest first.
 * @param kept The node ids the variant holds after the edit.
 * @returns The re-creation, or nothing.
 */
function repeated(
	added: SemanticNode,
	chain: readonly SemanticVariant[],
	kept: ReadonlySet<string>,
): Recreation[] {
	for (const ancestor of chain) {
		const original = ancestor.content.nodes.find(
			(node) => !kept.has(node.id) && samePart(node, added),
		);
		if (original !== undefined) return [{ added, original, ancestor }];
	}
	return [];
}

/**
 * The node ids an edit restores without confirming: the direct predecessor's
 * and the recorded reconciliation base's (`restore.ts`).
 * @param board The board as it stands.
 * @param variant The edited variant.
 * @returns The ids.
 */
function inheritedNodeIds(board: SemanticBoard, variant: SemanticVariant): Set<string> {
	const parent = board.variants.find((one) => one.id === variant.parent);
	const sources = [parent?.content, variant.reconciliation?.base];
	return new Set(sources.flatMap((source) => source?.nodes.map((node) => node.id) ?? []));
}

/**
 * One re-created part, and the two ways on from it.
 * @param one The part.
 * @param restorable The ids the edit could restore without confirming.
 * @returns The phrase.
 */
function recreation(one: Recreation, restorable: ReadonlySet<string>): string {
	const confirm = restorable.has(one.original.id) ? "" : " with --confirm RESTORE_UNCONFIRMED";
	return (
		`"${one.added.name}", which "${one.ancestor.name}" holds as node "${one.original.id}" ` +
		`("${one.original.name}"): state "id": "${one.original.id}"${confirm} to bring that part back`
	);
}

/**
 * The removal of more than half of the nodes the variant held that its
 * predecessor also holds. A variant without a predecessor inherits nothing.
 * @param board The board as it stands.
 * @param variant The edited variant, as it stood.
 * @param after Its content as the edit leaves it.
 * @returns The act, or nothing when the edit keeps at least half.
 */
function droppedInheritance(
	board: SemanticBoard,
	variant: SemanticVariant,
	after: VariantContent,
): ConfirmableAct | undefined {
	const parent = board.variants.find((one) => one.id === variant.parent);
	if (parent === undefined) return undefined;
	const theirs = new Set(parent.content.nodes.map((node) => node.id));
	const kept = new Set(after.nodes.map((node) => node.id));
	const inherited = variant.content.nodes.filter((node) => theirs.has(node.id));
	const removed = inherited.filter((node) => !kept.has(node.id)).length;
	if (removed * 2 <= inherited.length) return undefined;
	const counted =
		`${removed} of the ${inherited.length} parts "${variant.name}" holds from ` +
		`"${parent.name}"`;
	return {
		code: "INHERITANCE_DROPPED",
		refusal:
			`this edit removes ${counted} (INHERITANCE_DROPPED). A proposal holds the whole ` +
			"architecture at its point, not only its own change: show one change with a view or " +
			"a comparison. Add --confirm INHERITANCE_DROPPED when the redesign is deliberate",
		notices: [
			{
				code: "INHERITANCE_DROPPED",
				path: "nodes",
				message: `removed ${counted}; confirmed as a deliberate redesign`,
			},
		],
	};
}

export { guardInheritance };
