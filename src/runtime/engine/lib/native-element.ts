import {
	BOARD_ELEMENT_TYPES,
	type PersistedBoardElement,
	type RuntimeBoardElement,
} from "../../../shared/board-elements/index.js";
import { buildValidatedElement } from "./native-element-builders.js";
import { NativeElementValidationError, fail, recordAt } from "./native-element-validation.js";

export { NativeElementValidationError };

const TYPES = new Set<string>(BOARD_ELEMENT_TYPES);

/** Validate a trusted persisted record without completing or rewriting it. */
export function validatePersistedBoardElement(
	value: unknown,
	context: string,
): RuntimeBoardElement {
	const initial = recordAt(value, context, undefined, undefined, "element");
	const id = typeof initial.id === "string" ? initial.id : undefined;
	const type = typeof initial.type === "string" ? initial.type : undefined;
	if (!id) fail(context, id, type, "element.id");
	if (!type || !TYPES.has(type)) fail(context, id, type, "element.type");
	for (const alias of ["label", "start", "end", "startElementId", "endElementId"])
		if (alias in initial) fail(context, id, type, `element.${alias}`);
	if (type !== "text" && "rawText" in initial) fail(context, id, type, "element.rawText");
	if (type === "line" && "elbowed" in initial) fail(context, id, type, "element.elbowed");
	return buildValidatedElement(initial, context, id, type as PersistedBoardElement["type"]);
}
