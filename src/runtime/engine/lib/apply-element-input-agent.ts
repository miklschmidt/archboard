// One agent write, converted and applied to a request-local board.

import { expandForBoard } from "@/runtime/engine/expand-elements";
import { buildAgentElement } from "@/runtime/engine/lib/agent-element-input";
import {
	hasOwn,
	mergeElementUpdate,
	sizeFromPath,
} from "@/runtime/engine/lib/apply-element-input-merge";
import {
	resolveArrowBindings,
	restateLabels,
} from "@/runtime/engine/lib/apply-element-input-settling";
import type { AgentElementInput } from "@/runtime/engine/lib/element-input-schema";
import {
	canonicalLinkAfterPresentationEcho,
	stripPresentationMarker,
	type PresentationContext,
} from "@/runtime/engine/presentation";
import type { ServerElement } from "@/runtime/engine/types";
import type { LegacyElementIngress } from "@/shared/board-elements";

/** What a converted write has put on the board, before settlement. */
interface PreparedElementInput {
	created: ServerElement[];
	updated: Map<string, ServerElement>;
	namedIds: string[];
	moved?: string[];
}

/** The shapes archboard rounds by default, whose corners a write may not state. */
const ROUNDED_BY_DEFAULT = new Set(["rectangle", "ellipse", "diamond"]);

/** What one agent write is building as it converts each statement. */
interface AgentWrite {
	board: Map<string, ServerElement>;
	created: ServerElement[];
	updated: Map<string, ServerElement>;
	moved: string[];
	namedIds: string[];
	/** Every statement, whichever way it landed, for the label restatement. */
	statements: LegacyElementIngress[];
	/** The statements for elements the board does not hold yet. */
	newStatements: LegacyElementIngress[];
	/** Shapes this write created without stating roundness. */
	inputSquareIds: Set<string>;
	/** Ids this write has minted, so no two statements are handed the same one. */
	minted: Set<string>;
	/** Whether an id is spoken for, on the board or by this write. */
	taken: { has: (id: string) => boolean };
}

/**
 * A fresh write, whose ids may not collide with the board's or with those the
 * write itself states.
 * @param board The request-local board.
 * @param upserts The statements the write carries.
 * @returns The write.
 */
function startWrite(
	board: Map<string, ServerElement>,
	upserts: readonly AgentElementInput[],
): AgentWrite {
	const statedIds = new Set(
		upserts.map((raw) => raw.id).filter((id): id is string => typeof id === "string" && id !== ""),
	);
	const minted = new Set<string>();
	return {
		board,
		created: [],
		updated: new Map(),
		moved: [],
		namedIds: [],
		statements: [],
		newStatements: [],
		inputSquareIds: new Set(),
		minted,
		taken: {
			/**
			 * Whether an id is spoken for.
			 * @param id The id.
			 * @returns True when the board or this write already has it.
			 */
			has: (id: string) => board.has(id) || statedIds.has(id) || minted.has(id),
		},
	};
}

/**
 * The statement with its presentation marker spent: a link the presenter
 * echoed back is read as the link the board already holds, so an overlay a
 * pane showed is never persisted (ADR 0015).
 * @param input The statement as written.
 * @param existing The element the board holds, when it holds one.
 * @param presentation What the presenter last showed for this element.
 * @returns The statement to convert.
 */
function withoutPresentation(
	input: AgentElementInput,
	existing: ServerElement | undefined,
	presentation: PresentationContext | undefined,
): AgentElementInput {
	const stripped = stripPresentationMarker(input);
	if (!presentation || !existing) {
		return stripped;
	}
	return {
		...stripped,
		link: canonicalLinkAfterPresentationEcho(existing, stripped["link"], presentation),
	};
}

/**
 * Apply one statement to an element the board already holds.
 * @param write The write being built.
 * @param existing The element the board holds.
 * @param raw The statement, its presentation marker already spent.
 * @throws {Error} When the converter does not produce the element back.
 */
function applyUpdate(write: AgentWrite, existing: ServerElement, raw: AgentElementInput): void {
	const merge = mergeElementUpdate(existing, raw);
	const expanded = expandForBoard([merge.statement], write.board);
	const element = expanded.find((candidate) => candidate.id === existing.id);
	if (!element) {
		throw new Error(`Write ingress did not produce element ${existing.id}`);
	}
	for (const completed of expanded) {
		write.board.set(completed.id, completed);
	}
	if (merge.reboundArrow) {
		resolveArrowBindings([element], write.board);
	}
	if (merge.geometryChanged || merge.reboundArrow) {
		write.moved.push(existing.id);
	}
	write.updated.set(existing.id, element);
	write.statements.push(merge.statement);
	write.namedIds.push(existing.id);
}

/**
 * Hold one statement for an element the board does not have yet. Nothing is
 * converted here: the new statements go through the converter together, so
 * ids and labels are minted against one another.
 * @param write The write being built.
 * @param raw The statement, its presentation marker already spent.
 */
function holdCreation(write: AgentWrite, raw: AgentElementInput): void {
	const statement = buildAgentElement(raw, write.taken);
	if (ROUNDED_BY_DEFAULT.has(statement.type) && !hasOwn(raw, "roundness")) {
		write.inputSquareIds.add(statement.id);
	}
	write.minted.add(statement.id);
	write.statements.push(statement);
	write.newStatements.push(statement);
	write.namedIds.push(statement.id);
}

/**
 * Convert every held statement at once and put the elements on the board.
 * @param write The write being built.
 * @throws {Error} When the converter does not produce a statement's element.
 */
function createHeld(write: AgentWrite): void {
	if (write.newStatements.length === 0) {
		return;
	}
	for (const completed of expandForBoard(write.newStatements, write.board)) {
		write.board.set(completed.id, completed);
		write.created.push(completed);
	}
	for (const statement of write.newStatements) {
		if (!write.board.has(statement.id)) {
			throw new Error(`Write ingress did not produce element ${statement.id}`);
		}
	}
	resolveArrowBindings(write.created, write.board, true, write.inputSquareIds);
	write.created.forEach(sizeFromPath);
}

/**
 * Apply one statement: an update to the element the board holds under that
 * id, or a creation held for the batch that follows.
 * @param write The write being built.
 * @param input The statement as written.
 * @param presentationLinks What the presenter last showed for each element.
 */
function applyStatement(
	write: AgentWrite,
	input: AgentElementInput,
	presentationLinks: ReadonlyMap<string, PresentationContext>,
): void {
	const rawId = typeof input.id === "string" && input.id !== "" ? input.id : undefined;
	const existing = rawId === undefined ? undefined : write.board.get(rawId);
	const presentation = rawId === undefined ? undefined : presentationLinks.get(rawId);
	const raw = withoutPresentation(input, existing, presentation);
	if (existing) {
		applyUpdate(write, existing, raw);
		return;
	}
	holdCreation(write, raw);
}

/**
 * Apply one agent write to a request-local board.
 * @param board The request-local board, written to in place.
 * @param upserts The statements the write carries.
 * @param presentationLinks The exact outbound presentation values this
 * operation echoed, so a link that came back is not persisted as the board's.
 * @returns What the write put on the board.
 */
function applyAgentInput(
	board: Map<string, ServerElement>,
	upserts: AgentElementInput[],
	presentationLinks: ReadonlyMap<string, PresentationContext> = new Map(),
): PreparedElementInput {
	const write = startWrite(board, upserts);
	for (const input of upserts) {
		applyStatement(write, input, presentationLinks);
	}
	createHeld(write);
	for (const label of restateLabels(write.statements, board)) {
		write.updated.set(label.id, label);
		write.moved.push(label.id);
	}
	return {
		created: write.created,
		updated: write.updated,
		namedIds: write.namedIds,
		moved: write.moved,
	};
}

export { type PreparedElementInput, applyAgentInput };
