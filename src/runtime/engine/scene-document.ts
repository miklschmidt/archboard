import { type ServerElement } from "./types.js";
import { expandElements } from "./expand-elements.js";
import { extractSceneJsonFromObsidianMd, isObsidianExcalidrawMd } from "./obsidian-md.js";

export interface ExportedScene {
	scene: Record<string, unknown>;
	elementCount: number;
}

/** Build one Excalidraw document from the supplied board-shape elements. */
export function buildScene(
	sceneElements: ServerElement[],
	sceneFiles: Record<string, unknown> = {},
	// A board's own note keeps archboard's bookkeeping, because the note is the
	// board (ADR 0015). A file written for another tool does not.
	options: { keepServerFields?: boolean } = {},
): ExportedScene {
	const exportElements = expandElements(sceneElements, {
		deterministic: true,
		...(options.keepServerFields ? { keepServerFields: true } : {}),
	});

	// Only the images these elements actually draw. A scene's `files` map is
	// keyed by the `fileId` an image element carries, so the elements decide
	// what belongs in it (TASK-060).
	const used: Record<string, unknown> = {};
	for (const element of exportElements as Array<{ fileId?: unknown }>) {
		const id = element.fileId;
		if (typeof id === "string" && sceneFiles[id]) used[id] = sceneFiles[id];
	}

	const scene: Record<string, unknown> = {
		type: "excalidraw",
		version: 2,
		source: "archboard",
		elements: exportElements,
		appState: {
			viewBackgroundColor: "#ffffff",
			gridSize: null,
		},
		...(Object.keys(used).length > 0 ? { files: used } : {}),
	};

	return { scene, elementCount: exportElements.length };
}

/** Build a file document from the board returned by the canvas server. */
export async function buildSceneFile(): Promise<ExportedScene> {
	const { getElements, getFiles } = await import("./canvas-client.js");
	const [elementsResult, filesResult] = await Promise.allSettled([getElements(), getFiles()]);
	if (elementsResult.status === "rejected") throw elementsResult.reason;
	const files = filesResult.status === "fulfilled" ? filesResult.value : {};
	return buildScene(elementsResult.value, files);
}

export interface ImportResult {
	count: number;
	fileCount: number;
	mode: "replace" | "merge";
}

/** Import a JSON or Obsidian scene through the server's element-input entry. */
export async function importScene(options: {
	data: string;
	mode: "replace" | "merge";
}): Promise<ImportResult> {
	const { batchCreateElementsOnCanvas, postFiles, replaceSceneOnCanvas } =
		await import("./canvas-client.js");
	let raw = options.data;
	if (isObsidianExcalidrawMd(raw)) raw = extractSceneJsonFromObsidianMd(raw);

	const sceneData: unknown = JSON.parse(raw);
	const sceneRecord =
		sceneData && typeof sceneData === "object" ? (sceneData as Record<string, unknown>) : {};
	const elements: ServerElement[] = Array.isArray(sceneData)
		? (sceneData as ServerElement[])
		: Array.isArray(sceneRecord.elements)
			? (sceneRecord.elements as ServerElement[])
			: [];
	if (elements.length === 0) throw new Error("No elements found in the import data");

	const importFiles = sceneRecord.files;
	const files = importFiles && typeof importFiles === "object" ? Object.values(importFiles) : [];
	const created =
		options.mode === "replace"
			? await replaceSceneOnCanvas(elements, files)
			: await batchCreateElementsOnCanvas(elements);
	if (!created)
		throw new Error("Import failed: canvas rejected the batch create (elements were not restored)");

	let fileCount = options.mode === "replace" ? files.length : 0;
	if (options.mode === "merge" && files.length > 0) {
		try {
			await postFiles(files);
			fileCount = files.length;
		} catch {
			/* best effort */
		}
	}
	return { count: elements.length, fileCount, mode: options.mode };
}
