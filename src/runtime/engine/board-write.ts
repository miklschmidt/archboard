// The write-boundary middleware owns the lease and version precondition (ADR
// 0016). This module runs synchronously inside that lease: it reads the source
// note, validates and applies the whole mutation to an isolated copy, writes
// the destination through board-io, records the change feed, tells the panes,
// and shapes the HTTP answer. There is deliberately no await between the read
// and the write (ADR 0015).
import { type ServerElement } from "@/runtime/engine/types";
import {
	beginHold,
	holdMessage,
	holdWrite,
	isHeld,
	releaseHold as releaseNoteHold,
	reportHold,
	writesBoardNote,
} from "@/runtime/engine/board-hold";
import { releaseHold as releaseBoardLock } from "@/runtime/engine/board-lock";
import {
	boardFilesMessage,
	type BoardContent,
	BoardWriteConflictError,
	readBoardContent,
	renderContent,
	settleBoardContent,
	writeBoardContent,
} from "@/runtime/engine/board-io";
import { copyElements, recordBaseline } from "@/runtime/engine/board-store";
import { hashBoardBytes } from "@/runtime/engine/board";
import { type ChangeOrigin, changeFeed } from "@/runtime/engine/change-feed";
import { presentElements, stripBindingPresentationLinks } from "@/runtime/engine/presentation";
import { usableDrawnFiles } from "@/runtime/engine/embedded-files";
import { logger } from "@/runtime/engine/logger";
import { EMPTY_CHECKOUT_SNAPSHOT, type CheckoutSnapshot } from "@/runtime/code-target";
import {
	notificationDelta,
	tellPanesAboutWrite,
	tellPanesBestEffort,
	type TellPanes,
} from "@/runtime/engine/lib/board-write-notifications";
import type { CanonicalCorrections } from "@/runtime/engine/lib/board-write-answers";
import {
	agentWriteAnswer,
	canonicalCorrections,
	humanWriteAnswer,
} from "@/runtime/engine/lib/board-write-answers";
import type {
	BoardMutation,
	BoardMutationResult,
	BoardWriteAnswerContext,
	BoardWriteDelta,
	BoardWriteRequest,
	BoardWriteTarget,
	ElementMutationPlan,
	WrittenNote,
} from "@/runtime/engine/lib/board-write-contract";
import {
	BoardMutationError,
	SCENE_REPLACEMENT_MARKER,
	completeDelta,
	copyContent,
} from "@/runtime/engine/lib/board-write-contract";
import { elementMutation } from "@/runtime/engine/lib/board-write-mutation";

/**
 * Advance the change feed to what the board now holds.
 * @param target The board that was written.
 * @param origin Who wrote it.
 */
function recordChange(target: BoardWriteTarget, origin: ChangeOrigin): void {
	changeFeed.record(
		target.key,
		target.board.identity,
		() => Array.from(readBoardContent(target.board).elements.values()),
		origin,
	);
}

/**
 * Keep a write the note cannot take yet, in memory and reported as held.
 * @param request The write in progress.
 * @param target The board being written.
 * @param content The settled document.
 * @param wholeScene Whether the writer restated the whole scene.
 * @returns Null, because no note was written.
 */
function holdInsteadOfWriting<T>(
	request: BoardWriteRequest<T>,
	target: BoardWriteTarget,
	content: BoardContent,
	wholeScene: boolean,
): null {
	const { bytes } = renderContent(target.board.identity, content);
	content.hash = hashBoardBytes(bytes);
	holdWrite(target.key, content, wholeScene);
	recordChange(target, request.origin);
	return null;
}

/**
 * How board-io is asked to write: forced only where the caller said so, and
 * always naming the board this document came from.
 * @param request The write in progress.
 * @returns The write options.
 */
function writeOptionsFor<T>(request: BoardWriteRequest<T>): {
	force?: boolean;
	savedFrom: string;
} {
	return {
		...(request.save?.force === undefined ? {} : { force: request.save.force }),
		savedFrom: request.source.key,
	};
}

/**
 * Stop saving this board, when the note has moved under us and nobody has
 * already noticed.
 *
 * An explicit save is exempt: it is the caller's own decision about which note
 * wins, so its conflict belongs to the caller rather than to a hold.
 * @param request The write in progress.
 * @param target The board being written.
 * @param error What board-io threw.
 * @param tellPanes How to reach the panes.
 */
function beginHoldOnConflict<T>(
	request: BoardWriteRequest<T>,
	target: BoardWriteTarget,
	error: unknown,
	tellPanes: TellPanes,
): void {
	if (!(error instanceof BoardWriteConflictError) || isHeld(target.key) || request.save) {
		return;
	}
	const hold = beginHold(target.key, error.conflict, readBoardContent(target.board));
	logger.warn(`Board "${target.key}" has stopped saving: ${holdMessage(target.key, hold)}`);
	tellPanesBestEffort(
		tellPanes,
		{ type: "board_hold", hold: reportHold(target.key, hold) },
		target.key,
	);
}

/**
 * Put the settled document where it belongs: the note, or the hold when this
 * board is not saving.
 * @param request The write in progress.
 * @param target The board being written.
 * @param content The settled document.
 * @param wholeScene Whether the writer restated the whole scene.
 * @param tellPanes How to reach the panes.
 * @returns What was written, or null when the write was held.
 * @throws {BoardWriteConflictError} When the note moved under this write.
 */
function persist<T>(
	request: BoardWriteRequest<T>,
	target: BoardWriteTarget,
	content: BoardContent,
	wholeScene: boolean,
	tellPanes: TellPanes,
): WrittenNote | null {
	// The write boundary owns the canonical document, including held writes
	// that cannot reach their note yet. A browser may have returned the derived
	// link it was shown; keep only the portable binding in live state.
	const portable = stripBindingPresentationLinks(content.elements.values(), {
		boardKey: target.key,
	});
	content.elements = new Map(portable.map((element) => [element.id, element]));
	settleBoardContent(content);

	if (!request.save && !writesBoardNote(target.key)) {
		return holdInsteadOfWriting(request, target, content, wholeScene);
	}

	let written: WrittenNote;
	try {
		written = writeBoardContent(target.board, content, writeOptionsFor(request));
	} catch (error) {
		beginHoldOnConflict(request, target, error, tellPanes);
		throw error;
	}

	target.board.savedAt = new Date().toISOString();
	content.note = written.note;
	content.hash = written.hash;
	content.version = written.version;
	recordChange(target, request.origin);
	return written;
}

/**
 * The source note a pane must adopt when its held document was saved
 * elsewhere.
 *
 * The held document went to the destination, but panes keep their source
 * address. Carrying the source note on the release itself lets a pane replace
 * its scene before it clears pending held reporting.
 * @param request The write in progress.
 * @returns The fields to send with the release.
 * @throws {Error} When the source note cannot supply a conflict baseline.
 */
function adoptedSourceDocument<T>(request: BoardWriteRequest<T>): Record<string, unknown> {
	const sourceFile = request.source.board.file;
	if (!sourceFile) {
		throw new Error(`Board "${request.source.key}" has no source note to adopt.`);
	}
	const source = readBoardContent(request.source.board);
	if (!source.hash || source.version === undefined) {
		throw new Error(`Board "${request.source.key}" source note has no conflict baseline.`);
	}
	recordBaseline(request.source.board, sourceFile, source.hash, source.version);
	return {
		identity: request.source.board.identity,
		elements: presentElements(source.elements.values(), {
			boardKey: request.source.key,
			checkoutSnapshot: request.checkoutSnapshot ?? EMPTY_CHECKOUT_SNAPSHOT,
		}),
		// A pane replacing its scene with the source note states this version
		// on its next write (ADR 0022).
		version: source.version,
		...boardFilesMessage(source),
	};
}

/**
 * Let go of the lease this write came in on.
 *
 * A successful terminal resolution must not leave the next source writer
 * waiting on a pane callback. Only the authoritative human lease that entered
 * this write may be released; an agent, claim, or replacement holder survives.
 * @param request The write in progress.
 */
function releaseHumanLease<T>(request: BoardWriteRequest<T>): void {
	if (request.sourceLockHolder?.kind === "human") {
		releaseBoardLock(request.source.key, request.sourceLockHolder.id);
	}
}

/**
 * Report that a held board is saving again, once an explicit save has
 * persisted its document.
 * @param request The write in progress.
 * @param target The board that was written.
 * @param tellPanes How to reach the panes.
 */
function releaseSavedHold<T>(
	request: BoardWriteRequest<T>,
	target: BoardWriteTarget,
	tellPanes: TellPanes,
): void {
	if (!request.save) {
		return;
	}
	const hold = releaseNoteHold(request.source.key);
	if (!hold) {
		return;
	}
	const outcome = target.key === request.source.key ? "overwrite" : "elsewhere";
	const report = reportHold(request.source.key, hold);
	logger.info(
		`Board "${request.source.key}" is saving again (${outcome}), after ${hold.writes} held change(s).`,
	);
	const sourceDocument = outcome === "elsewhere" ? adoptedSourceDocument(request) : {};
	releaseHumanLease(request);
	tellPanesBestEffort(
		tellPanes,
		{ type: "board_released", hold: report, outcome, ...sourceDocument },
		request.source.key,
	);
}

/** One write, worked out in full before anything is persisted. */
interface WritePlan<T> {
	target: BoardWriteTarget;
	/** The destination as it stood before this write, for the pane broadcast. */
	destinationBefore: BoardContent;
	content: BoardContent;
	mutation: BoardMutationResult<T>;
	delta: BoardWriteDelta;
	shouldWrite: boolean;
	submittedElements: ServerElement[];
	appliedAt: string;
	checkoutSnapshot: CheckoutSnapshot;
}

/**
 * Which board this write lands on: the one an explicit save named, else the
 * one it came in on.
 * @param request The write in progress.
 * @returns The target.
 */
function writeTargetOf<T>(request: BoardWriteRequest<T>): BoardWriteTarget {
	return request.save?.target ?? request.source;
}

/**
 * Replace the document's file membership, where the mutation restated it.
 * @param content The settled document.
 * @param mutation What the mutation reported.
 * @param delta The delta to record the replacement on.
 */
function applyReplacementFiles<T>(
	content: BoardContent,
	mutation: BoardMutationResult<T>,
	delta: BoardWriteDelta,
): void {
	if (!mutation.replacementFiles) {
		return;
	}
	const files = usableDrawnFiles(content.elements.values(), mutation.replacementFiles);
	content.files = new Map(files.map((file) => [file.id, file]));
	delta.filesReplaced = files;
}

/**
 * Run the mutation and settle the result, all on an isolated copy, so that
 * nothing is persisted until the whole write is known to have worked.
 * @param request The write in progress.
 * @returns Everything the write needs from here on.
 */
function planWrite<T>(request: BoardWriteRequest<T>): WritePlan<T> {
	const target = writeTargetOf(request);
	const sourceContent = readBoardContent(request.source.board);
	const destinationBefore =
		target.key === request.source.key ? sourceContent : readBoardContent(target.board);
	const content = copyContent(sourceContent);
	const mutation = request.mutation(content, destinationBefore);
	const delta = completeDelta(mutation.delta);
	const shouldWrite = mutation.write ?? true;
	const appliedAt = new Date().toISOString();

	// Element input owns its conversion stage and exposes the pane-intended
	// document from immediately before repair. Other mutation kinds retain the
	// already-converted request-local snapshot used by their answer shapers.
	const submittedElements = mutation.requestedElements ?? copyElements(content.elements.values());

	// Final settlement belongs to board-io. Run it for every request, including
	// a valid no-op, before this document can enter a hold or success answer.
	settleBoardContent(content);
	applyReplacementFiles(content, mutation, delta);

	return {
		target,
		destinationBefore,
		content,
		mutation,
		delta,
		shouldWrite,
		submittedElements,
		appliedAt,
		checkoutSnapshot: request.checkoutSnapshot ?? EMPTY_CHECKOUT_SNAPSHOT,
	};
}

/**
 * Everything that happens once the write has landed: the caller's own
 * follow-up, the hold release, and the pane broadcast.
 * @param request The write in progress.
 * @param plan What the write worked out.
 * @param context What the answer will be shaped from.
 * @param tellPanes How to reach the panes.
 */
function afterWrite<T>(
	request: BoardWriteRequest<T>,
	plan: WritePlan<T>,
	context: BoardWriteAnswerContext<T>,
	tellPanes: TellPanes,
): void {
	request.afterPersist?.(context);
	if (context.written) {
		releaseSavedHold(request, plan.target, tellPanes);
	}
	// The mutation delta describes what the caller named. Panes need every
	// canonical side effect of the persisted document as well: repaired arrow
	// back-references, dependent labels, and deletions outside that input.
	const broadcast = notificationDelta(
		plan.destinationBefore.elements,
		plan.content.elements,
		plan.delta,
	);
	tellPanesAboutWrite(
		tellPanes,
		plan.target,
		broadcast,
		request.clientId ?? null,
		plan.appliedAt,
		plan.checkoutSnapshot,
		request.presentationLinks,
		// The note after this write, which is what every pane states next; while
		// the board is held the note has not moved and the loaded version stands.
		plan.content.version ?? null,
	);
}

/**
 * Run one complete board write. Everything before persist works on a fresh
 * copy, so a mutation that throws cannot leave an earlier upsert applied.
 * @param request What to write, and how to answer.
 * @param tellPanes How to reach the panes.
 * @returns The answer body for the route.
 */
function writeBoard<T>(
	request: BoardWriteRequest<T>,
	tellPanes: TellPanes,
): Record<string, unknown> {
	const plan = planWrite(request);
	const written = plan.shouldWrite
		? persist(request, plan.target, plan.content, plan.mutation.wholeScene === true, tellPanes)
		: null;

	const context: BoardWriteAnswerContext<T> = {
		source: request.source,
		target: plan.target,
		content: plan.content,
		submittedElements: plan.submittedElements,
		value: plan.mutation.value,
		delta: plan.delta,
		written,
		appliedAt: plan.appliedAt,
		checkoutSnapshot: plan.checkoutSnapshot,
	};

	if (plan.shouldWrite) {
		afterWrite(request, plan, context, tellPanes);
	}

	return request.answer(context);
}

export {
	type WrittenNote,
	type BoardWriteTarget,
	type BoardWriteDelta,
	type BoardMutationResult,
	type BoardMutation,
	type ElementMutationPlan,
	SCENE_REPLACEMENT_MARKER,
	type BoardWriteAnswerContext,
	type BoardWriteRequest,
	BoardMutationError,
	elementMutation,
	writeBoard,
	type CanonicalCorrections,
	canonicalCorrections,
	humanWriteAnswer,
	agentWriteAnswer,
	type TellPanes,
};
