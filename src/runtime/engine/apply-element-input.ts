import { normalizeFontFamily } from "./types.js";
import type { ServerElement } from "./types.js";
import { bindingOf, boundEndpoint, centreOf } from "./arrow-binding.js";
import {
	expandForBoard,
	relabelBoundTexts,
	repairIndices,
	settleDeletions,
} from "./expand-elements.js";
import {
	DEFAULT_LINEAR_POINTS,
	pointsOf,
	remeasureLinear,
	validateRenderGeometry,
} from "./geometry.js";
import { copyElements } from "./board-store.js";
import { mintId } from "../../shared/ids/ids.js";
import { recentreBoundTexts } from "./labels.js";
import type { LegacyElementIngress } from "../../shared/board-elements/index.js";
import { validatePersistedBoardElement } from "./lib/native-element.js";
import { canonicalLinkAfterPresentationEcho } from "./presentation.js";
import { stripUntrustedTrackingClaims } from "./metadata.js";
export {
	AgentElementInputSchema,
	CREATE_ELEMENT_JSON_SCHEMA,
	CreateElementSchema,
	HumanElementChangeSchema,
	PointSchema,
	UPDATE_ELEMENT_JSON_SCHEMA,
	UpdateElementSchema,
} from "./lib/element-input-schema.js";
export type { AgentElementInput, HumanElementChangeInput } from "./lib/element-input-schema.js";
import {
	type AgentElementInput,
	type HumanElementChangeInput,
	UpdateElementSchema,
} from "./lib/element-input-schema.js";
import {
	buildAgentElement,
	spendArrowRefs,
	wellFormAgentStatement,
} from "./lib/agent-element-input.js";

export type ElementInputRequest =
	| {
			origin: "agent";
			upserts?: AgentElementInput[];
			deletes?: string[];
	  }
	| {
			origin: "human";
			upserts?: HumanElementChangeInput[];
			deletes?: string[];
			timestamp?: string;
			/** Opaque outbound presentation values, supplied by the current presenter. */
			presentationLinks?: ReadonlyMap<string, string>;
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

const hasOwn = (value: object, key: PropertyKey): boolean =>
	Object.prototype.hasOwnProperty.call(value, key);

function mergeCustomData(existing: unknown, incoming: unknown): unknown {
	if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return incoming;
	const current =
		existing && typeof existing === "object" && !Array.isArray(existing)
			? (existing as Record<string, unknown>)
			: {};
	const next = incoming as Record<string, unknown>;
	const { archboard: _currentSemantic, ...currentForeign } = current;
	return {
		...currentForeign,
		...next,
	};
}

function bumpVersion(
	element: ServerElement,
	previous?: ServerElement,
	at = new Date().toISOString(),
): void {
	element.updatedAt = at;
	element.version = ((previous ?? element).version || 0) + 1;
}

/**
 * The one implementation of making an input-spelling statement well formed.
 * It spends client aliases here so CLI, library and direct HTTP writes
 * all reach the converter as the same statement.
 */
function normalizeLineBreakMarkup(text: string): string {
	return text.replace(/<\s*b\s*r\s*\/?\s*>/gi, "\n").replace(/\n{3,}/g, "\n\n");
}

interface ElementMerge {
	element: ServerElement;
	statement: LegacyElementIngress;
	geometryChanged: boolean;
	reboundArrow: boolean;
}

function mergeElementUpdate(existing: ServerElement, raw: AgentElementInput): ElementMerge {
	const statement = wellFormAgentStatement(raw, existing.type);
	if (statement.type !== undefined && statement.type !== existing.type) {
		throw new Error(`Element ${existing.id} cannot change type from ${existing.type}`);
	}
	const { board: _boardField, ...updates } = UpdateElementSchema.parse({
		...statement,
		id: existing.id,
	}) as Record<string, unknown>;
	const candidate: Record<string, unknown> = {
		...existing,
		...updates,
		...(existing.type === "text"
			? {
					fontFamily:
						updates.fontFamily !== undefined
							? normalizeFontFamily(
									typeof updates.fontFamily === "string" || typeof updates.fontFamily === "number"
										? updates.fontFamily
										: undefined,
								)
							: existing.fontFamily,
				}
			: {}),
	};
	if (hasOwn(updates, "customData"))
		candidate.customData = mergeCustomData(existing.customData, updates.customData);
	delete candidate.label;
	delete candidate.start;
	delete candidate.end;
	spendArrowRefs(candidate, statement);
	if (existing.type !== "text") {
		for (const key of [
			"text",
			"originalText",
			"fontSize",
			"fontFamily",
			"textAlign",
			"verticalAlign",
			"autoResize",
			"lineHeight",
			"containerId",
		])
			delete candidate[key];
	}
	const element = validatePersistedBoardElement(candidate, `element update ${existing.id}`);
	bumpVersion(element, existing);

	const hasTextUpdate = hasOwn(statement, "text");
	const hasOriginalTextUpdate = hasOwn(statement, "originalText");
	if (element.type === "text" && hasTextUpdate && !hasOriginalTextUpdate) {
		const incomingText = updates.text ?? "";
		const existingText = existing.type === "text" ? existing.text : "";
		const existingOriginalText = existing.type === "text" ? existing.originalText : "";
		const existingOriginalHasBr = /<\s*b\s*r\s*\/?\s*>/i.test(existingOriginalText);
		const normalizedExistingText = normalizeLineBreakMarkup(existingText);
		const normalizedExistingOriginalText = normalizeLineBreakMarkup(existingOriginalText);
		if (
			existingOriginalHasBr &&
			incomingText === normalizedExistingText &&
			normalizedExistingOriginalText
		) {
			element.text = normalizedExistingOriginalText;
			element.originalText = normalizedExistingOriginalText;
		} else {
			element.originalText = typeof incomingText === "string" ? incomingText : "";
		}
	}

	const changed = (key: string) => hasOwn(statement, key);
	if (changed("points")) sizeFromPath(element);
	const isLinear = element.type === "arrow" || element.type === "line";
	return {
		element,
		statement: {
			...element,
			...statement,
			type: existing.type,
			...(element.customData === undefined ? {} : { customData: element.customData }),
		} as LegacyElementIngress,
		geometryChanged: ["x", "y", "width", "height", "points", "angle"].some(changed),
		reboundArrow: isLinear && ["start", "end", "startBinding", "endBinding"].some(changed),
	};
}

function sizeFromPath(element: ServerElement): boolean {
	const measured = remeasureLinear(element);
	if (!measured) return false;
	element.width = measured.width;
	element.height = measured.height;
	return true;
}

function pathOf(
	element: Extract<ServerElement, { type: "arrow" | "line" }>,
): { x: number; y: number }[] {
	const measured = pointsOf(element.points);
	const points =
		measured && measured.length >= 2 ? measured : DEFAULT_LINEAR_POINTS.map(([x, y]) => ({ x, y }));
	return points.map((point) => ({ x: element.x + point.x, y: element.y + point.y }));
}

function resolveArrowBindings(
	written: ServerElement[],
	board: Map<string, ServerElement>,
	newlyDrawn = false,
	inputSquareIds: ReadonlySet<string> = new Set(),
): void {
	const available = new Map(board);
	for (const element of written) available.set(element.id, element);

	for (const element of written) {
		if (element.type !== "arrow" && element.type !== "line") continue;
		const dynamic = element as unknown as Record<string, unknown>;
		if (dynamic.elbowed === true) continue;
		const startBinding = bindingOf(dynamic.startBinding);
		const endBinding = bindingOf(dynamic.endBinding);
		const inputGeometry = (target: ServerElement | undefined): ServerElement | undefined =>
			target && inputSquareIds.has(target.id) ? { ...target, roundness: null } : target;
		const startElement = inputGeometry(
			startBinding ? available.get(startBinding.elementId) : undefined,
		);
		const endElement = inputGeometry(endBinding ? available.get(endBinding.elementId) : undefined);
		if (!startElement && !endElement) continue;

		const points = pathOf(element);
		const last = points.length - 1;
		const straight = points.length === 2;
		const startAim = newlyDrawn && straight && endElement ? centreOf(endElement) : points[1]!;
		const endAim =
			newlyDrawn && straight && startElement ? centreOf(startElement) : points[last - 1]!;
		if (startBinding && startElement) {
			points[0] = boundEndpoint(startElement, startBinding, startAim, points[0]!);
		}
		if (endBinding && endElement) {
			points[last] = boundEndpoint(endElement, endBinding, endAim, points[last]!);
		}
		const origin = points[0]!;
		element.x = origin.x;
		element.y = origin.y;
		element.points = points.map((point) => [point.x - origin.x, point.y - origin.y]);
		sizeFromPath(element);
	}
}

function rerouteBoundArrows(movedId: string, board: Map<string, ServerElement>): ServerElement[] {
	const rerouted: ServerElement[] = [];
	for (const element of board.values()) {
		if (element.type !== "arrow" && element.type !== "line") continue;
		const joins = (binding: unknown) => bindingOf(binding)?.elementId === movedId;
		const dynamic = element as unknown as Record<string, unknown>;
		if (!joins(dynamic.startBinding) && !joins(dynamic.endBinding)) continue;
		resolveArrowBindings([element], board);
		bumpVersion(element);
		rerouted.push(element);
	}
	return rerouted;
}

function settleBoundTexts(
	containerIds: string[],
	board: Map<string, ServerElement>,
): ServerElement[] {
	const moved: ServerElement[] = [];
	for (const move of recentreBoundTexts([...board.values()], containerIds)) {
		const text = board.get(move.id);
		if (!text) continue;
		text.x = move.x;
		text.y = move.y;
		bumpVersion(text);
		moved.push(text);
	}
	return moved;
}

function restateLabels(
	written: LegacyElementIngress[],
	board: Map<string, ServerElement>,
): ServerElement[] {
	const restated = relabelBoundTexts(written, board);
	for (const element of restated) {
		bumpVersion(element, board.get(element.id) ?? element);
		board.set(element.id, element);
	}
	return restated;
}

function settleAfterWrite(movedIds: string[], board: Map<string, ServerElement>): ServerElement[] {
	const containers: string[] = [];
	const moved = new Map<string, ServerElement>();
	for (const id of movedIds) {
		const element = board.get(id);
		if (!element) continue;
		containers.push(id);
		if (element.type === "text" && element.containerId) {
			containers.push(element.containerId);
		}
		if (element.type !== "arrow" && element.type !== "line") {
			for (const arrow of rerouteBoundArrows(id, board)) {
				moved.set(arrow.id, arrow);
				containers.push(arrow.id);
			}
		}
	}
	for (const text of settleBoundTexts(containers, board)) moved.set(text.id, text);
	return [...moved.values()];
}

function settleDocument(
	applied: Pick<AppliedElementInput, "created" | "updated" | "deleted">,
	board: Map<string, ServerElement>,
): Pick<AppliedElementInput, "created" | "updated" | "deleted"> {
	const { alsoDeleted, changed } = settleDeletions(applied.deleted, board);
	const repaired = repairIndices(board);
	if (alsoDeleted.length === 0 && changed.length === 0 && repaired.length === 0) return applied;
	const created = new Map(applied.created.map((element) => [element.id, element]));
	const updated = new Map(applied.updated.map((element) => [element.id, element]));
	for (const element of [...changed, ...repaired]) {
		if (created.has(element.id)) created.set(element.id, element);
		else updated.set(element.id, element);
	}
	for (const id of alsoDeleted) {
		created.delete(id);
		updated.delete(id);
	}
	return {
		created: [...created.values()].filter((element) => board.has(element.id)),
		updated: [...updated.values()].filter((element) => board.has(element.id)),
		deleted: [...applied.deleted, ...alsoDeleted],
	};
}

interface PreparedElementInput {
	created: ServerElement[];
	updated: Map<string, ServerElement>;
	namedIds: string[];
	moved?: string[];
}

function applyAgentInput(
	board: Map<string, ServerElement>,
	upserts: AgentElementInput[],
): PreparedElementInput {
	const created: ServerElement[] = [];
	const updated = new Map<string, ServerElement>();
	const moved: string[] = [];
	const written: ServerElement[] = [];
	const statements: LegacyElementIngress[] = [];
	const newStatements: LegacyElementIngress[] = [];
	const namedIds: string[] = [];
	const statedIds = new Set(
		upserts
			.map((raw) => raw.id)
			.filter((id): id is string => typeof id === "string" && id.length > 0),
	);
	const minted = new Set<string>();
	const inputSquareIds = new Set<string>();
	const taken = { has: (id: string) => board.has(id) || statedIds.has(id) || minted.has(id) };

	for (const raw of upserts) {
		const rawId = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : undefined;
		const existing = rawId ? board.get(rawId) : undefined;
		if (existing) {
			const merge = mergeElementUpdate(existing, raw);
			const expanded = expandForBoard([merge.statement], board);
			const element = expanded.find((candidate) => candidate.id === existing.id);
			if (!element) throw new Error(`Write ingress did not produce element ${existing.id}`);
			for (const completed of expanded) board.set(completed.id, completed);
			if (merge.reboundArrow) resolveArrowBindings([element], board);
			if (merge.geometryChanged || merge.reboundArrow) moved.push(existing.id);
			updated.set(existing.id, element);
			written.push(element);
			statements.push(merge.statement);
			namedIds.push(existing.id);
			continue;
		}

		const statement = buildAgentElement(raw, taken);
		if (
			(statement.type === "rectangle" ||
				statement.type === "ellipse" ||
				statement.type === "diamond") &&
			!hasOwn(raw, "roundness")
		)
			inputSquareIds.add(statement.id);
		minted.add(statement.id);
		statements.push(statement);
		newStatements.push(statement);
		namedIds.push(statement.id);
	}
	if (newStatements.length > 0) {
		const expanded = expandForBoard(newStatements, board);
		for (const completed of expanded) {
			board.set(completed.id, completed);
			created.push(completed);
		}
		for (const statement of newStatements) {
			const element = board.get(statement.id);
			if (!element) throw new Error(`Write ingress did not produce element ${statement.id}`);
			written.push(element);
		}
	}

	if (created.length > 0) {
		resolveArrowBindings(created, board, true, inputSquareIds);
		created.forEach(sizeFromPath);
	}

	for (const label of restateLabels(statements, board)) {
		updated.set(label.id, label);
		moved.push(label.id);
	}
	return { created, updated, namedIds, moved };
}

function applyHumanInput(
	board: Map<string, ServerElement>,
	upserts: HumanElementChangeInput[],
	timestamp?: string,
	presentationLinks: ReadonlyMap<string, string> = new Map(),
): PreparedElementInput {
	const created: ServerElement[] = [];
	const updated = new Map<string, ServerElement>();
	const namedIds: string[] = [];
	const newStatements: LegacyElementIngress[] = [];
	const now = new Date().toISOString();
	for (const raw of upserts) {
		const sanitized = stripUntrustedTrackingClaims(raw);
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
		const id = typeof rawId === "string" && rawId.length > 0 ? rawId : mintId(board);
		const existing = board.get(id);
		const canonicalLink = canonicalLinkAfterPresentationEcho(
			existing,
			incoming.link,
			presentationLinks.get(id),
		);
		for (const alias of ["label", "start", "end", "startElementId", "endElementId"]) {
			if (hasOwn(incoming, alias))
				throw new Error(`Human element ${id} contains input-only ${alias}`);
		}
		if (!existing) {
			const statement = {
				...incoming,
				...(canonicalLink !== undefined ? { link: canonicalLink } : {}),
				id,
				createdAt: now,
				updatedAt: now,
				source: "frontend_sync",
				syncedAt: now,
				...(timestamp ? { syncTimestamp: timestamp } : {}),
			} as unknown as LegacyElementIngress;
			newStatements.push(statement);
			namedIds.push(id);
			continue;
		}
		const candidate: Record<string, unknown> = {
			...existing,
			...incoming,
			...(canonicalLink !== undefined ? { link: canonicalLink } : {}),
			id,
			createdAt: existing.createdAt ?? now,
			source: "frontend_sync",
			syncedAt: now,
			...(timestamp ? { syncTimestamp: timestamp } : {}),
		};
		if (hasOwn(incoming, "customData"))
			candidate.customData = mergeCustomData(existing.customData, incoming.customData);
		const element = validatePersistedBoardElement(candidate, `human write ${id}`);
		bumpVersion(element, existing, now);
		board.set(id, element);
		namedIds.push(id);
		updated.set(id, element);
	}
	if (newStatements.length > 0) {
		const expanded = expandForBoard(newStatements, board);
		for (const completed of expanded) {
			board.set(completed.id, completed);
			created.push(completed);
		}
		for (const statement of newStatements) {
			if (!board.has(statement.id))
				throw new Error(`Write ingress did not produce human element ${statement.id}`);
		}
	}
	return { created, updated, namedIds };
}

/**
 * Convert one input-spelling write into the board shape and apply it to the
 * request-local board map. This is the only entry that owns the stage order.
 * Persistence, broadcast and the HTTP answer stay with the caller.
 */
export function applyElementInput(
	board: Map<string, ServerElement>,
	request: ElementInputRequest,
): AppliedElementInput {
	// This function is public as well as the write door's conversion stage. Do
	// the whole conversion against an isolated document, then replace the
	// caller's map only after well-forming and validation both succeed.
	const working = new Map(copyElements(board.values()).map((element) => [element.id, element]));
	const deletes = request.deletes ?? [];
	const prepared =
		request.origin === "agent"
			? applyAgentInput(working, request.upserts ?? [])
			: applyHumanInput(
					working,
					request.upserts ?? [],
					request.timestamp,
					request.presentationLinks,
				);
	const deleted: string[] = [];
	for (const id of deletes) {
		if (working.delete(id)) deleted.push(id);
	}
	// Capture what the caller intended before the sole input converter repairs
	// bindings, dependent elements, ids, and ordering. A pane acknowledgement
	// compares this request-local document with the canonical document that was
	// persisted; otherwise a repair performed below is invisible to that pane.
	const requested = copyElements(working.values());
	for (const element of settleAfterWrite(prepared.moved ?? [], working)) {
		if (working.has(element.id)) prepared.updated.set(element.id, element);
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
	const applied = {
		named: prepared.namedIds.flatMap((id) => {
			const element = working.get(id);
			return element ? [element] : [];
		}),
		requested,
		...settled,
	};
	board.clear();
	for (const [id, element] of working) board.set(id, element);
	return applied;
}
