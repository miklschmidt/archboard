import {
	addressedVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "#shared/schemas/board-document.ts";
import type { HistoricalCorrectionInput } from "#shared/protocol/historical-correction.ts";
import { editsVariant, restated } from "#runtime/operations/edit/scope.ts";
import { refuse, type SemanticRefusal } from "#runtime/operations/write/outcome.ts";
import { restoredContent, type SemanticTransition } from "#runtime/operations/write/transitions.ts";

/**
 * The historical variant a correction names, when the correction changes it.
 * @param board The board as it stands.
 * @param wanted The variant's id or name.
 * @param changesVariant Whether the correction states a change to the variant.
 * @returns The variant, or why it cannot be corrected.
 */
function correctableVariant(
	board: SemanticBoard,
	wanted: string,
	changesVariant: boolean,
): { readonly ok: true; readonly variant: SemanticVariant } | SemanticRefusal {
	const found = addressedVariant(board, wanted);
	if (!found.ok) return refuse("UNKNOWN_VARIANT", found.problem);
	const { variant } = found;
	if (variant.lifecycle !== "historical") {
		return refuse(
			"VARIANT_NOT_HISTORICAL",
			`"${variant.name}" is not historical; use an ordinary edit for an editable state.`,
		);
	}
	if (!changesVariant) {
		return refuse(
			"NOTHING_TO_CORRECT",
			`The correction states no change to "${variant.name}". State the content, summary or documents it repairs.`,
		);
	}
	return { ok: true, variant };
}

/**
 * Correct a historical description without replaying an architectural change into its descendants.
 * @param input The correction and its immutable evidence, verified by the caller.
 * @returns A pure candidate transition; the normal write boundary validates and commits it.
 */
function correctHistoricalTransition(input: HistoricalCorrectionInput): SemanticTransition {
	return {
		summary: "correct a historical architecture",
		changesExistingBoard: true,
		/**
		 * Build only the corrected historical reading.
		 * @param before The board as it stands.
		 * @param at The correction timestamp.
		 * @returns The candidate board, or a refusal.
		 */
		apply: (before, at) => {
			if (before === null) return refuse("BOARD_MISSING", "there is no such board in the vault");
			const edit = { ...input.edit, views: [], removeViews: [] };
			const found = correctableVariant(before, input.variant, editsVariant(edit));
			if (!found.ok) return found;
			const { variant } = found;
			const content = restoredContent(before, variant, edit);
			if (!content.ok) return content;
			const corrected = {
				...variant,
				content: content.content,
				corrections: [
					...(variant.corrections ?? []),
					{ at, reason: input.reason, revisions: input.revisions },
				],
			};
			return {
				ok: true,
				board: {
					...before,
					updatedAt: at,
					variants: restated(
						before.variants.map((one) => (one.id === variant.id ? corrected : one)),
						variant.id,
						edit,
					),
				},
				notices: content.notices,
			};
		},
	};
}
export { correctHistoricalTransition };
