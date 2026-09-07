// Expanding an input `label` into the bound text element Excalidraw draws.

import {
	DEFAULT_FONT_SIZE,
	DEFAULT_STROKE_WIDTH,
	type Stamps,
	fontFamilyOf,
	sizeText,
} from "@/runtime/engine/lib/expand-elements-completion";
import { isRecord } from "@/runtime/engine/lib/unknown-record";
import { type LabelledElement, boundTextPlacement, labelTextIdFor } from "@/runtime/engine/labels";
import { lineHeightOf } from "@/runtime/engine/fonts";
import { BOARD_ELEMENT_TYPES, type LegacyElementIngress } from "@/shared/board-elements";
import type { IdsInUse } from "@/shared/ids/ids";

/** What one conversion knows while it expands labels. */
interface LabelContext {
	/** Whether the elements are bound for the board's own map. */
	readonly forStore: boolean;
	/** Every element in the write, for checking a bound text is among them. */
	readonly sourceElements: readonly LegacyElementIngress[];
	/** Ids the scene spends, extended with every label minted. */
	readonly named: Set<string>;
	/** Ids in use here and elsewhere on the board. */
	readonly taken: IdsInUse;
	/** The conversion's stamps. */
	readonly stamps: Stamps;
	/** Expanded labels, appended after their containers. */
	readonly boundTextElements: Record<string, unknown>[];
}

const ELEMENT_TYPES = new Set<string>(BOARD_ELEMENT_TYPES);

/**
 * Whether a record has the identity the label module reasons about: a string
 * id and a board element type. Everything else it reads is optional.
 * @param record The element.
 * @returns True when the record is a `LabelledElement`.
 */
function isLabelled(record: Record<string, unknown>): record is LabelledElement {
	return (
		typeof record["id"] === "string" &&
		typeof record["type"] === "string" &&
		ELEMENT_TYPES.has(record["type"])
	);
}

/**
 * Whether a bound-element entry names a text element the conversion can
 * trust: for the store, any text ref; for a document, only one the write
 * itself carries.
 * @param binding The entry.
 * @param context The conversion.
 * @returns True when the container already has a label.
 */
function isTrustedTextRef(binding: unknown, context: LabelContext): boolean {
	if (!isRecord(binding) || binding["type"] !== "text" || typeof binding["id"] !== "string") {
		return false;
	}
	const id = binding["id"];
	return (
		context.forStore ||
		context.sourceElements.some((other) => other.id === id && other.type === "text")
	);
}

/**
 * Whether a container's `boundElements` already names a label.
 * @param base The container.
 * @param context The conversion.
 * @returns True when no label needs expanding.
 */
function hasBoundText(base: Record<string, unknown>, context: LabelContext): boolean {
	const bound = base["boundElements"];
	return (
		Array.isArray(bound) && bound.some((binding: unknown) => isTrustedTextRef(binding, context))
	);
}

/**
 * The text element for a label, positioned at its container until placed.
 * @param textId The minted id.
 * @param el The container as written.
 * @param base The completed container.
 * @param rest The container's input fields.
 * @param labelText The label's text.
 * @param context The conversion.
 * @returns The text element.
 */
function labelElementFor(
	textId: string,
	el: LegacyElementIngress,
	base: Record<string, unknown>,
	rest: Record<string, unknown>,
	labelText: unknown,
	context: LabelContext,
): Record<string, unknown> {
	const isArrow = el.type === "arrow" || el.type === "line";
	const fontSize = typeof rest["fontSize"] === "number" ? rest["fontSize"] : DEFAULT_FONT_SIZE;
	const fontFamily = fontFamilyOf(rest);
	return {
		id: textId,
		type: "text",
		x: base["x"],
		y: base["y"],
		width: 0,
		height: 0,
		angle: 0,
		strokeColor: isArrow ? "#1e1e1e" : base["strokeColor"],
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: DEFAULT_STROKE_WIDTH,
		strokeStyle: "solid",
		roughness: 1,
		opacity: 100,
		groupIds: [],
		frameId: null,
		roundness: null,
		seed: context.stamps.seedFor(`${textId}:seed`),
		version: 1,
		versionNonce: context.stamps.seedFor(`${textId}:nonce`),
		index: null,
		isDeleted: false,
		boundElements: null,
		updated: context.stamps.updatedFor(Object.fromEntries(Object.entries(el))),
		link: null,
		locked: false,
		text: labelText,
		originalText: labelText,
		fontSize,
		fontFamily,
		textAlign: "center",
		verticalAlign: "middle",
		autoResize: true,
		lineHeight: lineHeightOf(fontFamily),
		containerId: base["id"],
	};
}

/**
 * Expand a container's label into a bound text element, unless it already has
 * one: bind it, size it, place it and queue it after the containers.
 * @param el The container as written.
 * @param base The completed container, whose `boundElements` gains the label.
 * @param rest The container's input fields.
 * @param labelText The label's text, when the input carried one.
 * @param context The conversion.
 */
function appendLabel(
	el: LegacyElementIngress,
	base: Record<string, unknown>,
	rest: Record<string, unknown>,
	labelText: unknown,
	context: LabelContext,
): void {
	if (!labelText || hasBoundText(base, context)) {
		return;
	}
	const textId = labelTextIdFor(String(base["id"]), context.taken);
	context.named.add(textId);
	base["boundElements"] = [
		...(Array.isArray(base["boundElements"]) ? base["boundElements"] : []),
		{ type: "text", id: textId },
	];
	const labelElement = labelElementFor(textId, el, base, rest, labelText, context);
	sizeText(labelElement);
	placeLabel(base, labelElement);
	context.boundTextElements.push(labelElement);
}

/**
 * Move a sized label to where its container anchors it.
 * @param base The container.
 * @param labelElement The label, moved in place.
 */
function placeLabel(base: Record<string, unknown>, labelElement: Record<string, unknown>): void {
	if (!isLabelled(base) || !isLabelled(labelElement)) {
		return;
	}
	const placement = boundTextPlacement(base, labelElement);
	if (placement) {
		labelElement["x"] = placement.x;
		labelElement["y"] = placement.y;
	}
}

export { type LabelContext, appendLabel };
