// A board as an Excalidraw file, and an Excalidraw file as a board.
//
// The one shape another tool reads and writes. Everything about it is decided
// by the elements: which images belong in `files`, and whether the document
// keeps archboard's own bookkeeping (a board's note does, because the note is
// the board; a file written for somebody else does not).

import type { ElementInput } from "@/runtime/engine/canvas-client";
import type { LegacyElementIngress } from "@/shared/board-elements";
import { expandElements } from "@/runtime/engine/expand-elements";
import { drawnFileIds } from "@/runtime/engine/embedded-files";
import {
	extractSceneJsonFromObsidianMd,
	isObsidianExcalidrawMd,
} from "@/runtime/engine/obsidian-md";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

interface ExportedScene {
	scene: Record<string, unknown>;
	elementCount: number;
}

/** Whether the document keeps archboard's own bookkeeping. */
interface BuildSceneOptions {
	keepServerFields?: boolean;
}

/**
 * The images these elements actually draw.
 *
 * A scene's `files` map is keyed by the `fileId` an image element carries, so
 * the elements decide what belongs in it (TASK-060).
 * @param elements The document's elements.
 * @param sceneFiles Every file the board holds.
 * @returns The ones some element points at.
 */
function drawnFilesOf(
	elements: Parameters<typeof drawnFileIds>[0],
	sceneFiles: Record<string, unknown>,
): Record<string, unknown> {
	const used: Record<string, unknown> = {};
	for (const id of drawnFileIds(elements)) {
		if (sceneFiles[id]) {
			used[id] = sceneFiles[id];
		}
	}
	return used;
}

/**
 * Build one Excalidraw document from the supplied board-shape elements.
 * @param sceneElements The elements to write.
 * @param sceneFiles Every file the board holds, of which only the drawn ones
 * are carried.
 * @param options Whether to keep archboard's bookkeeping. A board's own note
 * does, because the note is the board (ADR 0015); a file written for another
 * tool does not.
 * @returns The document and how many elements are in it.
 */
function buildScene(
	sceneElements: LegacyElementIngress[],
	sceneFiles: Record<string, unknown> = {},
	options: BuildSceneOptions = {},
): ExportedScene {
	const exportElements = expandElements(sceneElements, {
		deterministic: true,
		...(options.keepServerFields ? { keepServerFields: true } : {}),
	});
	const used = drawnFilesOf(exportElements, sceneFiles);
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

/**
 * Build a file document from the board returned by the canvas server.
 *
 * The files are best effort and the elements are not: a board that cannot be
 * read is not a document, while a board whose images could not be fetched is
 * still the shapes somebody drew.
 * @returns The document and how many elements are in it.
 * @throws {Error} When the canvas could not be asked for its elements.
 */
async function buildSceneFile(): Promise<ExportedScene> {
	const { getElements, getFiles } = await import("@/runtime/engine/canvas-client");
	const [elementsResult, filesResult] = await Promise.allSettled([getElements(), getFiles()]);
	if (elementsResult.status === "rejected") {
		throw elementsResult.reason;
	}
	const files = filesResult.status === "fulfilled" ? filesResult.value : {};
	return buildScene(elementsResult.value, files);
}

interface ImportResult {
	count: number;
	fileCount: number;
	mode: "replace" | "merge";
}

/** What to import, and whether it replaces the board or joins it. */
interface ImportOptions {
	data: string;
	mode: "replace" | "merge";
}

/**
 * The scene JSON inside whatever the caller handed over.
 * @param data A JSON scene, or an Obsidian note with one embedded in it.
 * @returns The JSON.
 */
function sceneJsonOf(data: string): string {
	return isObsidianExcalidrawMd(data) ? extractSceneJsonFromObsidianMd(data) : data;
}

/**
 * The elements an imported scene states, in either shape a scene file takes: a
 * bare array of elements, or a document with an `elements` key.
 *
 * Handed on unchecked on purpose. The canvas's write boundary is the one place
 * that validates an element, and it refuses a malformed one by naming the
 * field; checking here would either duplicate that or, worse, quietly drop
 * what it could not read.
 * @param sceneData The parsed file.
 * @param sceneRecord The same file as a record, when it is one.
 * @returns The elements, or none.
 */
function importedElements(
	sceneData: unknown,
	sceneRecord: Record<string, unknown>,
): ElementInput[] {
	const stated: unknown = Array.isArray(sceneData) ? sceneData : sceneRecord["elements"];
	if (!Array.isArray(stated)) {
		return [];
	}
	const elements: ElementInput[] = stated;
	return elements;
}

/**
 * The files an imported scene carries.
 * @param sceneRecord The parsed file as a record.
 * @returns The file records, or none.
 */
function importedFiles(sceneRecord: Record<string, unknown>): unknown[] {
	const stated = sceneRecord["files"];
	return isRecord(stated) ? Object.values(stated) : [];
}

/**
 * Put the scene's images on the board, and say how many landed.
 *
 * A replacement carries its files in the same write, so they are already
 * there. A merge posts them separately and best effort: the elements are in by
 * then, and an image that did not make it is a missing picture rather than a
 * lost import.
 * @param mode Whether this import replaced the board or joined it.
 * @param files The scene's file records.
 * @param postFiles How to send them.
 * @returns How many files the board now has from this import.
 */
async function importedFileCount(
	mode: ImportOptions["mode"],
	files: unknown[],
	postFiles: (files: unknown[]) => Promise<void>,
): Promise<number> {
	if (mode === "replace") {
		return files.length;
	}
	if (files.length === 0) {
		return 0;
	}
	try {
		await postFiles(files);
		return files.length;
	} catch {
		return 0;
	}
}

/**
 * Import a JSON or Obsidian scene through the server's element-input entry.
 * @param options What to import, and whether it replaces the board.
 * @returns How much arrived.
 * @throws {Error} When the data holds no elements, or the canvas refused them.
 */
async function importScene(options: ImportOptions): Promise<ImportResult> {
	const { batchCreateElementsOnCanvas, postFiles, replaceSceneOnCanvas } =
		await import("@/runtime/engine/canvas-client");
	const sceneData: unknown = JSON.parse(sceneJsonOf(options.data));
	const sceneRecord = isRecord(sceneData) ? sceneData : {};
	const elements = importedElements(sceneData, sceneRecord);
	if (elements.length === 0) {
		throw new Error("No elements found in the import data");
	}
	const files = importedFiles(sceneRecord);
	const created =
		options.mode === "replace"
			? await replaceSceneOnCanvas(elements, files)
			: await batchCreateElementsOnCanvas(elements);
	if (!created) {
		throw new Error("Import failed: canvas rejected the batch create (elements were not restored)");
	}
	const fileCount = await importedFileCount(options.mode, files, postFiles);
	return { count: elements.length, fileCount, mode: options.mode };
}

export { type ExportedScene, buildScene, buildSceneFile, type ImportResult, importScene };
