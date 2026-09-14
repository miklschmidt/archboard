// The third answer to a removal (TASK-213).
//
// A draft that removed a node its predecessor went on to change is asked to
// keep the removal or take the change. The documented contract offers a third
// answer: the node back, under the identity the whole family knows it by,
// saying what this draft wants it to say — as an ordinary edit stating that
// id. This module decides which ids an edit may bring back, from the draft's
// recorded standing, and settles the disagreement the edit answered through
// the same catch-up every `resolve` uses, so the restored node, the settled
// standing and the descendants' answers are one write and one version.

import type { SemanticBoard, SemanticVariant } from "@/shared/semantic-board/index";
import { refuse } from "@/runtime/semantic-board-store/lib/outcome";
import { caughtUp, type Settlement } from "@/runtime/semantic-board-store/lib/settle";

/**
 * The node ids an ordinary edit to this proposal may restore under their
 * original identity: the subjects of the disagreements it holds about a node
 * it removed and its predecessor changed.
 *
 * Only a proposal that has been merged holds any. One waiting on an ancestor
 * has no disagreement of its own, so nothing on it is restorable, and a stated
 * id absent from it stays refused as it always was.
 * @param draft The proposal.
 * @returns The ids allowed back.
 */
function restorableNodes(draft: SemanticVariant): Set<string> {
	const present = new Set(draft.content.nodes.map((node) => node.id));
	return new Set(
		(draft.reconciliation?.issues ?? [])
			.filter((issue) => issue.kind === "deleted-and-changed" && !present.has(issue.subject))
			.map((issue) => issue.subject),
	);
}

/**
 * Settle the disagreements an ordinary edit answered by restoring what this
 * proposal had removed, and carry the answer down like any other settlement.
 *
 * The edit's content is this proposal's third answer, whole: the base moves
 * to the predecessor's version of each restored subject, so what the restored
 * node says here reads as this proposal's own change and nothing reopens the
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

export { restorableNodes, settleByRestoring };
