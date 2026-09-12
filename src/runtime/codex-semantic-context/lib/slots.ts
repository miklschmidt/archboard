// The text fields of a brief that can be shortened, and how to put them back.
//
// Two tables, in the order room is bought back for them. The identities come
// first: a brief that cannot say which board, pane or thread it is about is not
// usable at all. The prose comes last, after the lists, because a description
// can be thousands of bytes and the selection is what the question is usually
// about — refilling text first would spend the whole budget on prose and hand
// an agent an empty selection, which is indistinguishable from nobody having
// selected anything.
//
// Apart from `fit.ts` because the two tables are most of a file on their own
// and the fitting algorithm reads better without them in the middle of it.

import { SEMANTIC_CONTEXT_ELLIPSIS } from "@/runtime/codex-semantic-context/lib/limits";
import type { BriefContext, FitParts, TextSlot } from "@/runtime/codex-semantic-context/lib/fit";

/**
 * A trimmed identity as it appears in a brief. A brief is display text under a byte ceiling: an
 * identity that does not fit is replaced by an ellipsis, which is not an issued identity. The
 * brief keeps the field's own type so a reader can still see which identity was trimmed away.
 * @param original - The identity being trimmed, which fixes the field's type.
 * @param trimmed - The trimmed text, or null when the field is absent.
 * @returns The trimmed text, in the field's identity type.
 */
function trimmedIdentity<Identity extends string>(
	original: Identity | null,
	trimmed: string | null,
): Identity | null {
	// The original is read only for its type: it is what says which identity is being trimmed.
	void original;
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a trimmed identity is display text, not an issued identity; nothing reads a brief's identity fields as identities, and the ellipsis is what makes the trimming visible
	return trimmed as Identity | null;
}

/**
 * The text fields that say which thing this is, and how to put them back.
 *
 * Identities first, because a brief that cannot say which board, pane or thread
 * it is about is not usable at all. The prose comes later, after the lists.
 * @param context - The context being fitted.
 * @returns The slots, in the order room is given back to them.
 */
function textSlots(context: BriefContext): readonly TextSlot[] {
	return [
		{
			original: context.repository,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed repository back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.repository = value ?? SEMANTIC_CONTEXT_ELLIPSIS;
			},
		},
		{
			original: context.board.key,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed board.key back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.board = { ...context.board, key: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
		{
			original: context.child.id,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed child.id back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.child = { ...context.child, id: trimmedIdentity(context.child.id, value) };
			},
		},
		{
			original: context.child.epoch,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed child.epoch back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.child = {
					...context.child,
					epoch: trimmedIdentity(context.child.epoch, value),
				};
			},
		},
		{
			original: context.workhorse.threadId,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed workhorse.threadId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.workhorse = {
					...context.workhorse,
					threadId: trimmedIdentity(context.workhorse.threadId, value),
				};
			},
		},
		{
			original: context.workhorse.turnId,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed workhorse.turnId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.workhorse = {
					...context.workhorse,
					turnId: trimmedIdentity(context.workhorse.turnId, value),
				};
			},
		},
		{
			original: context.coordinator.threadId,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed coordinator.threadId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.coordinator = {
					...context.coordinator,
					threadId: trimmedIdentity(context.coordinator.threadId, value),
				};
			},
		},
		{
			original: context.coordinator.realtimeSessionId,
			empty: null,
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed coordinator.realtimeSessionId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.coordinator = {
					...context.coordinator,
					realtimeSessionId: trimmedIdentity(context.coordinator.realtimeSessionId, value),
				};
			},
		},
		{
			original: context.board.name,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed board.name back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.board = { ...context.board, name: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
		{
			original: context.board.file,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed board.file back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.board = { ...context.board, file: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
		{
			original: context.architecture.variant?.name ?? null,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed variant name back into the brief's context.
			 * @param value - The trimmed text, or null when there is no variant.
			 */
			set: (value) => {
				const variant = context.architecture.variant;
				if (variant !== null) {
					context.architecture.variant = { ...variant, name: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
				}
			},
		},
		{
			original: context.architecture.view?.name ?? null,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed view name back into the brief's context.
			 * @param value - The trimmed text, or null when the variant is read whole.
			 */
			set: (value) => {
				const view = context.architecture.view;
				if (view !== null) {
					context.architecture.view = { ...view, name: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
				}
			},
		},
		{
			original: context.pane.paneId,
			empty: "",
			minimum: SEMANTIC_CONTEXT_ELLIPSIS,
			/**
			 * Install the trimmed pane.paneId back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.pane = { ...context.pane, paneId: value ?? SEMANTIC_CONTEXT_ELLIPSIS };
			},
		},
	];
}

/**
 * The text fields that describe rather than identify.
 *
 * Bought back after the lists, not before them. A description can be thousands
 * of bytes and the selection is what the question is usually about, so refilling
 * text first would spend the whole budget on prose and hand an agent an empty
 * selection that is indistinguishable from nobody having selected anything.
 * @param context - The context being fitted.
 * @param parts - The parts being fitted.
 * @returns The slots, in the order room is given back to them.
 */
function descriptiveSlots(context: BriefContext, parts: FitParts): readonly TextSlot[] {
	return [
		{
			original: parts.description,
			empty: "",
			minimum: "",
			/**
			 * Install the trimmed original: parts.description back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				parts.description = value ?? "";
			},
		},
		{
			original: context.doing,
			empty: null,
			minimum: null,
			/**
			 * Install the trimmed doing back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.doing = value;
			},
		},
		{
			original: context.claim.doing,
			empty: null,
			minimum: null,
			/**
			 * Install the trimmed claim.doing back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.claim = { ...context.claim, doing: value };
			},
		},
		{
			original: context.threadLink.reason,
			empty: null,
			minimum: null,
			/**
			 * Install the trimmed threadLink.reason back into the brief's context.
			 * @param value - The trimmed text, or null when the field is dropped entirely.
			 */
			set: (value) => {
				context.threadLink = { ...context.threadLink, reason: value };
			},
		},
	];
}

export { descriptiveSlots, textSlots };
