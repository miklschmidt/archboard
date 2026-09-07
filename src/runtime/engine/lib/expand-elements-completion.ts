// Completing one input element with Excalidraw's own defaults, from its own
// bundle rather than from anything's output: `DEFAULT_ELEMENT_PROPS` for the
// shared properties, `AppState` for what a freshly drawn element gets.

import { BOUND_ARROW_GAP } from "@/runtime/engine/arrow-binding";
import { lineHeightOf } from "@/runtime/engine/fonts";
import { DEFAULT_LINEAR_POINTS, measureLinear } from "@/runtime/engine/geometry";
import { isRecord, stringAt } from "@/runtime/engine/lib/unknown-record";
import { canMeasure, measureText } from "@/runtime/engine/measure-text";
import { normalizeFontFamily } from "@/runtime/engine/types";
import { fnv1a } from "@/shared/ids/ids";

const DEFAULT_FONT_FAMILY = 5; // Excalifont. Virgil, our old default, is deprecated.
const DEFAULT_FONT_SIZE = 20;
const DEFAULT_TEXT_ALIGN = "left"; // for a standalone text; a bound one is centred
const DEFAULT_VERTICAL_ALIGN = "top";
const DEFAULT_STROKE_WIDTH = 2;

/** Where seeds, nonces and `updated` timestamps come from during one conversion. */
interface Stamps {
	/** A seed or nonce for one key. */
	seedFor: (key: string) => number;
	/** The `updated` timestamp for one element. */
	updatedFor: (el: Record<string, unknown>) => number;
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
	const focus = value["focus"] ?? 0;
	const gap = value["gap"] ?? BOUND_ARROW_GAP;
	return elbowed
		? { elementId: value["elementId"], fixedPoint: value["fixedPoint"], focus, gap }
		: { elementId: value["elementId"], focus, gap };
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
 * The fields an elbowed arrow carries beyond a straight one.
 * @param base The element being completed.
 * @param rest The input fields.
 */
function completeElbowedFields(base: Record<string, unknown>, rest: Record<string, unknown>): void {
	base["fixedSegments"] = rest["fixedSegments"] ?? null;
	base["startIsSpecial"] = rest["startIsSpecial"] ?? null;
	base["endIsSpecial"] = rest["endIsSpecial"] ?? null;
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
	base["startBinding"] =
		rest["startBinding"] !== undefined ? completeBinding(rest["startBinding"], elbowed) : null;
	base["endBinding"] =
		rest["endBinding"] !== undefined ? completeBinding(rest["endBinding"], elbowed) : null;
	base["startArrowhead"] = rest["startArrowhead"] ?? null;
	base["endArrowhead"] = rest["endArrowhead"] ?? (type === "arrow" ? "arrow" : null);
	if (type !== "arrow") {
		return;
	}
	base["elbowed"] = elbowed;
	if (elbowed) {
		completeElbowedFields(base, rest);
	}
}

/**
 * Freedraw carries a stroke's own record of how it was drawn. A user-drawn
 * one always has these; one an agent wrote had none, so the browser filled
 * them in on a server update and the note never learned.
 * @param base The element being completed.
 * @param rest The input fields.
 */
function completeFreedrawFields(base: Record<string, unknown>, rest: Record<string, unknown>): void {
	base["points"] = rest["points"] ?? [];
	measurePoints(base);
	base["pressures"] = rest["pressures"] ?? [];
	base["simulatePressure"] = rest["simulatePressure"] ?? true;
	base["lastCommittedPoint"] = rest["lastCommittedPoint"] ?? null;
}

/**
 * The fields an image element carries.
 * @param base The element being completed.
 * @param rest The input fields.
 */
function completeImageFields(base: Record<string, unknown>, rest: Record<string, unknown>): void {
	base["fileId"] = rest["fileId"] ?? null;
	base["status"] = rest["status"] ?? "pending";
	base["scale"] = rest["scale"] ?? [1, 1];
	base["crop"] = rest["crop"] ?? null;
}

/**
 * The numeric font family an input names, or the default.
 * @param rest The input fields.
 * @returns The font family number.
 */
function fontFamilyOf(rest: Record<string, unknown>): number {
	const named = rest["fontFamily"];
	return (
		normalizeFontFamily(typeof named === "string" || typeof named === "number" ? named : undefined) ??
		DEFAULT_FONT_FAMILY
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
	base["textAlign"] = rest["textAlign"] ?? DEFAULT_TEXT_ALIGN;
	base["verticalAlign"] = rest["verticalAlign"] ?? DEFAULT_VERTICAL_ALIGN;
	base["autoResize"] = rest["autoResize"] ?? true;
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
	return {
		...rest,
		angle: rest["angle"] ?? 0,
		strokeColor: rest["strokeColor"] ?? "#1e1e1e",
		backgroundColor: rest["backgroundColor"] ?? "transparent",
		fillStyle: rest["fillStyle"] ?? "solid",
		strokeWidth: rest["strokeWidth"] ?? DEFAULT_STROKE_WIDTH,
		strokeStyle: rest["strokeStyle"] ?? "solid",
		roughness: rest["roughness"] ?? 1,
		opacity: rest["opacity"] ?? 100,
		groupIds: rest["groupIds"] ?? [],
		frameId: rest["frameId"] ?? null,
		// Rounded, because `currentItemRoundness` is `round` and a box a human
		// draws is rounded. `convertToExcalidrawElements` produced `null` here,
		// which is that converter declining to choose rather than Excalidraw
		// wanting square corners, and adopting it would have made every
		// agent-drawn box differ from every user-drawn one.
		roundness: rest["roundness"] ?? (isRoundedShape(el["type"]) ? { type: 3 } : null),
		seed: rest["seed"] ?? stamps.seedFor(`${id}:seed`),
		version: rest["version"] ?? 1,
		versionNonce: rest["versionNonce"] ?? stamps.seedFor(`${id}:nonce`),
		index: rest["index"] ?? null,
		isDeleted: rest["isDeleted"] ?? false,
		boundElements: rest["boundElements"] ?? null,
		updated: stamps.updatedFor(el),
		link: rest["link"] ?? null,
		locked: rest["locked"] ?? false,
	};
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
	const fontFamily =
		typeof element["fontFamily"] === "number" ? element["fontFamily"] : DEFAULT_FONT_FAMILY;
	if (!canMeasure(fontFamily)) {
		return;
	}
	const fontSize = typeof element["fontSize"] === "number" ? element["fontSize"] : DEFAULT_FONT_SIZE;
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
