// Turning "change these elements" into one board mutation.
//
// A route says what it wants in the input spellings an agent or a pane uses;
// applyElementInput is the one converter that spends them (ADR 0015). This is
// the wrapper that keeps that converter one stage inside the write boundary,
// so no route ever reaches it directly.

import { type AppliedElementInput, applyElementInput } from "@/runtime/engine/apply-element-input";
import type { BoardContent } from "@/runtime/engine/board-io";
import type { ElementInputRequest } from "@/runtime/engine/apply-element-input";
import { usableDrawnFiles } from "@/runtime/engine/embedded-files";
import type { ExcalidrawFile } from "@/runtime/engine/types";
import type {
	BoardMutation,
	BoardMutationResult,
	ElementMutationPlan,
} from "@/runtime/engine/lib/board-write-contract";

/**
 * Empty the document a whole-scene report or a scene replacement is about to
 * restate, so that what it does not mention is genuinely gone.
 * @param content The working copy.
 * @param plan What this mutation is.
 */
function clearForReplacement<T>(content: BoardContent, plan: ElementMutationPlan<T>): void {
	if (plan.wholeScene || plan.replaceScene) {
		content.elements.clear();
	}
	if (plan.replaceScene) {
		content.files.clear();
	}
}

/**
 * The element input to apply.
 *
 * A restatement of the whole scene carries no deletes: what it leaves out is
 * already gone from the emptied copy, and naming deletes as well would ask for
 * the same removal twice.
 * @param plan What this mutation is.
 * @returns The input for the converter.
 */
function inputFor<T>(plan: ElementMutationPlan<T>): ElementInputRequest {
	return {
		...plan.input,
		...(plan.wholeScene || plan.replaceScene
			? { deletes: [] }
			: plan.input.deletes === undefined
				? {}
				: { deletes: plan.input.deletes }),
	};
}

/**
 * Add the supplied files that the elements actually draw, and say which of
 * them the document did not already have.
 * @param content The working copy, whose file map is extended.
 * @param plan What this mutation is.
 * @returns The files that were new.
 */
function mergeAddedFiles<T>(content: BoardContent, plan: ElementMutationPlan<T>): ExcalidrawFile[] {
	const addedFiles = plan.addFiles
		? usableDrawnFiles(content.elements.values(), plan.addFiles).filter(
				(file) => content.files.get(file.id) !== file,
			)
		: [];
	for (const file of addedFiles) {
		content.files.set(file.id, file);
	}
	return addedFiles;
}

/**
 * Whether this mutation actually moved anything.
 * @param applied What the converter did.
 * @param addedFiles The files this write brought with it.
 * @param plan What this mutation is.
 * @returns True when something changed.
 */
function changedAnything<T>(
	applied: AppliedElementInput,
	addedFiles: readonly ExcalidrawFile[],
	plan: ElementMutationPlan<T>,
): boolean {
	return (
		applied.created.length > 0 ||
		applied.updated.length > 0 ||
		applied.deleted.length > 0 ||
		addedFiles.length > 0 ||
		plan.replaceScene !== undefined
	);
}

/**
 * The fields that mark a mutation as a pane's change report.
 *
 * Present only when the caller said whether its input was the whole scene: an
 * empty delta does not write, while a full report must replace the held copy
 * even when it is empty.
 * @param plan What this mutation is.
 * @param changed Whether anything moved.
 * @returns The fields, or nothing when this is not a pane report.
 */
function paneReportFields<T>(
	plan: ElementMutationPlan<T>,
	changed: boolean,
): Pick<BoardMutationResult<T>, "write" | "wholeScene"> {
	return plan.wholeScene === undefined
		? {}
		: { write: plan.wholeScene || changed, wholeScene: plan.wholeScene };
}

/**
 * Build an element mutation without giving a route direct access to the
 * converter. applyElementInput remains one stage inside writeBoard.
 * @param prepare What the route wants done, given the document it will act on.
 * @returns The mutation the write boundary runs.
 */
function elementMutation<T>(
	prepare: (content: BoardContent) => ElementMutationPlan<T>,
): BoardMutation<T> {
	return (content) => {
		const plan = prepare(content);
		clearForReplacement(content, plan);
		const applied = applyElementInput(content.elements, inputFor(plan));
		const addedFiles = mergeAddedFiles(content, plan);
		return {
			value: plan.value(applied, content),
			delta: {
				created: applied.created,
				updated: applied.updated,
				deleted: applied.deleted,
				...(addedFiles.length > 0 ? { filesAdded: addedFiles } : {}),
			},
			...(plan.replaceScene ? { replacementFiles: plan.replaceScene.files } : {}),
			requestedElements: applied.requested,
			...paneReportFields(plan, changedAnything(applied, addedFiles, plan)),
		};
	};
}

export { elementMutation };
