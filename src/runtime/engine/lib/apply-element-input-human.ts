// One human write, as a pane reports it, applied to a request-local board.
//
// A person's edit is optimistic and the note still decides (ADR 0022): what
// arrives here is what a pane already drew, and it is written down only after
// the same well-forming and validation an agent write gets.

import { expandForBoard } from "@/runtime/engine/expand-elements";
import type { PreparedElementInput } from "@/runtime/engine/lib/apply-element-input-agent";
import {
	bumpVersion,
	hasOwn,
	mergeCustomData,
} from "@/runtime/engine/lib/apply-element-input-merge";
import type { HumanElementChangeInput } from "@/runtime/engine/lib/element-input-schema";
import { validatePersistedBoardElement } from "@/runtime/engine/lib/native-element";
import { stripUntrustedTrackingClaims } from "@/runtime/engine/metadata";
import {
	canonicalLinkAfterPresentationEcho,
	stripPresentationMarker,
	type PresentationContext,
} from "@/runtime/engine/presentation";
import type { ServerElement } from "@/runtime/engine/types";
import { mintId } from "@/shared/ids/ids";
import type { LegacyElementIngress } from "@/shared/board-elements";

/**
 * The input-only aliases an agent may write and a pane may not: a pane
 * reports the board's own shape, so one of these means something converted
 * on the way out, which is what ADR 0015 exists to stop.
 */
const INPUT_ONLY_ALIASES = ["label", "start", "end", "startElementId", "endElementId"];

/** The bookkeeping a pane may not claim; the server states it (TASK-095). */
interface TrackingClaims {
	board?: unknown;
	id?: unknown;
	createdAt?: unknown;
	updatedAt?: unknown;
	version?: unknown;
	syncedAt?: unknown;
	source?: unknown;
	syncTimestamp?: unknown;
}

/**
 * The statement without the bookkeeping a pane may not claim, and the id it
 * named.
 * @param raw The change as the pane reported it.
 * @returns The id it named, when it named one, and the rest of the statement.
 */
function withoutClaims(raw: HumanElementChangeInput): {
	rawId: unknown;
	incoming: Record<string, unknown>;
} {
	const sanitized: Record<string, unknown> & TrackingClaims = stripUntrustedTrackingClaims(
		stripPresentationMarker(raw),
	);
	const {
		board: _board,
		id: rawId,
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		version: _version,
		syncedAt: _syncedAt,
		source: _source,
		syncTimestamp: _syncTimestamp,
		...incoming
	} = sanitized;
	return { rawId, incoming };
}

/**
 * The link to persist: what the presenter's echo resolves to when this
 * element carried an overlay, else what the pane said, else what the board
 * already holds.
 * @param existing The element the board holds, when it holds one.
 * @param incoming The statement's fields.
 * @param presentation What the presenter last showed for this element.
 * @returns The link, or undefined when the statement settles nothing.
 */
function canonicalLink(
	existing: ServerElement | undefined,
	incoming: Record<string, unknown>,
	presentation: PresentationContext | undefined,
): string | null | undefined {
	if (presentation) {
		return canonicalLinkAfterPresentationEcho(existing, incoming["link"], presentation);
	}
	if (typeof incoming["link"] === "string" || incoming["link"] === null) {
		return incoming["link"];
	}
	return existing?.link;
}

/**
 * Refuse a pane statement carrying an agent's input-only spelling.
 * @param id The element the statement names.
 * @param incoming The statement's fields.
 * @throws {Error} When the statement carries one.
 */
function refuseInputAliases(id: string, incoming: Record<string, unknown>): void {
	for (const alias of INPUT_ONLY_ALIASES) {
		if (hasOwn(incoming, alias)) {
			throw new Error(`Human element ${id} contains input-only ${alias}`);
		}
	}
}

/** When a human write happened, and which sync it belongs to. */
interface WriteStamps {
	now: string;
	timestamp?: string;
}

/**
 * The statement for an element the board does not hold: everything the pane
 * said, stamped as a sync of a human's own drawing.
 * @param id The element's id.
 * @param incoming The statement's fields.
 * @param link The link to persist, when one was settled.
 * @param stamps When this write happened.
 * @returns The statement for the converter.
 */
function creationStatement(
	id: string,
	incoming: Record<string, unknown>,
	link: string | null | undefined,
	stamps: WriteStamps,
): LegacyElementIngress {
	const statement: Record<string, unknown> = {
		...incoming,
		...(link === undefined ? {} : { link }),
		id,
		createdAt: stamps.now,
		updatedAt: stamps.now,
		source: "frontend_sync",
		syncedAt: stamps.now,
		...(stamps.timestamp ? { syncTimestamp: stamps.timestamp } : {}),
	};
	// The converter completes and validates this; nothing persists it before
	// that, which is what makes the incomplete shape safe to name here.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- completed by the write-ingress converter
	return statement as unknown as LegacyElementIngress;
}

/**
 * The element an update leaves behind: the board's own element with the
 * pane's fields over it, stamped as a sync.
 * @param existing The element the board holds.
 * @param id Its id.
 * @param incoming The statement's fields.
 * @param link The link to persist, when one was settled.
 * @param stamps When this write happened.
 * @returns The validated element.
 * @throws {Error} When the merged element is not a board element.
 */
function updatedElement(
	existing: ServerElement,
	id: string,
	incoming: Record<string, unknown>,
	link: string | null | undefined,
	stamps: WriteStamps,
): ServerElement {
	const candidate: Record<string, unknown> = {
		...existing,
		...incoming,
		...(link === undefined ? {} : { link }),
		id,
		createdAt: existing.createdAt ?? stamps.now,
		source: "frontend_sync",
		syncedAt: stamps.now,
		...(stamps.timestamp ? { syncTimestamp: stamps.timestamp } : {}),
	};
	if (hasOwn(incoming, "customData")) {
		candidate["customData"] = mergeCustomData(existing.customData, incoming["customData"]);
	}
	const element = validatePersistedBoardElement(candidate, `human write ${id}`);
	bumpVersion(element, existing, stamps.now);
	return element;
}

/**
 * Convert every held statement at once and put the elements on the board.
 * @param newStatements The statements for elements the board does not hold.
 * @param board The request-local board.
 * @returns The elements created.
 * @throws {Error} When the converter does not produce a statement's element.
 */
function createHeld(
	newStatements: LegacyElementIngress[],
	board: Map<string, ServerElement>,
): ServerElement[] {
	if (newStatements.length === 0) {
		return [];
	}
	const created: ServerElement[] = [];
	for (const completed of expandForBoard(newStatements, board)) {
		board.set(completed.id, completed);
		created.push(completed);
	}
	for (const statement of newStatements) {
		if (!board.has(statement.id)) {
			throw new Error(`Write ingress did not produce human element ${statement.id}`);
		}
	}
	return created;
}

/**
 * Apply one human write to a request-local board.
 * @param board The request-local board, written to in place.
 * @param upserts The changes the pane reported.
 * @param timestamp Which sync these changes belong to.
 * @param presentationLinks The opaque outbound presentation values the current
 * presenter supplied, so an overlay a pane showed is not persisted.
 * @returns What the write put on the board.
 */
function applyHumanInput(
	board: Map<string, ServerElement>,
	upserts: HumanElementChangeInput[],
	timestamp?: string,
	presentationLinks: ReadonlyMap<string, PresentationContext> = new Map(),
): PreparedElementInput {
	const updated = new Map<string, ServerElement>();
	const namedIds: string[] = [];
	const newStatements: LegacyElementIngress[] = [];
	const stamps: WriteStamps = {
		now: new Date().toISOString(),
		...(timestamp === undefined ? {} : { timestamp }),
	};
	for (const raw of upserts) {
		const { rawId, incoming } = withoutClaims(raw);
		const id = elementIdFor(rawId, board);
		namedIds.push(id);
		const change = settleChange(board, id, incoming, stamps, presentationLinks.get(id));
		if (change.kind === "created") {
			newStatements.push(change.statement);
			continue;
		}
		board.set(id, change.element);
		updated.set(id, change.element);
	}
	return { created: createHeld(newStatements, board), updated, namedIds };
}

/**
 * The id a change names, or a fresh one minted against the board.
 * @param rawId What the change called itself.
 * @param board The request-local board, whose ids a minted one avoids.
 * @returns The element's id.
 */
function elementIdFor(rawId: unknown, board: Map<string, ServerElement>): string {
	return typeof rawId === "string" && rawId !== "" ? rawId : mintId(board);
}

/** One change: an element the board already held, or a statement to convert. */
type HumanChange =
	| { kind: "updated"; element: ServerElement }
	| { kind: "created"; statement: LegacyElementIngress };

/**
 * What one pane change becomes: the board's element with the pane's fields
 * over it, or a statement for an element the board does not hold yet.
 * @param board The request-local board.
 * @param id The element the change names.
 * @param incoming The change's fields.
 * @param stamps When this write happened.
 * @param presentation What the presenter last showed for this element.
 * @returns The change.
 * @throws {Error} When the change carries an agent's input-only spelling.
 */
function settleChange(
	board: ReadonlyMap<string, ServerElement>,
	id: string,
	incoming: Record<string, unknown>,
	stamps: WriteStamps,
	presentation: PresentationContext | undefined,
): HumanChange {
	const existing = board.get(id);
	const link = canonicalLink(existing, incoming, presentation);
	refuseInputAliases(id, incoming);
	if (existing) {
		return { kind: "updated", element: updatedElement(existing, id, incoming, link, stamps) };
	}
	return { kind: "created", statement: creationStatement(id, incoming, link, stamps) };
}

export { applyHumanInput };
