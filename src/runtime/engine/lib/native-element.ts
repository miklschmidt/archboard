import {
	BOARD_ELEMENT_TYPES,
	type PersistedBoardElement,
	type RuntimeBoardElement,
} from "@/shared/board-elements";
import { buildValidatedElement } from "@/runtime/engine/lib/native-element-builders";
import {
	NativeElementValidationError,
	fail,
	recordAt,
} from "@/runtime/engine/lib/native-element-validation";

const TYPES = new Set<string>(BOARD_ELEMENT_TYPES);

/**
 * The input-only spellings an agent may write and a note may not hold: each
 * is spent at the write boundary, so one here means something converted on
 * the way out (ADR 0015).
 */
const INPUT_ONLY_ALIASES = ["label", "start", "end", "startElementId", "endElementId"];

/**
 * Whether a type names an element a board may hold.
 * @param type The type as stored.
 * @returns True when it is one.
 */
function isBoardElementType(type: string | undefined): type is PersistedBoardElement["type"] {
	return type !== undefined && TYPES.has(type);
}

/**
 * Refuse a record carrying a field the element's type may not hold: an input
 * spelling, a `rawText` on anything but a text, or an `elbowed` on a line.
 * @param initial The element as stored.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @throws {NativeElementValidationError} When it carries one.
 */
function refuseForeignFields(
	initial: Record<string, unknown>,
	context: string,
	id: string,
	type: string,
): void {
	const foreign = INPUT_ONLY_ALIASES.concat(typeOnlyFields(type));
	for (const field of foreign) {
		if (field in initial) {
			fail(context, id, type, `element.${field}`);
		}
	}
}

/**
 * The fields another element type carries that this one may not.
 * @param type The element's type.
 * @returns The fields to refuse.
 */
function typeOnlyFields(type: string): string[] {
	const foreign: string[] = [];
	if (type !== "text") {
		foreign.push("rawText");
	}
	if (type === "line") {
		foreign.push("elbowed");
	}
	return foreign;
}

/**
 * Validate a trusted persisted record without completing or rewriting it.
 * @param value The element as stored.
 * @param context What the caller was doing, for the refusal it may raise.
 * @returns The element, as the board holds it.
 * @throws {NativeElementValidationError} When it is not a board element.
 */
function validatePersistedBoardElement(value: unknown, context: string): RuntimeBoardElement {
	const initial = recordAt(value, context, undefined, undefined, "element");
	const id = typeof initial["id"] === "string" ? initial["id"] : undefined;
	const type = typeof initial["type"] === "string" ? initial["type"] : undefined;
	if (!id) {
		fail(context, id, type, "element.id");
	}
	if (!isBoardElementType(type)) {
		fail(context, id, type, "element.type");
	}
	refuseForeignFields(initial, context, id, type);
	return buildValidatedElement(initial, context, id, type);
}

export { NativeElementValidationError, validatePersistedBoardElement };
