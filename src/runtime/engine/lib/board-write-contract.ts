// What one board write is, as a shape both the routes and the write boundary
// can name.
//
// A route says what it wants done and how it wants the answer shaped; the
// write boundary decides where the document goes and who hears about it. These
// are the types that sentence is written in, kept apart from the machinery so
// that neither half has to import the other.

import type {
	AppliedElementInput,
	ElementInputRequest,
} from "@/runtime/engine/apply-element-input";
import type { BoardContent, writeBoardContent } from "@/runtime/engine/board-io";
import { type BoardState, copyElements } from "@/runtime/engine/board-store";
import type { LockHolder } from "@/runtime/engine/board-lock";
import type { ChangeOrigin } from "@/runtime/engine/change-feed";
import type { PresentationContext } from "@/runtime/engine/presentation";
import type { ExcalidrawFile, ServerElement } from "@/runtime/engine/types";
import type { CheckoutSnapshot } from "@/runtime/code-target";

/** What board-io reports about the note it just wrote. */
type WrittenNote = ReturnType<typeof writeBoardContent>;

/** One board, named the way the write boundary addresses it. */
interface BoardWriteTarget {
	key: string;
	board: BoardState;
}

/** What one write changed, as the panes and the answer need to hear it. */
interface BoardWriteDelta {
	created: ServerElement[];
	updated: ServerElement[];
	deleted: string[];
	filesAdded?: ExcalidrawFile[];
	filesDeleted?: string[];
	filesReplaced?: ExcalidrawFile[];
}

/** The parts of a delta that only some writes have anything to say about. */
type DeltaFiles = Pick<BoardWriteDelta, "filesAdded" | "filesDeleted" | "filesReplaced">;

/** What a mutation reports back to the write boundary. */
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

/** One change, applied to an isolated copy of the source document. */
type BoardMutation<T> = (
	content: BoardContent,
	destinationBefore: BoardContent,
) => BoardMutationResult<T>;

/** What a route wants done to a board's elements. */
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

/** Everything a route's answer shaper has to work with. */
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

/** One complete write, as a route asks for it. */
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

/** A refusal a route can answer with directly, status and all. */
class BoardMutationError extends Error {
	/**
	 * Refuse a write with something the caller can act on.
	 * @param status The HTTP status this refusal answers with.
	 * @param message What to tell the caller.
	 * @param code A machine-readable tag, where the caller acts on the kind.
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
 * The file fields of a delta, present only where the write touched files.
 * @param delta What the mutation reported.
 * @returns The fields to merge into the complete delta.
 */
function deltaFiles(delta: Partial<BoardWriteDelta>): DeltaFiles {
	return {
		...(delta.filesAdded ? { filesAdded: delta.filesAdded } : {}),
		...(delta.filesDeleted ? { filesDeleted: delta.filesDeleted } : {}),
		...(delta.filesReplaced ? { filesReplaced: delta.filesReplaced } : {}),
	};
}

/**
 * A mutation's delta with its element lists filled in, so every reader can
 * count them without first asking whether they are there.
 * @param delta What the mutation reported, if anything.
 * @returns The complete delta.
 */
const completeDelta = (delta: Partial<BoardWriteDelta> = {}): BoardWriteDelta => ({
	created: delta.created ?? [],
	updated: delta.updated ?? [],
	deleted: delta.deleted ?? [],
	...deltaFiles(delta),
});

/**
 * An isolated copy of a board's document, so a mutation that throws partway
 * cannot leave an earlier upsert applied to live state.
 * @param content The document to copy.
 * @returns The copy.
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

export {
	type BoardMutation,
	type BoardMutationResult,
	type BoardWriteAnswerContext,
	type BoardWriteDelta,
	type BoardWriteRequest,
	type BoardWriteTarget,
	type ElementMutationPlan,
	type WrittenNote,
	BoardMutationError,
	SCENE_REPLACEMENT_MARKER,
	completeDelta,
	copyContent,
};
