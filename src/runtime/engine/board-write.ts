// The write-boundary middleware owns the lease and version precondition (ADR
// 0016). This module runs synchronously inside that lease: it reads the source
// note, validates and applies the whole mutation to an isolated copy, writes
// the destination through board-io, records the change feed, tells the panes,
// and shapes the HTTP answer. There is deliberately no await between the read
// and the write (ADR 0015).
import { isDeepStrictEqual } from "node:util";

import { type ExcalidrawFile, type ServerElement } from "@/runtime/engine/types";
import {
	type AppliedElementInput,
	applyElementInput,
	type ElementInputRequest,
} from "@/runtime/engine/apply-element-input";
import {
	beginHold,
	holdMessage,
	holdWrite,
	isHeld,
	releaseHold as releaseNoteHold,
	reportHold,
	writesBoardNote,
} from "@/runtime/engine/board-hold";
import { releaseHold as releaseBoardLock, type LockHolder } from "@/runtime/engine/board-lock";
import {
	boardFilesMessage,
	type BoardContent,
	BoardWriteConflictError,
	readBoardContent,
	renderContent,
	settleBoardContent,
	writeBoardContent,
} from "@/runtime/engine/board-io";
import { type BoardState, copyElements, recordBaseline } from "@/runtime/engine/board-store";
import { hashBoardBytes } from "@/runtime/engine/board";
import { type ChangeOrigin, changeFeed } from "@/runtime/engine/change-feed";
import {
	presentElements,
	stripBindingPresentationLinks,
	type PresentationContext,
} from "@/runtime/engine/presentation";
import { usableDrawnFiles } from "@/runtime/engine/embedded-files";
import logger from "@/runtime/engine/logger";
import { EMPTY_CHECKOUT_SNAPSHOT, type CheckoutSnapshot } from "@/runtime/code-target";
import {
	notificationDelta,
	tellPanesAboutWrite,
	tellPanesBestEffort,
	type TellPanes,
} from "@/runtime/engine/lib/board-write-notifications";

type WrittenNote = ReturnType<typeof writeBoardContent>;

interface BoardWriteTarget {
	key: string;
	board: BoardState;
}

interface BoardWriteDelta {
	created: ServerElement[];
	updated: ServerElement[];
	deleted: string[];
	filesAdded?: ExcalidrawFile[];
	filesDeleted?: string[];
	filesReplaced?: ExcalidrawFile[];
}

interface BoardMutationResult<T> {
	value: T;
	delta?: Partial<BoardWriteDelta>;
	/** A pane-intended document captured before input repair/settlement. */
	requestedElements?: ServerElement[];
	/** A valid no-op does not write, notify panes, or advance the feed. */
	write?: boolean;
	/** A pane supplied its whole scene rather than a delta. */
	wholeScene?: boolean;
	/** Supplied file candidates whose exact membership follows canonical settlement. */
	replacementFiles?: readonly unknown[];
}

type BoardMutation<T> = (
	content: BoardContent,
	destinationBefore: BoardContent,
) => BoardMutationResult<T>;

interface ElementMutationPlan<T> {
	input: ElementInputRequest;
	/** Embedded-file candidates produced with these elements, merged in the same note write. */
	addFiles?: readonly unknown[];
	/** Replace the complete scene, including embedded-file membership. */
	replaceScene?: { files: readonly unknown[] };
	/** Present for a pane change report; true means its input is the whole scene. */
	wholeScene?: boolean;
	value: (applied: AppliedElementInput, content: BoardContent) => T;
}

const SCENE_REPLACEMENT_MARKER = "replace-scene" as const;

interface BoardWriteAnswerContext<T> {
	source: BoardWriteTarget;
	target: BoardWriteTarget;
	content: BoardContent;
	/** The request-local document after input conversion and before canonical settlement. */
	submittedElements: ServerElement[];
	value: T;
	delta: BoardWriteDelta;
	written: WrittenNote | null;
	appliedAt: string;
	checkoutSnapshot: CheckoutSnapshot;
}

interface BoardWriteRequest<T> {
	source: BoardWriteTarget;
	origin: ChangeOrigin;
	mutation: BoardMutation<T>;
	/** The exact source lease observed by the write boundary; never inferred from pane state. */
	sourceLockHolder?: LockHolder;
	/** The pane that already has a human change on screen and must skip its echo. */
	clientId?: string | null;
	/** An explicit save writes this target and resolves any hold after persistence. */
	save?: {
		target: BoardWriteTarget;
		force?: boolean;
	};
	afterPersist?: (context: BoardWriteAnswerContext<T>) => void;
	answer: (context: BoardWriteAnswerContext<T>) => Record<string, unknown>;
	checkoutSnapshot?: CheckoutSnapshot;
	/** Exact request-echo targets that can be reused for peer presentation without filesystem work. */
	presentationLinks?: ReadonlyMap<string, PresentationContext>;
}

class BoardMutationError extends Error {
	/**
	 *
	 */
	constructor(
		readonly status: number,
		message: string,
		readonly code?: string,
	) {
		super(message);
		this.name = "BoardMutationError";
	}
}

/**
 *
 */
const completeDelta = (delta?: Partial<BoardWriteDelta>): BoardWriteDelta => ({
	created: delta?.created ?? [],
	updated: delta?.updated ?? [],
	deleted: delta?.deleted ?? [],
	...(delta?.filesAdded ? { filesAdded: delta.filesAdded } : {}),
	...(delta?.filesDeleted ? { filesDeleted: delta.filesDeleted } : {}),
	...(delta?.filesReplaced ? { filesReplaced: delta.filesReplaced } : {}),
});

/**
 *
 */
function copyContent(content: BoardContent): BoardContent {
	return {
		...content,
		elements: new Map(
			copyElements(content.elements.values()).map((element) => [element.id, element]),
		),
		// File records are never mutated during a board write. Copy the map so
		// membership can change without cloning base64 image payloads.
		files: new Map(content.files),
	};
}

/**
 * Build an element mutation without giving a route direct access to the
 * converter. applyElementInput remains one stage inside writeBoard.
 */
function elementMutation<T>(
	prepare: (content: BoardContent) => ElementMutationPlan<T>,
): BoardMutation<T> {
	return (content) => {
		const plan = prepare(content);
		if (plan.wholeScene || plan.replaceScene) {
			content.elements.clear();
		}
		if (plan.replaceScene) {
			content.files.clear();
		}
		const applied = applyElementInput(content.elements, {
			...plan.input,
			...(plan.wholeScene || plan.replaceScene
				? { deletes: [] }
				: plan.input.deletes === undefined
					? {}
					: { deletes: plan.input.deletes }),
		});
		const addedFiles = plan.addFiles
			? usableDrawnFiles(content.elements.values(), plan.addFiles).filter(
					(file) => content.files.get(file.id) !== file,
				)
			: [];
		for (const file of addedFiles) {
			content.files.set(file.id, file);
		}
		const changed =
			applied.created.length > 0 ||
			applied.updated.length > 0 ||
			applied.deleted.length > 0 ||
			addedFiles.length > 0 ||
			plan.replaceScene !== undefined;
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
			// When wholeScene is present this is a pane report. Empty deltas do not
			// write, while a full report must replace the held copy even when empty.
			...(plan.wholeScene === undefined
				? {}
				: { write: plan.wholeScene || changed, wholeScene: plan.wholeScene }),
		};
	};
}

/**
 *
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
 *
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
		const { bytes } = renderContent(target.board.identity, content);
		content.hash = hashBoardBytes(bytes);
		holdWrite(target.key, content, wholeScene);
		recordChange(target, request.origin);
		return null;
	}

	let written: WrittenNote;
	try {
		written = writeBoardContent(target.board, content, {
			...(request.save?.force === undefined ? {} : { force: request.save.force }),
			savedFrom: request.source.key,
		});
	} catch (error) {
		if (error instanceof BoardWriteConflictError && !isHeld(target.key) && !request.save) {
			const hold = beginHold(target.key, error.conflict, readBoardContent(target.board));
			logger.warn(`Board "${target.key}" has stopped saving: ${holdMessage(target.key, hold)}`);
			tellPanesBestEffort(
				tellPanes,
				{ type: "board_hold", hold: reportHold(target.key, hold) },
				target.key,
			);
		}
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
 *
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
	let sourceDocument: Record<string, unknown> = {};
	if (outcome === "elsewhere") {
		// The held document was written to the destination, but panes keep their
		// source address. Carry the source note on the release itself so the pane
		// replaces its scene before clearing pending held reporting.
		const sourceFile = request.source.board.file;
		if (!sourceFile) {
			throw new Error(`Board "${request.source.key}" has no source note to adopt.`);
		}
		const source = readBoardContent(request.source.board);
		if (!source.hash || source.version === undefined) {
			throw new Error(`Board "${request.source.key}" source note has no conflict baseline.`);
		}
		recordBaseline(request.source.board, sourceFile, source.hash, source.version);
		sourceDocument = {
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
	// A successful terminal resolution must not leave the next source writer
	// waiting on a pane callback. Only the authoritative human lease that entered
	// this write may be released; an agent, claim, or replacement holder survives.
	if (request.sourceLockHolder?.kind === "human") {
		releaseBoardLock(request.source.key, request.sourceLockHolder.id);
	}
	tellPanesBestEffort(
		tellPanes,
		{ type: "board_released", hold: report, outcome, ...sourceDocument },
		request.source.key,
	);
}

/**
 * Run one complete board write. Everything before persist works on a fresh
 * copy, so a mutation that throws cannot leave an earlier upsert applied.
 */
function writeBoard<T>(
	request: BoardWriteRequest<T>,
	tellPanes: TellPanes,
): Record<string, unknown> {
	const target = request.save?.target ?? request.source;
	const sourceContent = readBoardContent(request.source.board);
	const destinationBefore =
		target.key === request.source.key ? sourceContent : readBoardContent(target.board);
	const content = copyContent(sourceContent);
	const mutation = request.mutation(content, destinationBefore);
	const delta = completeDelta(mutation.delta);
	const shouldWrite = mutation.write ?? true;
	const appliedAt = new Date().toISOString();
	const checkoutSnapshot = request.checkoutSnapshot ?? EMPTY_CHECKOUT_SNAPSHOT;

	// Element input owns its conversion stage and exposes the pane-intended
	// document from immediately before repair. Other mutation kinds retain the
	// already-converted request-local snapshot used by their answer shapers.
	const submittedElements = mutation.requestedElements ?? copyElements(content.elements.values());

	// Final settlement belongs to board-io. Run it for every request, including
	// a valid no-op, before this document can enter a hold or success answer.
	settleBoardContent(content);
	if (mutation.replacementFiles) {
		const files = usableDrawnFiles(content.elements.values(), mutation.replacementFiles);
		content.files = new Map(files.map((file) => [file.id, file]));
		delta.filesReplaced = files;
	}

	let written: WrittenNote | null = null;
	if (shouldWrite) {
		written = persist(request, target, content, mutation.wholeScene === true, tellPanes);
	}

	const context: BoardWriteAnswerContext<T> = {
		source: request.source,
		target,
		content,
		submittedElements,
		value: mutation.value,
		delta,
		written,
		appliedAt,
		checkoutSnapshot,
	};

	if (shouldWrite) {
		request.afterPersist?.(context);
		if (written) {
			releaseSavedHold(request, target, tellPanes);
		}
		// The mutation delta describes what the caller named. Panes need every
		// canonical side effect of the persisted document as well: repaired arrow
		// back-references, dependent labels, and deletions outside that input.
		const broadcast = notificationDelta(destinationBefore.elements, content.elements, delta);
		tellPanesAboutWrite(
			tellPanes,
			target,
			broadcast,
			request.clientId ?? null,
			appliedAt,
			checkoutSnapshot,
			request.presentationLinks,
			// The note after this write, which is what every pane states next; while
			// the board is held the note has not moved and the loaded version stands.
			content.version ?? null,
		);
	}

	return request.answer(context);
}

interface CanonicalCorrections {
	upserts: ServerElement[];
	deletes: string[];
}

/**
 * What canonical settlement changed after the pane's input had been applied.
 *
 * Compare the two complete documents in their outbound presentation form. The
 * persisted board remains portable, while a derived machine-local code link is
 * an intentional browser overlay and must not appear as a correction on every
 * drag. A renamed id naturally becomes one delete and one upsert.
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

/** A persisted human report gets a compact canonical acknowledgement. */
function humanWriteAnswer(
	context: BoardWriteAnswerContext<unknown>,
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

/** What an agent gets after a write, small unless it asked for the document. */
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

/**
 *
 */
function boardFingerprint(
	board: BoardState,
	content: BoardContent,
	written?: WrittenNote | null,
): { elements: number; note: string; version: number | null } {
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
