// The write entry ADR 0015 names: one input-spelling write, converted once,
// applied to the request-local board, and settled.
//
// The stages themselves live beside this file — merging an update onto the
// element the board holds in `lib/apply-element-input-merge.ts`, the agent
// and human halves in `-agent.ts` and `-human.ts`, and everything a landed
// write implies in `-settling.ts`. What is here is the order they run in,
// which is the part that must not have a second implementation.

import { copyElements } from "@/runtime/engine/board-store";
import { validateRenderGeometry } from "@/runtime/engine/geometry";
import {
	type PreparedElementInput,
	applyAgentInput,
} from "@/runtime/engine/lib/apply-element-input-agent";
import { applyHumanInput } from "@/runtime/engine/lib/apply-element-input-human";
import {
	settleAfterWrite,
	settleDocument,
} from "@/runtime/engine/lib/apply-element-input-settling";
import type {
	AgentElementInput,
	HumanElementChangeInput,
} from "@/runtime/engine/lib/element-input-schema";
import type { PresentationContext } from "@/runtime/engine/presentation";
import type { ServerElement } from "@/runtime/engine/types";

export {
	AgentElementInputSchema,
	CREATE_ELEMENT_JSON_SCHEMA,
	CreateElementSchema,
	HumanElementChangeSchema,
	PointSchema,
	UPDATE_ELEMENT_JSON_SCHEMA,
	UpdateElementSchema,
} from "@/runtime/engine/lib/element-input-schema";
export type {
	AgentElementInput,
	HumanElementChangeInput,
} from "@/runtime/engine/lib/element-input-schema";
export { wellFormAgentStatement } from "@/runtime/engine/lib/agent-element-input";

export type ElementInputRequest =
	| {
			origin: "agent";
			upserts?: AgentElementInput[];
			deletes?: string[];
			/** Exact outbound presentation values echoed by this operation. */
			presentationLinks?: ReadonlyMap<string, PresentationContext>;
	  }
	| {
			origin: "human";
			upserts?: HumanElementChangeInput[];
			deletes?: string[];
			timestamp?: string;
			/** Opaque outbound presentation values, supplied by the current presenter. */
			presentationLinks?: ReadonlyMap<string, PresentationContext>;
	  };

export interface AppliedElementInput {
	/** The board-shape elements corresponding to `upserts`, in input order. */
	named: ServerElement[];
	/** The request-local document before well-forming repairs and settlement. */
	requested: ServerElement[];
	created: ServerElement[];
	updated: ServerElement[];
	deleted: string[];
}

/**
 * Convert and apply one write's upserts, whichever side wrote them.
 * @param working The request-local board.
 * @param request The write.
 * @returns What the write put on the board.
 */
function applyUpserts(
	working: Map<string, ServerElement>,
	request: ElementInputRequest,
): PreparedElementInput {
	if (request.origin === "agent") {
		return applyAgentInput(working, request.upserts ?? [], request.presentationLinks);
	}
	return applyHumanInput(
		working,
		request.upserts ?? [],
		request.timestamp,
		request.presentationLinks,
	);
}

/**
 * Remove what the write asked to delete, ignoring ids the board never held.
 * @param working The request-local board.
 * @param deletes The ids to delete.
 * @returns The ids that were there to delete.
 */
function applyDeletes(working: Map<string, ServerElement>, deletes: readonly string[]): string[] {
	const deleted: string[] = [];
	for (const id of deletes) {
		if (working.delete(id)) {
			deleted.push(id);
		}
	}
	return deleted;
}

/**
 * Convert one input-spelling write into the board shape and apply it to the
 * request-local board map. This is the only entry that owns the stage order.
 * Persistence, broadcast and the HTTP answer stay with the caller.
 * @param board The caller's board, replaced in place once the write succeeds.
 * @param request The write.
 * @returns What the write did, and the document the caller intended.
 */
export function applyElementInput(
	board: Map<string, ServerElement>,
	request: ElementInputRequest,
): AppliedElementInput {
	// This function is public as well as the write door's conversion stage. Do
	// the whole conversion against an isolated document, then replace the
	// caller's map only after well-forming and validation both succeed.
	const working = new Map(copyElements(board.values()).map((element) => [element.id, element]));
	const prepared = applyUpserts(working, request);
	const deleted = applyDeletes(working, request.deletes ?? []);
	// Capture what the caller intended before the sole input converter repairs
	// bindings, dependent elements, ids, and ordering. A pane acknowledgement
	// compares this request-local document with the canonical document that was
	// persisted; otherwise a repair performed below is invisible to that pane.
	const requested = copyElements(working.values());
	for (const element of settleAfterWrite(prepared.moved ?? [], working)) {
		if (working.has(element.id)) {
			prepared.updated.set(element.id, element);
		}
	}
	const settled = settleDocument(
		{
			created: prepared.created,
			updated: [...prepared.updated.values()].filter((element) => working.has(element.id)),
			deleted,
		},
		working,
	);
	validateRenderGeometry(working.values());
	const applied = { named: namedElements(prepared, working), requested, ...settled };
	board.clear();
	for (const [id, element] of working) {
		board.set(id, element);
	}
	return applied;
}

/**
 * The elements the write named, in the order it named them, skipping any the
 * settlement took away.
 * @param prepared What the write put on the board.
 * @param working The settled board.
 * @returns The named elements.
 */
function namedElements(
	prepared: PreparedElementInput,
	working: ReadonlyMap<string, ServerElement>,
): ServerElement[] {
	return prepared.namedIds.flatMap((id) => {
		const element = working.get(id);
		return element ? [element] : [];
	});
}
