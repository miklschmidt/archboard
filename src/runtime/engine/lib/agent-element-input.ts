// What an agent says, turned into something the write boundary can complete.
//
// An agent writes in the spellings that read well in a sentence: `label`,
// `start`, `end`, `startElementId`. Those are input spellings, spent here on
// the way in and never persisted (ADR 0015). What comes out is one ingress
// statement, still deliberately incomplete: the converter at the write
// boundary fills in the native defaults.

import {
	DEFAULT_FILL_STYLE,
	DEFAULT_SHAPE_BACKGROUND,
	FILLABLE_TYPES,
} from "@/shared/appearance/appearance";
import { mintId } from "@/shared/ids/ids";
import type { LegacyElementIngress } from "@/shared/board-elements";
import { bindingFromRef } from "@/runtime/engine/arrow-binding";
import { DEFAULT_LINEAR_POINTS } from "@/runtime/engine/geometry";
import { EXCALIDRAW_ELEMENT_TYPES, normalizeFontFamily } from "@/runtime/engine/types";
import { stripUntrustedTrackingClaims } from "@/runtime/engine/metadata";
import { CreateElementSchema } from "@/runtime/engine/lib/element-input-schema";
import type { AgentElementInput } from "@/runtime/engine/lib/element-input-schema";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

/**
 * Whether a key is the object's own, rather than something it inherits.
 *
 * The distinction matters here: an agent that states `label: null` means
 * something different from one that never mentioned a label at all.
 * @param value The object.
 * @param key The key.
 * @returns True when the object states it itself.
 */
const hasOwn = (value: object, key: PropertyKey): boolean =>
	Object.prototype.hasOwnProperty.call(value, key);

const agentLabelIntent = Symbol("archboard.agent-label-intent");

/** One agent statement, carrying the label it asked for out of band. */
type AgentElementStatement = LegacyElementIngress & {
	readonly [agentLabelIntent]?: string;
};

/**
 * Carry the label an agent asked for alongside the statement, where the write
 * boundary will spend it.
 *
 * A non-text shape has no `text` of its own, so the label cannot travel as a
 * field: it becomes a bound text element later. This private, non-enumerable
 * symbol keeps it off everything that serializes the statement.
 * @param value The statement.
 * @param label What the agent said the shape should say, if anything.
 * @returns The same statement.
 */
function withAgentLabelIntent<T extends object>(value: T, label: unknown): T {
	if (typeof label === "string") {
		Object.defineProperty(value, agentLabelIntent, { value: label, enumerable: false });
	}
	return value;
}

/**
 * Read the private label intent spent and owned by this named ingress.
 * @param value The statement.
 * @returns The label, or undefined when none was carried.
 */
function agentLabelIntentOf(value: object): string | undefined {
	const intent: unknown = Reflect.get(value, agentLabelIntent);
	return typeof intent === "string" ? intent : undefined;
}

/**
 * The x and y a stated point carries, in either spelling: a pair, or an object
 * with named coordinates.
 * @param point One stated point.
 * @returns Its coordinates, unvalidated.
 */
function pointCoordinates(point: unknown): { x: unknown; y: unknown } {
	if (Array.isArray(point)) {
		return { x: point[0], y: point[1] };
	}
	if (!isRecord(point)) {
		return { x: undefined, y: undefined };
	}
	return { x: point["x"], y: point["y"] };
}

/**
 * A coordinate, when it is one a shape can actually be drawn at.
 * @param value The stated coordinate.
 * @returns The number, or undefined when it is not a finite one.
 */
function finiteNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * A connector's path in the one spelling the board stores, pairs of numbers.
 *
 * Anything this cannot read is handed back untouched, so the schema below
 * refuses it with its own message rather than this quietly dropping a path.
 * @param points What the agent stated.
 * @returns The pairs, or the original value.
 */
function normalizePoints(points: unknown): unknown {
	if (!Array.isArray(points)) {
		return points;
	}
	const normalized: [number, number][] = [];
	for (const point of points) {
		const { x, y } = pointCoordinates(point);
		const px = finiteNumber(x);
		const py = finiteNumber(y);
		if (px === undefined || py === undefined) {
			return points;
		}
		normalized.push([px, py]);
	}
	return normalized;
}

/**
 * Spend the flat `startElementId` and `endElementId` spellings, which say the
 * same thing as `start` and `end` and are easier to type.
 * @param statement The statement, edited in place.
 */
function spendElementRefAliases(statement: Record<string, unknown>): void {
	for (const [alias, ref] of [
		["startElementId", "start"],
		["endElementId", "end"],
	] as const) {
		if (hasOwn(statement, alias)) {
			const id = statement[alias];
			statement[ref] = typeof id === "string" && id ? { id } : null;
		}
		delete statement[alias];
	}
}

/**
 * Take the label off a non-text shape and carry it out of band.
 *
 * `label: {text}` and the bare `text` shorthand both name what the shape
 * should say; on a shape that is not itself text, saying it means creating a
 * bound text element, which is the write boundary's job.
 * @param statement The statement, edited in place.
 */
function foldLabelIntent(statement: Record<string, unknown>): void {
	const label = statement["label"];
	const labelText = isRecord(label) && !Array.isArray(label) ? label["text"] : undefined;
	const text = statement["text"];
	delete statement["label"];
	delete statement["text"];
	withAgentLabelIntent(statement, typeof labelText === "string" ? labelText : text);
}

/**
 * One binding reduced to the fields the board keeps, with `fixedPoint` present
 * only where the agent stated it.
 * @param value The stated binding.
 * @returns The binding.
 */
function canonicalBinding(value: Record<string, unknown>): Record<string, unknown> {
	return {
		elementId: value["elementId"],
		focus: value["focus"],
		gap: value["gap"],
		...(hasOwn(value, "fixedPoint") ? { fixedPoint: value["fixedPoint"] } : {}),
	};
}

/**
 * Reduce whatever was stated as a binding to the fields the board keeps.
 * @param statement The statement, edited in place.
 */
function normalizeBindings(statement: Record<string, unknown>): void {
	for (const key of ["startBinding", "endBinding"] as const) {
		const value = statement[key];
		if (!hasOwn(statement, key) || !isRecord(value) || Array.isArray(value)) {
			continue;
		}
		statement[key] = canonicalBinding(value);
	}
}

/**
 * Spend public aliases before the native completion boundary.
 * @param raw What the agent stated.
 * @param existingType The type the element already has, when this is an update
 * that did not restate it.
 * @returns The statement, in the spellings the schema and converter expect.
 */
function wellFormAgentStatement(
	raw: Record<string, unknown>,
	existingType?: string,
): Record<string, unknown> {
	const statement = stripUntrustedTrackingClaims(raw);
	if (hasOwn(statement, "points")) {
		statement["points"] = normalizePoints(statement["points"]);
	}
	spendElementRefAliases(statement);
	const type = typeof statement["type"] === "string" ? statement["type"] : existingType;
	if (type !== EXCALIDRAW_ELEMENT_TYPES["TEXT"]) {
		foldLabelIntent(statement);
	}
	normalizeBindings(statement);
	return statement;
}

/**
 * Spend `start` and `end` on a connector, turning each into the binding the
 * board stores. Both the element and the caller's own copy are updated, so
 * neither still carries the input spelling.
 * @param element The element being built, edited in place.
 * @param stated The caller's parameters, edited in place.
 */
function spendArrowRefs(element: Record<string, unknown>, stated: Record<string, unknown>): void {
	if (element["type"] !== "arrow" && element["type"] !== "line") {
		return;
	}
	for (const [ref, binding] of [
		["start", "startBinding"],
		["end", "endBinding"],
	] as const) {
		const said = hasOwn(stated, ref);
		const value = stated[ref];
		delete element[ref];
		delete stated[ref];
		if (said) {
			const normalized = bindingFromRef(value);
			element[binding] = normalized;
			stated[binding] = normalized;
		}
	}
}

/**
 * Whether a stated type is one of the two that are drawn as a path.
 * @param type The stated type.
 * @returns True for an arrow or a line.
 */
function isLinearType(type: unknown): boolean {
	return type === "arrow" || type === "line";
}

/**
 * Give a connector a default path when the agent named its ends but not its
 * shape, which is the common case: "draw an arrow from A to B" says nothing
 * about where the line goes, and routing decides that afterwards.
 * @param element The element being built, edited in place.
 */
function completeLinearPoints(element: Record<string, unknown>): void {
	const statedEnds = element["start"] !== undefined || element["end"] !== undefined;
	if (!isLinearType(element["type"]) || !statedEnds || Array.isArray(element["points"])) {
		return;
	}
	element["points"] = DEFAULT_LINEAR_POINTS.map((point) => point.slice());
}

/**
 * Give a fillable shape the neutral default background, so that a shape
 * nobody chose a colour for is still selectable by its interior.
 * @param element The element being built, edited in place.
 */
function applyDefaultFill(element: Record<string, unknown>): void {
	const type = element["type"];
	if (typeof type !== "string" || !FILLABLE_TYPES.has(type)) {
		return;
	}
	if (element["backgroundColor"] !== undefined) {
		return;
	}
	element["backgroundColor"] = DEFAULT_SHAPE_BACKGROUND;
	element["fillStyle"] ??= DEFAULT_FILL_STYLE;
}

/** The ids already spoken for, so that a minted one is free. */
interface TakenIds {
	has(id: string): boolean;
}

/**
 * The finished statement in the type the write boundary consumes.
 *
 * LegacyElementIngress is the deliberately incomplete ingress type: every
 * field present here came through CreateElementSchema, and the converter at
 * the write boundary completes the native rest.
 * @param element The element as it was built.
 * @returns The same object, named as a statement.
 */
function asIngressStatement(element: Record<string, unknown>): AgentElementStatement {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema validated these fields and the write-boundary converter completes the rest
	return element as unknown as AgentElementStatement;
}

/**
 * One agent statement as an ingress element: validated, given an id and
 * timestamps, with every input spelling spent.
 * @param raw What the agent stated.
 * @param inUse The ids already taken, so a minted one is free.
 * @returns The statement for the write boundary to complete.
 */
function buildAgentElement(raw: AgentElementInput, inUse: TakenIds): AgentElementStatement {
	const statement = wellFormAgentStatement(raw);
	const params = CreateElementSchema.parse(statement);
	// `board` names which board this goes on, which is the route's business
	// rather than the element's.
	const elementParams: Record<string, unknown> = { ...params };
	delete elementParams["board"];
	const now = new Date().toISOString();
	const element: Record<string, unknown> = {
		id: params.id || mintId(inUse),
		...elementParams,
		fontFamily: normalizeFontFamily(params.fontFamily),
		createdAt: now,
		updatedAt: now,
		version: 1,
	};
	completeLinearPoints(element);
	applyDefaultFill(element);
	spendArrowRefs(element, elementParams);
	return asIngressStatement(withAgentLabelIntent(element, agentLabelIntentOf(statement)));
}

export {
	type AgentElementStatement,
	withAgentLabelIntent,
	agentLabelIntentOf,
	wellFormAgentStatement,
	spendArrowRefs,
	buildAgentElement,
};
