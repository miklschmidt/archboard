// The images a board actually draws.
//
// A scene arrives with a `files` map that a browser is free to over-supply:
// it keeps records for images that were deleted, pasted and undone, or never
// placed at all. Base64 payloads are the largest thing in a note, so the write
// boundary keeps only the files some element on the board points at.

import { type ExcalidrawFile, type ServerElement } from "@/runtime/engine/types";
import { isRecord, numberAt, stringAt } from "@/runtime/engine/lib/unknown-record";

/**
 * The fields an embedded file can do without, filled in.
 * @param raw The file record as it arrived.
 * @returns Its type and creation time, defaulted.
 */
function fileDefaults(raw: Record<string, unknown>): Pick<ExcalidrawFile, "mimeType" | "created"> {
	return {
		mimeType: stringAt(raw, "mimeType") || "image/png",
		created: numberAt(raw, "created", 0) || Date.now(),
	};
}

/**
 * One embedded file, when the record actually holds an image.
 *
 * An id and a data URL are what make a file usable; anything without both is
 * a record no element could point at.
 * @param raw The file record as it arrived.
 * @returns The file, or null when it is not one.
 */
function usableEmbeddedFile(raw: unknown): ExcalidrawFile | null {
	if (!isRecord(raw) || Array.isArray(raw)) {
		return null;
	}
	const id = stringAt(raw, "id");
	const dataURL = stringAt(raw, "dataURL");
	if (!id || !dataURL) {
		return null;
	}
	return { id, dataURL, ...fileDefaults(raw) };
}

/**
 * The files the board's own elements point at.
 * @param elements The board's elements.
 * @returns The file ids some image element draws.
 */
function drawnFileIds(elements: Iterable<ServerElement>): Set<string> {
	const ids = new Set<string>();
	for (const element of elements) {
		if (element.type === "image" && typeof element.fileId === "string") {
			ids.add(element.fileId);
		}
	}
	return ids;
}

/**
 * The supplied files that are both usable and actually drawn, deduplicated.
 *
 * This is what keeps a note from growing base64 payloads for images nothing
 * on the board shows.
 * @param elements The board's elements.
 * @param rawFiles The file records as they arrived.
 * @returns The files worth persisting.
 */
function usableDrawnFiles(
	elements: Iterable<ServerElement>,
	rawFiles: readonly unknown[],
): ExcalidrawFile[] {
	const drawn = drawnFileIds(elements);
	const files = new Map<string, ExcalidrawFile>();
	for (const raw of rawFiles) {
		const file = usableEmbeddedFile(raw);
		if (file && drawn.has(file.id)) {
			files.set(file.id, file);
		}
	}
	return [...files.values()];
}

export { usableEmbeddedFile, drawnFileIds, usableDrawnFiles };
