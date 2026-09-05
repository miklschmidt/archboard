// Projecting a canvas selection for the inspector: the element's metadata
// under `customData.archboard` (ADR 0003) and its code binding, when it has a
// readable, portable one. Nothing else of the element leaks through.

import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { CodeBindingSchema } from "@/shared/code-target";
import {
	SELECTION_METADATA_KEYS,
	type SelectedElement,
	type SelectionMetadata,
	type SelectionProjection,
} from "@/ui/selection-inspector/lib/projection";

/** What the projection reads of an element: its id, type and metadata. */
type SelectionElement = Pick<ExcalidrawElement, "id" | "type" | "customData">;

/**
 * A value as a plain object, or nothing.
 * @param value Any value.
 * @returns The record, or null when the value is not a plain object.
 */
function record(value: unknown): Readonly<Record<string, unknown>> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? // A plain object read key by key; nothing typed is assumed of it.
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion
			(value as Readonly<Record<string, unknown>>)
		: null;
}

/**
 * The `customData.archboard` channel of an element (ADR 0003).
 * @param element The element.
 * @returns The channel, or null when the element carries none.
 */
function archboardChannel(element: SelectionElement): Readonly<Record<string, unknown>> | null {
	return record(record(element.customData)?.["archboard"]);
}

/**
 * The element as the inspector needs it: only string metadata, only known keys.
 * @param element The element.
 * @param archboard Its metadata channel, if any.
 * @returns The selected element.
 */
function inspectElement(
	element: SelectionElement,
	archboard: Readonly<Record<string, unknown>> | null,
): SelectedElement {
	const metadata: Partial<Record<(typeof SELECTION_METADATA_KEYS)[number], string>> = {};
	for (const key of SELECTION_METADATA_KEYS) {
		const value = archboard?.[key];
		if (typeof value === "string") {
			metadata[key] = value;
		}
	}
	const readonlyMetadata: SelectionMetadata = metadata;
	return { id: element.id, type: element.type, metadata: readonlyMetadata };
}

/**
 * Why a binding path is not portable, if it is not.
 * @param path The binding's repo-relative path.
 * @returns The explanation, or null when the path is portable.
 */
function unportablePath(path: string): string | null {
	if (path.includes("\0")) {
		return "The binding path contains a null character.";
	}
	if (isAbsolutePath(path)) {
		return "The binding path is absolute; a binding names a path inside its repository.";
	}
	if (path.startsWith("file://")) {
		return "The binding path is a file URL; a binding names a path inside its repository.";
	}
	return escapesRepository(path) ? "The binding path climbs out of its repository." : null;
}

/**
 * Whether a path is absolute on any platform.
 * @param path The path.
 * @returns True for a leading slash, backslash or drive letter.
 */
function isAbsolutePath(path: string): boolean {
	return path.startsWith("/") || path.startsWith("\\") || /^[a-zA-Z]:/.test(path);
}

/**
 * Whether a relative path walks above its root.
 * @param path The path.
 * @returns True when a `..` segment leaves the repository.
 */
function escapesRepository(path: string): boolean {
	let depth = 0;
	for (const segment of path.replaceAll("\\", "/").split("/")) {
		if (segment === "" || segment === ".") {
			continue;
		}
		depth += segment === ".." ? -1 : 1;
		if (depth < 0) {
			return true;
		}
	}
	return false;
}

/**
 * Project one selected element.
 * @param selected The element.
 * @returns The unbound, malformed or bound projection.
 */
function projectElement(selected: SelectionElement): SelectionProjection {
	const archboard = archboardChannel(selected);
	const element = inspectElement(selected, archboard);
	if (archboard === null || !("binding" in archboard)) {
		return { kind: "unbound", element };
	}
	const binding = CodeBindingSchema.safeParse(archboard["binding"]);
	if (!binding.success) {
		const issue = binding.error.issues[0];
		const detail = issue ? ` ${issue.path.join(".")}: ${issue.message}`.trimEnd() : "";
		return { kind: "malformed", element, explanation: `The binding is unreadable.${detail}` };
	}
	const explanation = unportablePath(binding.data.path);
	if (explanation !== null) {
		return { kind: "malformed", element, explanation };
	}
	return { kind: "bound", element, binding: binding.data };
}

/**
 * Project a selection for the inspector.
 * @param scene The board's elements.
 * @param selectedIds The selected ids.
 * @returns What the inspector shows.
 */
function projectSelection(
	scene: readonly SelectionElement[],
	selectedIds: readonly string[],
): SelectionProjection {
	const id = selectedIds[0];
	if (id === undefined) {
		return { kind: "empty" };
	}
	if (selectedIds.length > 1) {
		return { kind: "multiple", count: selectedIds.length };
	}
	const selected = scene.find((element) => element.id === id);
	return selected === undefined ? { kind: "missing", id } : projectElement(selected);
}

export { projectSelection, type SelectionElement };
