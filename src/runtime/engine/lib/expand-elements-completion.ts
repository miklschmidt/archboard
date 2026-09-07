// Completing one input element with Excalidraw's own defaults, from its own
// bundle rather than from anything's output: `DEFAULT_ELEMENT_PROPS` for the
// shared properties, `AppState` for what a freshly drawn element gets.

import { BOUND_ARROW_GAP } from "@/runtime/engine/arrow-binding";
import { lineHeightOf } from "@/runtime/engine/fonts";
import { DEFAULT_LINEAR_POINTS, measureLinear } from "@/runtime/engine/geometry";
import { isRecord, numberAt, stringAt } from "@/runtime/engine/lib/unknown-record";
import { canMeasure, measureText } from "@/runtime/engine/measure-text";
import { normalizeFontFamily } from "@/runtime/engine/types";
import { fnv1a } from "@/shared/ids/ids";

const DEFAULT_FONT_FAMILY = 5; // Excalifont. Virgil, our old default, is deprecated.
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_TEXT_ALIGN = "left"; // for a standalone text; a bound one is centred
const DEFAULT_VERTICAL_ALIGN = "top";
const DEFAULT_STROKE_WIDTH = 2;

/** An ordered list of keys and the value each takes when the input left it out. */
type Defaults = ReadonlyArray<readonly [key: string, fallback: unknown]>;

/** Where seeds, nonces and `updated` timestamps come from during one conversion. */
interface Stamps {
	/** A seed or nonce for one key. */
	seedFor: (key: string) => number;
	/** The `updated` timestamp for one element. */
	updatedFor: (el: Record<string, unknown>) => number;
}

/**
 * Set each defaulted key on the element, in order, from the input or the
 * fallback. Sequential assignment keeps the key order a spread would give.
 * @param base The element being completed.
 * @param rest The input fields.
 * @param defaults The keys and fallbacks.
 */
function applyDefaults(
	base: Record<string, unknown>,
	rest: Record<string, unknown>,
	defaults: Defaults,
): void {
	for (const [key, fallback] of defaults) {
		base[key] = rest[key] ?? fallback;
	}
}

/**
 * The timestamp text an element carries, for `Date.parse`.
 * @param el The element.
 * @returns `updatedAt`, else `createdAt`, else "", when they are strings or numbers.
 */
function timestampText(el: Record<string, unknown>): string {
	for (const key of ["updatedAt", "createdAt"]) {
		const value = el[key];
		if (typeof value === "string" || typeof value === "number") {
			return String(value);
		}
	}
	return "";
}

/**
 * The stamps for one conversion. Deterministic ones derive seeds, nonces and
 * `updated` from element ids and updatedAt instead of Math.random() and
 * Date.now(), so repeated exports of an unchanged scene are byte-identical
 * (keeps committed .excalidraw files diff-clean).
 * @param deterministic Whether stamps derive from the elements.
 * @returns The stamps.
 */
function stampsFor(deterministic: boolean): Stamps {
	return {
		/**
		 * A seed for one key.
		 * @param key The key to derive from.
		 * @returns The seed.
		 */
		seedFor: (key: string): number =>
			deterministic ? (fnv1a(key) % 2147483646) + 1 : Math.floor(Math.random() * 2147483647),
		/**
		 * The `updated` timestamp for one element. Prefers a preserved `updated`
		 * (re-imported scene) over the server's updatedAt, so no-op
		 * import→export cycles are byte-identical.
		 * @param el The element.
		 * @returns The timestamp.
		 */
		updatedFor: (el: Record<string, unknown>): number => {
			if (!deterministic) {
				return Date.now();
			}
			if (typeof el["updated"] === "number") {
				return el["updated"];
			}
			const parsed = Date.parse(timestampText(el));
			return Number.isNaN(parsed) ? 1 : parsed;
		},
	};
}

/**
 * The binding fields a straight arrow keeps.
 * @param value The binding as written.
 * @returns The completed binding.
 */
function straightBinding(value: Record<string, unknown>): Record<string, unknown> {
	return {
		elementId: value["elementId"],
		focus: value["focus"] ?? 0,
		gap: value["gap"] ?? BOUND_ARROW_GAP,
	};
}

/**
 * The binding fields an elbowed arrow keeps, `fixedPoint` included.
 * @param value The binding as written.
 * @returns The completed binding.
 */
function elbowedBinding(value: Record<string, unknown>): Record<string, unknown> {
	return {
		elementId: value["elementId"],
		fixedPoint: value["fixedPoint"],
		focus: value["focus"] ?? 0,
		gap: value["gap"] ?? BOUND_ARROW_GAP,
	};
}

/**
 * Complete one input binding without carrying input-only or unknown keys into
 * the board.
 * @param value The binding as written.
 * @param elbowed Whether the arrow is elbowed, which keeps `fixedPoint`.
 * @returns The completed binding, or null for none.
 */
function completeBinding(value: unknown, elbowed: boolean): Record<string, unknown> | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (!isRecord(value) || Array.isArray(value)) {
		return { value };
	}
	return elbowed ? elbowedBinding(value) : straightBinding(value);
}

/**
 * Restate an element's width and height from its points, when they measure.
 * @param base The element being completed.
 */
function measurePoints(base: Record<string, unknown>): void {
	const measured = measureLinear(base["points"]);
	if (measured) {
		base["width"] = measured.width;
		base["height"] = measured.height;
	}
}

/**
 * Complete both ends of an arrow or line from the bindings the input names.
 * @param base The element being completed.
 * @param rest The input fields.
 * @param elbowed Whether the arrow is elbowed.
 */
function completeBindings(
	base: Record<string, unknown>,
	rest: Record<string, unknown>,
	elbowed: boolean,
): void {
	base["startBinding"] =
		rest["startBinding"] !== undefined ? completeBinding(rest["startBinding"], elbowed) : null;
	base["endBinding"] =
		rest["endBinding"] !== undefined ? completeBinding(rest["endBinding"], elbowed) : null;
}

/**
 * Complete an arrow or line: its points and their measure, its bindings and
 * arrowheads, and the elbow fields an elbowed arrow carries.
 * @param base The element being completed.
 * @param rest The input fields.
 * @param type Whether it is an arrow or a line.
 */
function completeLinearFields(
	base: Record<string, unknown>,
	rest: Record<string, unknown>,
	type: "arrow" | "line",
): void {
	const elbowed = type === "arrow" && rest["elbowed"] === true;
	base["points"] = rest["points"] ?? DEFAULT_LINEAR_POINTS.map((point) => point.slice());
	measurePoints(base);
	base["lastCommittedPoint"] = null;
	completeBindings(base, rest, elbowed);
	applyDefaults(base, rest, [
		["startArrowhead", null],
		["endArrowhead", type === "arrow" ? "arrow" : null],
	]);
	if (type !== "arrow") {
		return;
	}
	base["elbowed"] = elbowed;
	if (elbowed) {
		applyDefaults(base, rest, [
			["fixedSegments", null],
			["startIsSpecial", null],
			["endIsSpecial", null],
		]);
	}
}

/**
 * Freedraw carries a stroke's own record of how it was drawn. A user-drawn
 * one always has these; one an agent wrote had none, so the browser filled
 * them in on a server update and the note never learned.
 * @param base The element being completed.
 * @param rest The input fields.
 */
function completeFreedrawFields(
	base: Record<string, unknown>,
	rest: Record<string, unknown>,
): void {
	base["points"] = rest["points"] ?? [];
	measurePoints(base);
	applyDefaults(base, rest, [
		["pressures", []],
		["simulatePressure", true],
		["lastCommittedPoint", null],
	]);
}

/**
 * The fields an image element carries.
 * @param base The element being completed.
 * @param rest The input fields.
 */
function completeImageFields(base: Record<string, unknown>, rest: Record<string, unknown>): void {
	applyDefaults(base, rest, [
		["fileId", null],
		["status", "pending"],
		["scale", [1, 1]],
		["crop", null],
	]);
}

/**
 * The numeric font family an input names, or the default.
 * @param rest The input fields.
 * @returns The font family number.
 */
function fontFamilyOf(rest: Record<string, unknown>): number {
	const named = rest["fontFamily"];
	return (
		normalizeFontFamily(
			typeof named === "string" || typeof named === "number" ? named : undefined,
		) ?? DEFAULT_FONT_FAMILY
	);
}

/**
 * Complete a standalone text element: its text and typography, then its
 * measured size.
 * @param base The element being completed.
 * @param rest The input fields.
 */
function completeTextFields(base: Record<string, unknown>, rest: Record<string, unknown>): void {
	base["text"] = rest["text"] ?? "";
	base["originalText"] = rest["originalText"] ?? base["text"];
	base["fontSize"] = rest["fontSize"] ?? DEFAULT_FONT_SIZE;
	const fontFamily = fontFamilyOf(rest);
	base["fontFamily"] = fontFamily;
	applyDefaults(base, rest, [
		["textAlign", DEFAULT_TEXT_ALIGN],
		["verticalAlign", DEFAULT_VERTICAL_ALIGN],
		["autoResize", true],
	]);
	base["lineHeight"] =
		typeof rest["lineHeight"] === "number" ? rest["lineHeight"] : lineHeightOf(fontFamily);
	base["containerId"] = rest["containerId"] ?? null;
	sizeText(base);
}

/**
 * Whether a type is a shape Excalidraw draws with rounded corners by default.
 * @param type The element type.
 * @returns True for rectangle, diamond and ellipse.
 */
function isRoundedShape(type: unknown): boolean {
	return type === "rectangle" || type === "diamond" || type === "ellipse";
}

/**
 * The element's shared properties, each defaulted where the input left it
 * out.
 * @param el The input element with its server fields.
 * @param rest The input fields without the server fields.
 * @param stamps The conversion's stamps.
 * @returns The completed base element.
 */
function makeBaseElement(
	el: Record<string, unknown>,
	rest: Record<string, unknown>,
	stamps: Stamps,
): Record<string, unknown> {
	const id = String(el["id"]);
	const base: Record<string, unknown> = { ...rest };
	applyDefaults(base, rest, [
		["angle", 0],
		["strokeColor", "#1e1e1e"],
		["backgroundColor", "transparent"],
		["fillStyle", "solid"],
		["strokeWidth", DEFAULT_STROKE_WIDTH],
		["strokeStyle", "solid"],
		["roughness", 1],
		["opacity", 100],
		["groupIds", []],
		["frameId", null],
		// Rounded, because `currentItemRoundness` is `round` and a box a human
		// draws is rounded. `convertToExcalidrawElements` produced `null` here,
		// which is that converter declining to choose rather than Excalidraw
		// wanting square corners, and adopting it would have made every
		// agent-drawn box differ from every user-drawn one.
		["roundness", isRoundedShape(el["type"]) ? { type: 3 } : null],
		["seed", stamps.seedFor(`${id}:seed`)],
		["version", 1],
		["versionNonce", stamps.seedFor(`${id}:nonce`)],
		["index", null],
		["isDeleted", false],
		["boundElements", null],
	]);
	base["updated"] = stamps.updatedFor(el);
	applyDefaults(base, rest, [
		["link", null],
		["locked", false],
	]);
	return base;
}

/**
 * A text element's size, which is a measurement and not an opinion.
 *
 * Excalidraw's width for a piece of text is exactly what the browser's
 * `measureText` returns and its height is `fontSize * lineHeight * lineCount`,
 * so whatever a caller sent alongside the text is the last text's size — the
 * same reasoning that made the server restate an arrow's width and height
 * every time it writes a path (TASK-038).
 *
 * Two exceptions. `autoResize: false` is the one case where Excalidraw lets a
 * text keep a width its glyphs do not imply, because a human dragged it there.
 * And a family that ships no file — Helvetica resolves to whatever the
 * viewer's system calls Helvetica — has no honest server-side width at all, so
 * whatever the element carries is left alone.
 * @param element The text element, resized in place.
 */
function sizeText(element: Record<string, unknown>): void {
	if (element["autoResize"] === false) {
		return;
	}
	const fontFamily = numberAt(element, "fontFamily", DEFAULT_FONT_FAMILY);
	if (!canMeasure(fontFamily)) {
		return;
	}
	const fontSize = numberAt(element, "fontSize", DEFAULT_FONT_SIZE);
	const lineHeight = typeof element["lineHeight"] === "number" ? element["lineHeight"] : undefined;
	const measured = measureText(stringAt(element, "text") ?? "", fontSize, fontFamily, lineHeight);
	element["width"] = measured.width;
	element["height"] = measured.height;
}

export {
	DEFAULT_FONT_SIZE,
	DEFAULT_STROKE_WIDTH,
	type Stamps,
	completeFreedrawFields,
	completeImageFields,
	completeLinearFields,
	completeTextFields,
	fontFamilyOf,
	makeBaseElement,
	sizeText,
	stampsFor,
};
