// One request-local path from a board note to the next board note.
//
// The write-boundary middleware owns the lease and version precondition (ADR
// 0016). This module runs synchronously inside that lease: it reads the source
// note, validates and applies the whole mutation to an isolated copy, writes
// the destination through board-io, records the change feed, tells the panes,
// and shapes the HTTP answer. There is deliberately no await between the read
// and the write (ADR 0015).

import { isDeepStrictEqual } from "node:util";

import {
	type ExcalidrawFile,
	type ElementsChangedMessage,
	type ServerElement,
	type WebSocketMessage,
} from "./types.js";
import {
	type AppliedElementInput,
	applyElementInput,
	type ElementInputRequest,
} from "./apply-element-input.js";
import {
	beginHold,
	holdMessage,
	holdWrite,
	isHeld,
	releaseHold,
	reportHold,
	writesBoardNote,
} from "./board-hold.js";
import {
	type BoardContent,
	BoardWriteConflictError,
	readBoardContent,
	renderContent,
	settleBoardContent,
	writeBoardContent,
} from "./board-io.js";
import { type BoardState, copyElements } from "./board-store.js";
import { hashBoardBytes } from "./board.js";
import { type ChangeOrigin, changeFeed } from "./change-feed.js";
import { presentElements, stripBindingPresentationLinks } from "./presentation.js";
import { usableDrawnFiles } from "./embedded-files.js";
import logger from "./logger.js";

export type WrittenNote = ReturnType<typeof writeBoardContent>;

export interface BoardWriteTarget {
	key: string;
	board: BoardState;
}

export interface BoardWriteDelta {
	created: ServerElement[];
	updated: ServerElement[];
	deleted: string[];
	filesAdded?: ExcalidrawFile[];
	filesDeleted?: string[];
	filesReplaced?: ExcalidrawFile[];
}

export interface BoardMutationResult<T> {
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

export type BoardMutation<T> = (
	content: BoardContent,
	destinationBefore: BoardContent,
) => BoardMutationResult<T>;

export interface ElementMutationPlan<T> {
	input: ElementInputRequest;
	/** Replace the complete scene, including embedded-file membership. */
	replaceScene?: { files: readonly unknown[] };
	/** Present for a pane change report; true means its input is the whole scene. */
	wholeScene?: boolean;
	value: (applied: AppliedElementInput, content: BoardContent) => T;
}

export const SCENE_REPLACEMENT_MARKER = "replace-scene" as const;

export interface BoardWriteAnswerContext<T> {
	source: BoardWriteTarget;
	target: BoardWriteTarget;
	content: BoardContent;
	/** The request-local document after input conversion and before canonical settlement. */
	submittedElements: ServerElement[];
	value: T;
	delta: BoardWriteDelta;
	written: WrittenNote | null;
	appliedAt: string;
}

export interface BoardWriteRequest<T> {
	source: BoardWriteTarget;
	origin: ChangeOrigin;
	mutation: BoardMutation<T>;
	/** The pane that already has a human change on screen and must skip its echo. */
	clientId?: string | null;
	/** An explicit save writes this target and resolves any hold after persistence. */
	save?: {
		target: BoardWriteTarget;
		force?: boolean;
	};
	afterPersist?: (context: BoardWriteAnswerContext<T>) => void;
	answer: (context: BoardWriteAnswerContext<T>) => Record<string, unknown>;
}

export type TellPanes = (message: WebSocketMessage, board: string) => void;

export class BoardMutationError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code?: string,
	) {
		super(message);
		this.name = "BoardMutationError";
	}
}

const completeDelta = (delta?: Partial<BoardWriteDelta>): BoardWriteDelta => ({
	created: delta?.created ?? [],
	updated: delta?.updated ?? [],
	deleted: delta?.deleted ?? [],
	...(delta?.filesAdded ? { filesAdded: delta.filesAdded } : {}),
	...(delta?.filesDeleted ? { filesDeleted: delta.filesDeleted } : {}),
	...(delta?.filesReplaced ? { filesReplaced: delta.filesReplaced } : {}),
});

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
export function elementMutation<T>(
	prepare: (content: BoardContent) => ElementMutationPlan<T>,
): BoardMutation<T> {
	return (content) => {
		const plan = prepare(content);
		if (plan.wholeScene || plan.replaceScene) content.elements.clear();
		if (plan.replaceScene) content.files.clear();
		const applied = applyElementInput(content.elements, {
			...plan.input,
			deletes: plan.wholeScene || plan.replaceScene ? [] : plan.input.deletes,
		});
		const changed =
			applied.created.length > 0 ||
			applied.updated.length > 0 ||
			applied.deleted.length > 0 ||
			plan.replaceScene !== undefined;
		return {
			value: plan.value(applied, content),
			delta: {
				created: applied.created,
				updated: applied.updated,
				deleted: applied.deleted,
			},
			...(plan.replaceScene ? { replacementFiles: plan.replaceScene.files } : {}),
			requestedElements: applied.requested,
			// When wholeScene is present this is a pane report. Empty deltas do not
			// write, while a full report must replace the held copy even when empty.
			write: plan.wholeScene === undefined ? undefined : plan.wholeScene || changed,
			wholeScene: plan.wholeScene,
		};
	};
}

function recordChange(target: BoardWriteTarget, origin: ChangeOrigin): void {
	changeFeed.record(
		target.key,
		target.board.identity,
		() => Array.from(readBoardContent(target.board).elements.values()),
		origin,
	);
}

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
			force: request.save?.force,
			saveCommand:
				target.key === request.source.key ? "board save" : `board save --as ${target.key}`,
		});
	} catch (error) {
		if (error instanceof BoardWriteConflictError && !isHeld(target.key) && !request.save) {
			const hold = beginHold(target.key, error.conflict, readBoardContent(target.board));
			logger.warn(`Board "${target.key}" has stopped saving: ${holdMessage(target.key, hold)}`);
			tellPanes({ type: "board_hold", hold: reportHold(target.key, hold) }, target.key);
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

function releaseSavedHold<T>(
	request: BoardWriteRequest<T>,
	target: BoardWriteTarget,
	tellPanes: TellPanes,
): void {
	if (!request.save) return;
	const hold = releaseHold(request.source.key);
	if (!hold) return;
	const outcome = target.key === request.source.key ? "overwrite" : "elsewhere";
	const report = reportHold(request.source.key, hold);
	logger.info(
		`Board "${request.source.key}" is saving again (${outcome}), after ${hold.writes} held change(s).`,
	);
	tellPanes(
		{ type: "board_released", hold: report, outcome } as WebSocketMessage,
		request.source.key,
	);
}

function tellPanesAboutWrite(
	tellPanes: TellPanes,
	target: BoardWriteTarget,
	delta: BoardWriteDelta,
	clientId: string | null,
	timestamp: string,
): void {
	const message: ElementsChangedMessage = {
		type: "elements_changed",
		created: presentElements(delta.created, { boardKey: target.key }),
		updated: presentElements(delta.updated, { boardKey: target.key }),
		deleted: delta.deleted,
		origin: clientId,
		timestamp,
	};
	tellPanes(message, target.key);

	if (delta.filesAdded && delta.filesAdded.length > 0) {
		tellPanes({ type: "files_added", files: delta.filesAdded }, target.key);
	}
	if (delta.filesReplaced) {
		tellPanes({ type: "files_replaced", files: delta.filesReplaced }, target.key);
	}
	for (const fileId of delta.filesDeleted ?? []) {
		tellPanes({ type: "file_deleted", fileId }, target.key);
	}
}

function notificationDelta(
	before: ReadonlyMap<string, ServerElement>,
	after: ReadonlyMap<string, ServerElement>,
	files: BoardWriteDelta,
): BoardWriteDelta {
	const created: ServerElement[] = [];
	const updated: ServerElement[] = [];
	for (const [id, element] of after) {
		const existing = before.get(id);
		if (!existing) created.push(element);
		else if (!isDeepStrictEqual(existing, element)) updated.push(element);
	}
	return {
		created,
		updated,
		deleted: [...before.keys()].filter((id) => !after.has(id)),
		...(files.filesAdded ? { filesAdded: files.filesAdded } : {}),
		...(files.filesDeleted ? { filesDeleted: files.filesDeleted } : {}),
		...(files.filesReplaced ? { filesReplaced: files.filesReplaced } : {}),
	};
}

/**
 * Run one complete board write. Everything before persist works on a fresh
 * copy, so a mutation that throws cannot leave an earlier upsert applied.
 */
export function writeBoard<T>(
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
	};

	if (shouldWrite) {
		if (written) releaseSavedHold(request, target, tellPanes);
		request.afterPersist?.(context);
		// The mutation delta describes what the caller named. Panes need every
		// canonical side effect of the persisted document as well: repaired arrow
		// back-references, dependent labels, and deletions outside that input.
		const broadcast = notificationDelta(destinationBefore.elements, content.elements, delta);
		tellPanesAboutWrite(tellPanes, target, broadcast, request.clientId ?? null, appliedAt);
	}

	return request.answer(context);
}

export interface CanonicalCorrections {
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
export function canonicalCorrections(
	submitted: Iterable<ServerElement>,
	canonical: Iterable<ServerElement>,
	boardKey: string,
): CanonicalCorrections {
	const before = new Map(
		presentElements(submitted, { boardKey }).map((element) => [element.id, element]),
	);
	const after = new Map(
		presentElements(canonical, { boardKey }).map((element) => [element.id, element]),
	);
	const deletes = [...before.keys()].filter((id) => !after.has(id));
	const upserts: ServerElement[] = [];
	for (const [id, element] of after) {
		const prior = before.get(id);
		if (!prior || !isDeepStrictEqual(prior, element)) upserts.push(element);
	}
	return { upserts, deletes };
}

/** A persisted human report gets a compact canonical acknowledgement. */
export function humanWriteAnswer(
	context: BoardWriteAnswerContext<unknown>,
	wantsFullDocument: boolean,
): Record<string, unknown> {
	const { source, content, submittedElements, written } = context;
	return {
		corrections: canonicalCorrections(submittedElements, content.elements.values(), source.key),
		fingerprint: boardFingerprint(source.board, content, written),
		...(wantsFullDocument
			? { document: presentElements(content.elements.values(), { boardKey: source.key }) }
			: {}),
	};
}

/** What an agent gets after a write, small unless it asked for the document. */
export function agentWriteAnswer(
	boardKey: string,
	board: BoardState,
	content: BoardContent,
	touched: ServerElement[],
	wantsDocument: boolean,
	written?: WrittenNote | null,
): Record<string, unknown> {
	return {
		elements: presentElements(touched, { boardKey }),
		fingerprint: boardFingerprint(board, content, written),
		...(wantsDocument
			? { document: presentElements(content.elements.values(), { boardKey }) }
			: {}),
	};
}

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
