// Projecting a persisted scene for the read-only inspection command and the
// focused renderer, without repairing it: an inspection reports the note as
// it is, and a scene that would not render reports as unrenderable rather
// than being fixed on the way through.

import { type ExcalidrawFile, type ServerElement } from "@/runtime/engine/types";
import type { BoardRenderSnapshot } from "@/shared/board-rendering";
import { hashBoardBytes } from "@/runtime/engine/board";
import { validateRenderGeometry } from "@/runtime/engine/geometry";
import { validatePersistedBoardElement } from "@/runtime/engine/lib/native-element";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

interface BoardInspectionSnapshot {
	board: string;
	elements: readonly unknown[];
	fingerprint: string;
	renderScene: BoardRenderSnapshot | null;
}

/**
 * A parsed scene as a plain record, or null when it is a bare element array
 * or not an object at all.
 * @param scene The parsed scene JSON.
 * @returns The record, or null.
 */
function sceneRecordOf(scene: unknown): Record<string, unknown> | null {
	return !Array.isArray(scene) && isRecord(scene) ? scene : null;
}

/**
 * The raw element list a scene carries, whichever of the two shapes it is.
 * @param scene The parsed scene JSON.
 * @returns The elements, or undefined when the scene has no list.
 */
function sceneElementsOf(scene: unknown): unknown[] | undefined {
	if (Array.isArray(scene)) {
		return scene;
	}
	const record = sceneRecordOf(scene);
	const elements = record?.["elements"];
	return Array.isArray(elements) ? elements : undefined;
}

/**
 * Validate every element record and their geometry, without repair.
 * @param elements The raw element records.
 * @returns The validated elements, or null when any fails or an id repeats.
 */
function projectElements(elements: readonly unknown[]): ServerElement[] | null {
	const ids = new Set<string>();
	const projected: ServerElement[] = [];
	for (const raw of elements) {
		try {
			const element = validatePersistedBoardElement(raw, "inspection scene");
			if (ids.has(element.id)) {
				return null;
			}
			ids.add(element.id);
			projected.push(element);
		} catch {
			return null;
		}
	}
	try {
		validateRenderGeometry(projected);
	} catch {
		return null;
	}
	return projected;
}

/**
 * One scene file record, exactly as the renderer needs it.
 * @param id The key in the scene's `files` map.
 * @param raw The value under that key.
 * @returns The record, or null when any field is missing or mis-typed.
 */
function projectFile(id: string, raw: unknown): ExcalidrawFile | null {
	if (!isRecord(raw) || Array.isArray(raw)) {
		return null;
	}
	const dataURL = raw["dataURL"];
	const mimeType = raw["mimeType"];
	const created = raw["created"];
	if (
		raw["id"] !== id ||
		typeof dataURL !== "string" ||
		typeof mimeType !== "string" ||
		typeof created !== "number" ||
		!Number.isFinite(created)
	) {
		return null;
	}
	return { id, dataURL, mimeType, created };
}

/**
 * Every scene file record, or null when the map or any record is malformed.
 * @param record The scene as a record, or null for a bare element array.
 * @returns The files keyed by id.
 */
function projectFiles(record: Record<string, unknown> | null): Record<string, ExcalidrawFile> | null {
	const rawFiles = record?.["files"] ?? {};
	if (!isRecord(rawFiles) || Array.isArray(rawFiles)) {
		return null;
	}
	const files: Record<string, ExcalidrawFile> = {};
	for (const [id, raw] of Object.entries(rawFiles)) {
		const file = projectFile(id, raw);
		if (!file) {
			return null;
		}
		files[id] = file;
	}
	return files;
}

/**
 * The scene's background colour, defaulting to white when absent.
 * @param record The scene as a record, or null.
 * @returns A CSS colour.
 */
function backgroundOf(record: Record<string, unknown> | null): string {
	const appState = record?.["appState"];
	const background =
		isRecord(appState) && !Array.isArray(appState) ? appState["viewBackgroundColor"] : undefined;
	return typeof background === "string" ? background : "#ffffff";
}

/**
 * Validate and project one persisted scene for the browser renderer.
 * @param scene The parsed scene JSON.
 * @returns The render snapshot, or null when the scene would not render as-is.
 */
function projectBoardRenderSnapshot(scene: unknown): BoardInspectionSnapshot["renderScene"] {
	const elements = sceneElementsOf(scene);
	if (!elements) {
		return null;
	}
	const projected = projectElements(elements);
	if (!projected) {
		return null;
	}
	const record = sceneRecordOf(scene);
	const files = projectFiles(record);
	if (!files) {
		return null;
	}
	return {
		elements: projected,
		files,
		appState: { viewBackgroundColor: backgroundOf(record) },
	};
}

/**
 * The fingerprint contribution of one scene file entry: which of its fields
 * are present and what they hold, or a marker for an entry that is not a record.
 * @param id The file id.
 * @param raw The value under that id.
 * @returns A JSON-serialisable projection.
 */
function fileFingerprint(id: string, raw: unknown): unknown[] {
	if (!isRecord(raw) || Array.isArray(raw)) {
		return [id, ["invalid-file-value", raw]];
	}
	/**
	 * One field's presence and value.
	 * @param name The field.
	 * @returns `present` with the value, or `missing`.
	 */
	const field = (name: string): unknown[] =>
		Object.hasOwn(raw, name) ? ["present", raw[name]] : ["missing"];
	return [id, field("id"), field("mimeType"), field("created"), field("dataURL")];
}

/**
 * The part of a scene's `files` map that the render fingerprint depends on,
 * in a stable order.
 * @param scene The parsed scene JSON.
 * @returns A JSON-serialisable projection; empty when the scene has no files key.
 */
function hydratedFileFingerprintProjection(scene: unknown): readonly unknown[] {
	const record = sceneRecordOf(scene);
	if (!record || !Object.hasOwn(record, "files")) {
		return [];
	}
	const rawFiles = record["files"];
	if (!isRecord(rawFiles) || Array.isArray(rawFiles)) {
		return [["invalid-files-value", rawFiles]];
	}
	return Object.keys(rawFiles)
		.toSorted((left, right) => (left < right ? -1 : left > right ? 1 : 0))
		.map((id) => fileFingerprint(id, rawFiles[id]));
}

/**
 * A fingerprint that changes when the note or the hydrated pictures behind
 * its render change.
 * @param noteHash The note's byte hash.
 * @param scene The parsed scene JSON.
 * @returns A hex digest.
 */
function renderSnapshotFingerprint(noteHash: string, scene: unknown): string {
	const files = hydratedFileFingerprintProjection(scene);
	return hashBoardBytes(
		Buffer.from(`archboard-render-snapshot-v1\n${JSON.stringify([noteHash, files])}`, "utf8"),
	);
}

export {
	type BoardInspectionSnapshot,
	sceneElementsOf,
	projectBoardRenderSnapshot,
	renderSnapshotFingerprint,
};
