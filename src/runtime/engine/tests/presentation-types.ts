import { presentElements } from "../presentation.js";
import type { ReadonlyServerElement } from "../presentation.js";
import type { ServerElement } from "../types.js";

declare const mutableElements: ServerElement[];
declare const mutableElement: ServerElement;
declare const readonlyElements: readonly ReadonlyServerElement[];
declare const readonlyElement: ReadonlyServerElement;

const mutableResult = presentElements(mutableElements, { boardKey: "mutable" });
mutableResult[0] = mutableElement;
const [selectedMutable] = presentElements(mutableElements, { boardKey: "mutable" });
if (selectedMutable !== undefined) {
	selectedMutable.x = 1;
	selectedMutable.groupIds[0] = "group";
}

const readonlyResult = presentElements(readonlyElements, { boardKey: "readonly" });

// @ts-expect-error Readonly presentation arrays cannot replace an element.
readonlyResult[0] = readonlyElement;
const [selectedReadonly] = presentElements(readonlyElements, { boardKey: "readonly" });
if (selectedReadonly !== undefined) {
	// @ts-expect-error Readonly presented elements cannot change coordinates.
	selectedReadonly.x = 1;
	// @ts-expect-error Nested board data remains readonly through presentation.
	selectedReadonly.groupIds[0] = "group";
}
