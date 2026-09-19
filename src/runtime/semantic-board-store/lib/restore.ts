// Ordinary edits may bring inherited nodes and relationships back under their
// original ids. When that also answers an open removal disagreement, the
// restoration and settlement share the same atomic family write.

import type { SemanticBoard, SemanticVariant } from "@/shared/semantic-board/index";
import { refuse } from "@/runtime/semantic-board-store/lib/outcome";
import { caughtUp, type Settlement } from "@/runtime/semantic-board-store/lib/settle";

/** Identities inherited from the direct predecessor or recorded reconciliation base. */
interface RestorableSubjects {
	readonly nodes: ReadonlySet<string>;
	readonly edges: ReadonlySet<string>;
}

/**
 * Find absent subjects whose identity and kind the inheritance boundary knows.
 * Siblings and older ancestors are not sources of identities for this edit.
 * @param board The variant family.
 * @param variant The variant before the edit.
 * @returns Known absent identities, separated by kind.
 */
function restorableSubjects(board: SemanticBoard, variant: SemanticVariant): RestorableSubjects {
	const parent = board.variants.find((one) => one.id === variant.parent);
	const sources = [parent?.content, variant.reconciliation?.base];
	/**
	 * Collect absent inherited ids of one subject kind.
	 * @param kind The collection whose identities may be restored.
	 * @returns Absent ids known at the inheritance boundary.
	 */
	const absent = (kind: "nodes" | "edges") => {
		const present = new Set(variant.content[kind].map((subject) => subject.id));
		return new Set(
			sources.flatMap((source) =>
				(source?.[kind] ?? []).map((subject) => subject.id).filter((id) => !present.has(id)),
			),
		);
	};
	return { nodes: absent("nodes"), edges: absent("edges") };
}

/**
 * Settle the disagreements an ordinary edit answered by restoring what this
 * proposal had removed, and carry the answer down like any other settlement.
 *
 * The edit's content is this proposal's third answer, whole: the base moves
 * to the predecessor's version of each restored subject, so what the restored
 * subject says here reads as this proposal's own change and nothing reopens the
 * argument. Disagreements the edit did not touch stay exactly as they were.
 * @param board The board as it stands.
 * @param draft The proposal as it stood before the edit.
 * @param content Its content as the edit leaves it.
 * @param restored The ids the edit brought back.
 * @param atVersion The version the board will carry once this write lands.
 * @returns The family afterwards, or the refusal.
 */
function settleByRestoring(
	board: SemanticBoard,
	draft: SemanticVariant,
	content: SemanticVariant["content"],
	restored: ReadonlySet<string>,
	atVersion: number,
): Settlement {
	const standing = draft.reconciliation;
	if (standing === undefined) {
		return refuse("NOTHING_TO_SETTLE", `"${draft.name}" is not waiting on anything`);
	}
	const parent = board.variants.find((one) => one.id === standing.against);
	if (parent === undefined) {
		return refuse(
			"UNKNOWN_VARIANT",
			`"${draft.name}" is waiting on a variant this board no longer has`,
		);
	}
	const taken = standing.issues.filter(
		(issue) => issue.kind === "deleted-and-changed" && restored.has(issue.subject),
	);
	const kept = standing.issues.filter((issue) => !taken.includes(issue));
	return caughtUp(board, { draft, parent, standing, atVersion }, content, { taken, kept });
}

export { type RestorableSubjects, restorableSubjects, settleByRestoring };
