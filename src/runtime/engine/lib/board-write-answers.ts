// What a write says back.
//
// A human's pane and an agent hear different things. A pane already has its
// own edit on screen and needs to know only where the note disagreed with it,
// so it gets corrections plus a fingerprint to state on its next write. An
// agent has no scene at all, so it gets the elements it touched, and the whole
// document only when it asked.

import { isDeepStrictEqual } from "node:util";

import { hashBoardBytes } from "@/runtime/engine/board";
import { type BoardContent, renderContent } from "@/runtime/engine/board-io";
import type { writeBoardContent } from "@/runtime/engine/board-io";
import { type BoardState } from "@/runtime/engine/board-store";
import { presentElements } from "@/runtime/engine/presentation";
import type { ServerElement } from "@/runtime/engine/types";
import { EMPTY_CHECKOUT_SNAPSHOT, type CheckoutSnapshot } from "@/runtime/code-target";

/** What a note written by board-io reports about itself. */
type WrittenNote = ReturnType<typeof writeBoardContent>;

/** Where the note disagreed with what a pane submitted. */
interface CanonicalCorrections {
	upserts: ServerElement[];
	deletes: string[];
}

/** Enough of a board's state to state on the next write. */
interface BoardFingerprint {
	elements: number;
	note: string;
	version: number | null;
}

/**
 * What canonical settlement changed after the pane's input had been applied.
 *
 * Compare the two complete documents in their outbound presentation form. The
 * persisted board remains portable, while a derived machine-local code link is
 * an intentional browser overlay and must not appear as a correction on every
 * drag. A renamed id naturally becomes one delete and one upsert.
 * @param submitted The document the pane sent, after input conversion.
 * @param canonical The document the note now holds.
 * @param boardKey Which board this is, for the presentation overlay.
 * @param checkoutSnapshot What the code links resolve against.
 * @returns The elements to upsert and the ids to delete.
 */
function canonicalCorrections(
	submitted: Iterable<ServerElement>,
	canonical: Iterable<ServerElement>,
	boardKey: string,
	checkoutSnapshot: CheckoutSnapshot = EMPTY_CHECKOUT_SNAPSHOT,
): CanonicalCorrections {
	const before = new Map(
		presentElements(submitted, { boardKey, checkoutSnapshot }).map((element) => [
			element.id,
			element,
		]),
	);
	const after = new Map(
		presentElements(canonical, { boardKey, checkoutSnapshot }).map((element) => [
			element.id,
			element,
		]),
	);
	const deletes = [...before.keys()].filter((id) => !after.has(id));
	const upserts: ServerElement[] = [];
	for (const [id, element] of after) {
		const prior = before.get(id);
		if (!prior || !isDeepStrictEqual(prior, element)) {
			upserts.push(element);
		}
	}
	return { upserts, deletes };
}

/**
 * What a pane states on its next write: the note it last saw, and the version
 * that note was at.
 *
 * Taken from the note when one was written, else from the held document, else
 * measured from the document in hand — a held board has no note to read.
 * @param board The board's state.
 * @param content The document after this write.
 * @param written What board-io wrote, when it wrote.
 * @returns The fingerprint.
 */
function boardFingerprint(
	board: BoardState,
	content: BoardContent,
	written?: WrittenNote | null,
): BoardFingerprint {
	if (written) {
		return { elements: content.elements.size, note: written.hash, version: written.version };
	}
	if (content.hash) {
		return {
			elements: content.elements.size,
			note: content.hash,
			version: content.version ?? null,
		};
	}
	const { bytes } = renderContent(board.identity, content);
	return {
		elements: content.elements.size,
		note: hashBoardBytes(bytes),
		version: content.version ?? null,
	};
}

/** Everything a human's answer is shaped from. */
interface HumanAnswerContext {
	source: { key: string; board: BoardState };
	content: BoardContent;
	submittedElements: ServerElement[];
	written: WrittenNote | null;
	checkoutSnapshot: CheckoutSnapshot;
}

/**
 * A persisted human report gets a compact canonical acknowledgement.
 * @param context What the write ended up with.
 * @param wantsFullDocument Whether the pane asked for the whole scene back.
 * @returns The answer body.
 */
function humanWriteAnswer(
	context: HumanAnswerContext,
	wantsFullDocument: boolean,
): Record<string, unknown> {
	const { source, content, submittedElements, written, checkoutSnapshot } = context;
	return {
		corrections: canonicalCorrections(
			submittedElements,
			content.elements.values(),
			source.key,
			checkoutSnapshot,
		),
		fingerprint: boardFingerprint(source.board, content, written),
		...(wantsFullDocument
			? {
					document: presentElements(content.elements.values(), {
						boardKey: source.key,
						checkoutSnapshot,
					}),
				}
			: {}),
	};
}

/**
 * What an agent gets after a write, small unless it asked for the document.
 * @param boardKey Which board this is.
 * @param board The board's state.
 * @param content The document after this write.
 * @param touched The elements the write named.
 * @param wantsDocument Whether the caller asked for the whole scene back.
 * @param written What board-io wrote, when it wrote.
 * @param checkoutSnapshot What the code links resolve against.
 * @returns The answer body.
 */
function agentWriteAnswer(
	boardKey: string,
	board: BoardState,
	content: BoardContent,
	touched: ServerElement[],
	wantsDocument: boolean,
	written?: WrittenNote | null,
	checkoutSnapshot: CheckoutSnapshot = EMPTY_CHECKOUT_SNAPSHOT,
): Record<string, unknown> {
	return {
		elements: presentElements(touched, { boardKey, checkoutSnapshot }),
		fingerprint: boardFingerprint(board, content, written),
		...(wantsDocument
			? { document: presentElements(content.elements.values(), { boardKey, checkoutSnapshot }) }
			: {}),
	};
}

export {
	type BoardFingerprint,
	type CanonicalCorrections,
	agentWriteAnswer,
	boardFingerprint,
	canonicalCorrections,
	humanWriteAnswer,
};
