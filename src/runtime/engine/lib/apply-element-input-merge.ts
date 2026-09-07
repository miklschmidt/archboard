// Merging one input-spelling update onto the element the board already holds.

import { normalizeFontFamily, type ServerElement } from "@/runtime/engine/types";
import { remeasureLinear } from "@/runtime/engine/geometry";
import {
	type AgentElementInput,
	UpdateElementSchema,
} from "@/runtime/engine/lib/element-input-schema";
import {
	agentLabelIntentOf,
	spendArrowRefs,
	wellFormAgentStatement,
	withAgentLabelIntent,
} from "@/runtime/engine/lib/agent-element-input";
import { validatePersistedBoardElement } from "@/runtime/engine/lib/native-element";
import { isRecord } from "@/runtime/engine/lib/unknown-record";
import type { LegacyElementIngress } from "@/shared/board-elements";

/** The fields only a text element carries, dropped from anything else. */
const TEXT_ONLY_FIELDS = [
	"text",
	"originalText",
	"fontSize",
	"fontFamily",
	"textAlign",
	"verticalAlign",
	"autoResize",
	"lineHeight",
	"containerId",
];

/** The fields whose change means the element has to be settled again. */
const GEOMETRY_FIELDS = [
	"x",
	"y",
	"width",
	"height",
	"points",
	"angle",
	"textAlign",
	"verticalAlign",
];

/** The fields whose change means an arrow has to be routed again. */
const BINDING_FIELDS = ["start", "end", "startBinding", "endBinding"];

// Excalidraw's `<br>` spelling of a line break, which archboard writes as one.
// Two spellings of the same pattern: a global one to rewrite every occurrence,
// and a stateless one to ask whether the text has any.
const BR_MARKUP_ALL = /<\s*b\s*r\s*\/?\s*>/gi;
const BR_MARKUP = /<\s*b\s*r\s*\/?\s*>/i;

/**
 * Whether a key is the object's own, rather than something it inherited.
 * @param value The object.
 * @param key The key.
 * @returns True when the object states the key itself.
 */
const hasOwn = (value: object, key: PropertyKey): boolean =>
	Object.prototype.hasOwnProperty.call(value, key);

/**
 * A record a caller can read fields from, where the value is one.
 * @param value The value.
 * @returns The record, or an empty one.
 */
function recordOr(value: unknown): Record<string, unknown> {
	return isRecord(value) && !Array.isArray(value) ? value : {};
}

/**
 * Merge one `customData` value onto the one the board holds.
 *
 * Foreign keys are kept and archboard's own channel is replaced outright, so
 * another plugin's metadata survives a write that says nothing about it while
 * `customData.archboard` stays what the write said it is (ADR 0003).
 * @param existing What the board holds.
 * @param incoming What the write says.
 * @returns The merged value, or the incoming one when it is not a record.
 */
function mergeCustomData(existing: unknown, incoming: unknown): unknown {
	if (!isRecord(incoming) || Array.isArray(incoming)) {
		return incoming;
	}
	const { archboard: _currentSemantic, ...currentForeign } = recordOr(existing);
	return { ...currentForeign, ...incoming };
}

/**
 * Stamp an element as edited: when, and which edit of it this is.
 * @param element The element, stamped in place.
 * @param previous The element this replaces, whose version it counts from.
 * @param at When the edit happened.
 */
function bumpVersion(
	element: ServerElement,
	previous?: ServerElement,
	at = new Date().toISOString(),
): void {
	element.updatedAt = at;
	element.version = ((previous ?? element).version || 0) + 1;
}

/**
 * Text with Excalidraw's `<br>` markup written as the line breaks it means,
 * and runs of blank lines collapsed the way a render collapses them.
 * @param text The text as stored.
 * @returns The text as lines.
 */
function normalizeLineBreakMarkup(text: string): string {
	return text.replace(BR_MARKUP_ALL, "\n").replace(/\n{3,}/g, "\n\n");
}

interface ElementMerge {
	element: ServerElement;
	statement: LegacyElementIngress;
	geometryChanged: boolean;
	reboundArrow: boolean;
}

/**
 * Restate an element's width and height from its own path.
 * @param element The element, resized in place.
 * @returns True when the path could be measured.
 */
function sizeFromPath(element: ServerElement): boolean {
	const measured = remeasureLinear(element);
	if (!measured) {
		return false;
	}
	element.width = measured.width;
	element.height = measured.height;
	return true;
}

/**
 * The font family an update states, normalised, or the one the element has.
 * @param updates The update's fields.
 * @param existing The element the board holds.
 * @returns The font family number.
 */
function mergedFontFamily(
	updates: Record<string, unknown>,
	existing: Extract<ServerElement, { type: "text" }>,
): number | undefined {
	const named = updates["fontFamily"];
	if (named === undefined) {
		return existing.fontFamily;
	}
	return normalizeFontFamily(
		typeof named === "string" || typeof named === "number" ? named : undefined,
	);
}

/**
 * The element as the update leaves it, before validation: the board's own
 * element with the update's fields over it, the input-only aliases spent, and
 * the text fields dropped from anything that is not text.
 * @param existing The element the board holds.
 * @param updates The update's fields.
 * @param statement The well-formed statement, whose arrow refs are spent here.
 * @returns The candidate element.
 */
function mergedCandidate(
	existing: ServerElement,
	updates: Record<string, unknown>,
	statement: Record<string, unknown>,
): Record<string, unknown> {
	const candidate: Record<string, unknown> = { ...existing, ...updates };
	if (existing.type === "text") {
		candidate["fontFamily"] = mergedFontFamily(updates, existing);
	}
	if (hasOwn(updates, "customData")) {
		candidate["customData"] = mergeCustomData(existing.customData, updates["customData"]);
	}
	for (const alias of ["label", "start", "end"]) {
		delete candidate[alias];
	}
	spendArrowRefs(candidate, statement);
	if (existing.type !== "text") {
		for (const key of TEXT_ONLY_FIELDS) {
			delete candidate[key];
		}
	}
	return candidate;
}

/**
 * Restore the `<br>` markup a round trip flattened.
 *
 * A pane reports the text it renders, which has the markup already resolved
 * to line breaks. Writing that back would silently rewrite text a human
 * authored with `<br>` in it, so a write that says exactly what the stored
 * text renders as is read as the stored text saying it.
 * @param element The merged element, whose text may be restored in place.
 * @param existing The element the board holds.
 * @param incomingText The text the write states.
 */
function settleOriginalText(
	element: ServerElement,
	existing: ServerElement,
	incomingText: unknown,
): void {
	if (element.type !== "text") {
		return;
	}
	const restored = restoredMarkup(existing, incomingText);
	if (restored !== undefined) {
		element.text = restored;
		element.originalText = restored;
		return;
	}
	element.originalText = typeof incomingText === "string" ? incomingText : "";
}

/**
 * The stored text, as lines, when the write is only what that text renders as.
 * @param existing The element the board holds.
 * @param incomingText The text the write states.
 * @returns The restored text, or undefined when the write says something new.
 */
function restoredMarkup(existing: ServerElement, incomingText: unknown): string | undefined {
	if (existing.type !== "text" || !BR_MARKUP.test(existing.originalText)) {
		return undefined;
	}
	const normalizedOriginal = normalizeLineBreakMarkup(existing.originalText);
	const echoesStoredText = incomingText === normalizeLineBreakMarkup(existing.text);
	return echoesStoredText && normalizedOriginal !== "" ? normalizedOriginal : undefined;
}

/**
 * The statement the converter sees for a merged element: the element as it
 * now stands, with the write's own words over it, carrying the label the
 * agent asked for.
 * @param element The merged element.
 * @param statement The well-formed statement.
 * @param type The element's type, which an update may not change.
 * @returns The statement.
 */
function mergedStatementFor(
	element: ServerElement,
	statement: Record<string, unknown>,
	type: ServerElement["type"],
): LegacyElementIngress {
	const merged: Record<string, unknown> = { ...element, ...statement, type };
	if (element.customData !== undefined) {
		merged["customData"] = element.customData;
	}
	// The merged fields are the element's own and the statement's, both already
	// checked; `type` is restated from the element the board holds, and the
	// converter completes and validates the result before anything persists it.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- completed by the write-ingress converter
	const statementForConverter = merged as unknown as LegacyElementIngress;
	return withAgentLabelIntent(statementForConverter, agentLabelIntentOf(statement));
}

/**
 * Merge one agent update onto the element the board holds.
 * @param existing The element the board holds.
 * @param raw The write as the agent spelled it.
 * @returns The merged element, the statement the converter sees, and whether
 * the write moved the element or re-bound an arrow.
 * @throws {Error} When the update tries to change the element's type.
 */
function mergeElementUpdate(existing: ServerElement, raw: AgentElementInput): ElementMerge {
	const statement = wellFormAgentStatement(raw, existing.type);
	if (statement["type"] !== undefined && statement["type"] !== existing.type) {
		throw new Error(`Element ${existing.id} cannot change type from ${existing.type}`);
	}
	const parsed = UpdateElementSchema.parse({ ...statement, id: existing.id });
	const { board: _boardField, ...updates } = recordOr(parsed);
	const element = validatePersistedBoardElement(
		mergedCandidate(existing, updates, statement),
		`element update ${existing.id}`,
	);
	bumpVersion(element, existing);
	settleTextAndPath(element, existing, statement, updates);
	const isLinear = element.type === "arrow" || element.type === "line";
	return {
		element,
		statement: mergedStatementFor(element, statement, existing.type),
		geometryChanged: GEOMETRY_FIELDS.some((key) => hasOwn(statement, key)),
		reboundArrow: isLinear && BINDING_FIELDS.some((key) => hasOwn(statement, key)),
	};
}

/**
 * The two repairs a merged element needs from what the write said: a text
 * whose markup a round trip flattened, and a path whose size the new points
 * change.
 * @param element The merged element, repaired in place.
 * @param existing The element the board holds.
 * @param statement The well-formed statement.
 * @param updates The update's parsed fields.
 */
function settleTextAndPath(
	element: ServerElement,
	existing: ServerElement,
	statement: Record<string, unknown>,
	updates: Record<string, unknown>,
): void {
	if (hasOwn(statement, "text") && !hasOwn(statement, "originalText")) {
		settleOriginalText(element, existing, updates["text"] ?? "");
	}
	if (hasOwn(statement, "points")) {
		sizeFromPath(element);
	}
}

export {
	type ElementMerge,
	bumpVersion,
	hasOwn,
	mergeCustomData,
	mergeElementUpdate,
	sizeFromPath,
};
