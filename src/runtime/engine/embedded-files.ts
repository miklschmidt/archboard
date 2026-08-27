import { type ExcalidrawFile, type ServerElement } from "./types.js";

export function usableEmbeddedFile(raw: unknown): ExcalidrawFile | null {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const file = raw as Record<string, unknown>;
	if (typeof file.id !== "string" || !file.id || typeof file.dataURL !== "string" || !file.dataURL)
		return null;
	return {
		id: file.id,
		dataURL: file.dataURL,
		mimeType: typeof file.mimeType === "string" && file.mimeType ? file.mimeType : "image/png",
		created: typeof file.created === "number" && file.created ? file.created : Date.now(),
	};
}

export function drawnFileIds(elements: Iterable<Pick<ServerElement, "fileId">>): Set<string> {
	const ids = new Set<string>();
	for (const element of elements) {
		if (typeof element.fileId === "string") ids.add(element.fileId);
	}
	return ids;
}

export function usableDrawnFiles(
	elements: Iterable<Pick<ServerElement, "fileId">>,
	rawFiles: readonly unknown[],
): ExcalidrawFile[] {
	const drawn = drawnFileIds(elements);
	const files = new Map<string, ExcalidrawFile>();
	for (const raw of rawFiles) {
		const file = usableEmbeddedFile(raw);
		if (file && drawn.has(file.id)) files.set(file.id, file);
	}
	return [...files.values()];
}
