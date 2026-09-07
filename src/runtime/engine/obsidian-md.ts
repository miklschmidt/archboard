// Obsidian Excalidraw plugin file format (.excalidraw.md).
//
// The Obsidian Excalidraw plugin opens raw .excalidraw JSON only in a limited
// "compatibility mode" ("Convert to new format for full plugin functionality").
// Its native format is markdown: frontmatter, a "# Excalidraw Data" section
// whose "## Text Elements" entries expose each text element as an Obsidian
// block reference, and the scene JSON in a "## Drawing" code block — either
// plain ```json or lz-string ```compressed-json (the plugin's default).
//
// wrap mirrors the plugin's own id semantics (ExcalidrawData.
// findNewTextElementsInScene): a text element's block id IS its element id,
// and ids longer than 8 characters are renamed to a fresh 8-char id with
// every scene reference rewired — so files we write and files the plugin
// re-saves stay block-reference-compatible.
//
// That rename is a last resort, not a step. Every id archboard mints is
// already a block id (`ids.ts`), so on a board this server wrote there is
// nothing here to rename; what is left for it are ids that came from
// somewhere else — Excalidraw's own 21-character nanoids, an imported scene,
// a user-edited note. The rename is deterministic and the derivation has not
// changed, so a note written by an older archboard keeps the ids it has.
//
// A save regenerates the scene and nothing else: see the note regions in
// lib/obsidian-md-regions.ts. Everything a human wrote in the note —
// frontmatter (lib/obsidian-md-frontmatter.ts), prose above the data section,
// prose below it — is carried across verbatim, and so is the one section
// inside the data region that the plugin owns outright, the embedded files.

import { canonicalizeKeys } from "@/runtime/engine/expand-elements";
import {
	type FrontmatterScan,
	frontmatterLinesFor,
	readFrontmatterValue,
	renderFrontmatter,
	scanFrontmatter,
	setFrontmatterValue,
	upsertFrontmatterLines,
} from "@/runtime/engine/lib/obsidian-md-frontmatter";
import { decompressFromBase64 } from "@/runtime/engine/lib/obsidian-md-lz";
import {
	type EmbeddedFileEntry,
	type PreservedRegions,
	embeddedFilesIn,
	locateDrawingBlock,
	preservedRegions,
	readEmbeddedFiles,
} from "@/runtime/engine/lib/obsidian-md-regions";
import { isRecord } from "@/runtime/engine/lib/unknown-record";
import { derivedId, isBlockId } from "@/shared/ids/ids";

/**
 * Whether note content is the plugin's markdown format rather than raw scene
 * JSON. Raw JSON always starts with an opening brace or bracket and is never
 * treated as markdown, even when a text element happens to contain the marker
 * strings.
 * @param content The file content.
 * @returns True for an Obsidian Excalidraw note.
 */
function isObsidianExcalidrawMd(content: string): boolean {
	const head = content.trimStart();
	if (head.startsWith("{") || head.startsWith("[")) {
		return false;
	}
	return content.includes("# Excalidraw Data") || /^---[\s\S]*?excalidraw-plugin:/m.test(content);
}

/**
 * Rewrite one key of a record when it holds the old id.
 * @param record The record to edit in place.
 * @param key The key that may reference the id.
 * @param oldId The id being replaced.
 * @param newId The replacement.
 */
function retargetKey(record: Record<string, unknown>, key: string, oldId: string, newId: string) {
	if (record[key] === oldId) {
		record[key] = newId;
	}
}

/**
 * Rewrite the `id` of every bound-element entry that references the old id.
 * @param bound The element's `boundElements` value.
 * @param oldId The id being replaced.
 * @param newId The replacement.
 */
function retargetBoundElements(bound: unknown, oldId: string, newId: string): void {
	if (!Array.isArray(bound)) {
		return;
	}
	for (const entry of bound) {
		if (isRecord(entry)) {
			retargetKey(entry, "id", oldId, newId);
		}
	}
}

/**
 * Rewire every reference to an element id across a scene: the element's own
 * id, bound-element entries, arrow bindings and text containers.
 * @param elements The scene elements, edited in place.
 * @param oldId The id being replaced.
 * @param newId The replacement.
 */
function renameElementId(elements: unknown[], oldId: string, newId: string): void {
	for (const el of elements) {
		if (!isRecord(el)) {
			continue;
		}
		retargetKey(el, "id", oldId, newId);
		retargetBoundElements(el["boundElements"], oldId, newId);
		for (const key of ["startBinding", "endBinding"] as const) {
			const binding = el[key];
			if (isRecord(binding)) {
				retargetKey(binding, "elementId", oldId, newId);
			}
		}
		retargetKey(el, "containerId", oldId, newId);
	}
}

// `existing` is the current content of the destination file, when there is
// one; pass nothing to get the plugin's default frontmatter. Throws when the
// destination's frontmatter cannot be read safely — callers must treat that as
// "do not write" rather than falling back to a fresh header.
interface WrapOptions {
	// Frontmatter keys to set on the note — board identity, in practice. Upsert
	// semantics: unchanged values leave their lines untouched.
	frontmatter?: ReadonlyArray<[key: string, value: string]>;
}

/**
 * Drop scene files the preserved section already names. The note says where
 * an image is once: an id the section names has its bytes in the vault, put
 * there by the plugin, so writing base64 for it back into the Drawing block
 * would make two records of one picture, the second of which nothing reads
 * and nothing keeps in step.
 * @param wrapped The scene being written, edited in place.
 * @param embedded The preserved embedded-files section.
 */
function dropRecordedFiles(wrapped: Record<string, unknown>, embedded: string): void {
	const files = isRecord(wrapped["files"]) ? wrapped["files"] : {};
	wrapped["files"] = files;
	for (const entry of readEmbeddedFiles(embedded)) {
		delete files[entry.fileId];
	}
}

/**
 * The ids in use across a scene, so a derived id cannot collide.
 * @param elements The scene elements.
 * @returns The set of string ids.
 */
function usedIds(elements: readonly unknown[]): Set<string> {
	const used = new Set<string>();
	for (const el of elements) {
		if (isRecord(el) && typeof el["id"] === "string") {
			used.add(el["id"]);
		}
	}
	return used;
}

/**
 * The raw text a text element is written under: `rawText` when set, else
 * `originalText`, else `text`.
 * @param record The text element.
 * @returns The raw text, possibly empty.
 */
function rawTextOf(record: Record<string, unknown>): unknown {
	return record["rawText"] && record["rawText"] !== ""
		? record["rawText"]
		: (record["originalText"] ?? record["text"] ?? "");
}

/**
 * Whether a scene element is a live text element with a string id. Nothing
 * archboard minted fails the id check; an id that does came from elsewhere.
 * @param el The element.
 * @returns True when the element gets a block reference.
 */
function isLiveTextElement(el: unknown): el is Record<string, unknown> & { id: string } {
	return (
		isRecord(el) && el["type"] === "text" && !el["isDeleted"] && typeof el["id"] === "string"
	);
}

/**
 * The `## Text Elements` entries for a scene, renaming any text element whose
 * id cannot be written as a block reference as it stands.
 * @param elements The scene elements, edited in place when an id is renamed.
 * @returns The entries in element order.
 */
function textElementEntries(elements: unknown[]): string[] {
	const used = usedIds(elements);
	const entries: string[] = [];
	for (const el of elements) {
		if (!isLiveTextElement(el)) {
			continue;
		}
		if (!isBlockId(el.id)) {
			const newId = derivedId(el.id, used);
			used.add(newId);
			renameElementId(elements, el.id, newId);
		}
		el["rawText"] = rawTextOf(el);
		if (el["rawText"] !== "") {
			entries.push(`${String(el["rawText"])} ^${el.id}`);
		}
	}
	return entries;
}

/**
 * Serialise a scene as an Obsidian Excalidraw note, carrying the destination's
 * own regions across untouched.
 * @param scene The scene to write.
 * @param existing The destination's current content, or nothing for a fresh note.
 * @param options Frontmatter keys to set.
 * @returns The note text.
 * @throws {Error} When the scene has no elements array or the destination's frontmatter cannot be read safely.
 */
function wrapSceneAsObsidianMd(
	scene: Record<string, unknown>,
	existing?: string | null,
	options: WrapOptions = {},
): string {
	const wrapped = structuredClone(scene);
	const wrappedElements: unknown = wrapped["elements"];
	if (!Array.isArray(wrappedElements)) {
		throw new Error("Not an Excalidraw scene: missing elements array");
	}
	// Resolved before the scene is touched so an unreadable destination fails
	// before any work.
	const frontmatter = renderFrontmatter(
		upsertFrontmatterLines(frontmatterLinesFor(existing), options.frontmatter ?? []),
	);
	const regions = preservedRegions(existing);
	wrapped["type"] = "excalidraw";
	wrapped["version"] = 2;
	dropRecordedFiles(wrapped, regions.embedded);
	const entries = textElementEntries(wrappedElements);
	return renderNote(frontmatter, regions, entries, wrapped);
}

/**
 * Lay the note out in the plugin's own shape around the regenerated scene.
 * @param frontmatter The rendered frontmatter block.
 * @param regions The destination's preserved regions.
 * @param entries The `## Text Elements` entries.
 * @param wrapped The scene to serialise.
 * @returns The note text.
 */
function renderNote(
	frontmatter: string,
	regions: PreservedRegions,
	entries: readonly string[],
	wrapped: Record<string, unknown>,
): string {
	const textSection = entries.length ? entries.join("\n\n") + "\n" : "";
	// The blank line after the section is the plugin's own: it writes every
	// entry as `<id>: <target>\n\n`, so a note archboard re-saves is byte-for-
	// byte the note the plugin wrote.
	const embeddedSection = regions.embedded === "" ? "" : `${regions.embedded}\n`;
	return `${frontmatter}${regions.body}# Excalidraw Data
## Text Elements
${textSection}
${embeddedSection}%%
## Drawing
\`\`\`json
${JSON.stringify(canonicalizeKeys(wrapped), null, "\t")}
\`\`\`${regions.trailing}`;
}

/**
 * The scene JSON inside a note's Drawing block, decompressed when the plugin
 * stored it compressed and checked to parse.
 * @param md The note text.
 * @returns The scene JSON text.
 * @throws {Error} When the note has no Drawing block or its payload is not valid.
 */
function extractSceneJsonFromObsidianMd(md: string): string {
	const block = locateDrawingBlock(md);
	if (!block) {
		throw new Error("No Drawing block found — not an .excalidraw.md file?");
	}
	if (!block.compressed) {
		JSON.parse(block.payload);
		return block.payload;
	}
	const json = decompressFromBase64(block.payload.replace(/\s/g, ""));
	if (!json) {
		throw new Error("Failed to decompress the Drawing block");
	}
	JSON.parse(json);
	return json;
}

export {
	isObsidianExcalidrawMd,
	renameElementId,
	type FrontmatterScan,
	readFrontmatterValue,
	setFrontmatterValue,
	scanFrontmatter,
	type EmbeddedFileEntry,
	embeddedFilesIn,
	type WrapOptions,
	wrapSceneAsObsidianMd,
	extractSceneJsonFromObsidianMd,
};
