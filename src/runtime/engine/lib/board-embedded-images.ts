// Images the Obsidian Excalidraw plugin moved into the vault.
//
// A note the plugin has saved carries no image bytes: it writes each one out
// as a real vault file and records where it went in the note's
// `## Embedded Files` section (see obsidian-md.ts, ADR 0017). Preserving that
// section keeps the record; following it is what keeps the picture, so a board
// the plugin has touched still renders here.
//
// Following it happens in `readNoteFile` (src/runtime/engine/board-io.ts) and
// nowhere else, so every read of a board gets the pictures without knowing
// this section exists — and there is no second reader for a fix here to miss.

import fs from "fs";
import path from "path";
import { type ExcalidrawFile } from "@/runtime/engine/types";
import { embeddedFilesIn, extractSceneJsonFromObsidianMd } from "@/runtime/engine/obsidian-md";
import { isRecord } from "@/runtime/engine/lib/unknown-record";

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".webp": "image/webp",
	".bmp": "image/bmp",
	".avif": "image/avif",
});

/**
 * The file a wikilink names. Obsidian's target is a "linktext": the shortest
 * form that still picks the file out — usually a bare filename, a
 * vault-relative path when the name is ambiguous — optionally followed by
 * `#heading` or `|alias`, which name a place inside a note and never a
 * different file. The plugin's own PATHREG (`/(^[^#|]*)/`) cuts at exactly the
 * same two characters.
 * @param link The wikilink's inner text.
 * @returns The file part, trimmed.
 */
function linkTarget(link: string): string {
	return link.split(/[#|]/)[0]!.trim();
}

/**
 * Every file in the vault, by lower-cased basename. Built only when a plain
 * path lookup has already failed, which is the uncommon case: the plugin
 * writes a bare filename when it is unique and a path when it is not.
 * @param root The resolved vault root.
 * @returns Absolute paths grouped by lower-cased file name.
 */
function vaultFilesByName(root: string): Map<string, string[]> {
	const byName = new Map<string, string[]>();
	/**
	 * Remember one file under its lowercased name.
	 * @param full The absolute path.
	 * @param name The file's own name.
	 */
	const record = (full: string, name: string): void => {
		const found = byName.get(name.toLowerCase());
		if (found) found.push(full);
		else byName.set(name.toLowerCase(), [full]);
	};
	/**
	 * Add every file below one directory, skipping `.git`.
	 * @param dir The directory to walk.
	 */
	const walk = (dir: string): void => {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory() && entry.name !== ".git") walk(full);
			else if (entry.isFile()) record(full, entry.name);
		}
	};
	walk(root);
	return byName;
}

/**
 * The existing regular file at a candidate path, provided it is inside the vault.
 * @param vault The resolved vault root.
 * @param candidate The path to check.
 * @returns The resolved path, or null when outside the vault or not a file.
 */
function fileInsideVault(vault: string, candidate: string): string | null {
	const resolved = path.resolve(candidate);
	if (resolved !== vault && !resolved.startsWith(vault + path.sep)) return null;
	return fs.existsSync(resolved) && fs.statSync(resolved).isFile() ? resolved : null;
}

/**
 * Where a link points if it points somewhere plainly: relative to the vault
 * root, or relative to the note it was written in.
 * @param target The link's path, as written.
 * @param notePath The note the link appears in.
 * @param root The vault root.
 * @returns The absolute file path, or null.
 */
function directTarget(target: string, notePath: string, root: string): string | null {
	const vault = path.resolve(root);
	return (
		fileInsideVault(vault, path.join(vault, target)) ??
		fileInsideVault(vault, path.join(path.dirname(notePath), target))
	);
}

/**
 * The vault file a wikilink names, or null. Tried in the order Obsidian
 * resolves them: vault-relative, then relative to the note, then by name.
 * A name that matches more than one file is refused rather than guessed at —
 * picking one would put a different picture on the board than the plugin
 * showed.
 * @param link The wikilink's inner text.
 * @param notePath The note the link appears in.
 * @param root The vault root.
 * @param byName Lazily built index of vault files by name.
 * @returns The absolute file path, or null.
 */
function resolveVaultLink(
	link: string,
	notePath: string,
	root: string,
	byName: () => Map<string, string[]>,
): string | null {
	const target = linkTarget(link);
	if (target === "" || path.isAbsolute(target)) return null;
	const direct = directTarget(target, notePath, root);
	if (direct) return direct;
	// One match in the whole vault is an answer; several is a name the note did
	// not say enough about, and none is a link to nothing.
	const matches = byName().get(path.basename(target).toLowerCase()) ?? [];
	return matches.length === 1 ? matches[0]! : null;
}

/**
 * Read one linked image as a scene file record.
 * @param file The absolute image path.
 * @param fileId The scene file id the note's section gave it.
 * @param mimeType The image's MIME type, from its extension.
 * @returns The file record, or null when the file cannot be read.
 */
function imageFileRecord(file: string, fileId: string, mimeType: string): ExcalidrawFile | null {
	let bytes: Buffer;
	try {
		bytes = fs.readFileSync(file);
	} catch {
		return null;
	}
	return {
		id: fileId,
		dataURL: `data:${mimeType};base64,${bytes.toString("base64")}`,
		mimeType,
		created: fs.statSync(file).mtimeMs,
	};
}

/**
 * The images a note's `## Embedded Files` section points at, in the shape a
 * scene's `files` map carries them. Anything that does not name a vault image
 * — a hyperlink, an equation, a link whose file is gone — is left out: the
 * record of it survives in the note either way, and inventing an entry for it
 * would put a hole on the board where the plugin puts a picture it fetches.
 * @param note The note's text.
 * @param notePath The note's path, for note-relative links.
 * @param root The vault root.
 * @returns Scene file records keyed by file id.
 */
function resolveEmbeddedImages(
	note: string,
	notePath: string,
	root: string,
): Record<string, ExcalidrawFile> {
	const files: Record<string, ExcalidrawFile> = {};
	let names: Map<string, string[]> | null = null;
	/**
	 * The by-name index, built on first use.
	 * @returns Vault files grouped by lower-cased name.
	 */
	const byName = (): Map<string, string[]> => (names ??= vaultFilesByName(path.resolve(root)));
	for (const entry of embeddedFilesIn(note)) {
		if (entry.kind !== "wikilink") continue;
		const mimeType = IMAGE_MIME_TYPES[path.extname(linkTarget(entry.target)).toLowerCase()];
		if (!mimeType) continue;
		const file = resolveVaultLink(entry.target, notePath, root, byName);
		if (!file) continue;
		const record = imageFileRecord(file, entry.fileId, mimeType);
		if (record) files[entry.fileId] = record;
	}
	return files;
}

/**
 * A note's scene, with any image the plugin moved out of it put back. The
 * scene JSON is only reassembled when the note has a section to read, so an
 * ordinary note is not parsed and re-stringified for nothing.
 * @param note The note's text.
 * @param notePath The note's path.
 * @param root The vault root.
 * @returns The scene JSON, with resolved images merged into its `files`.
 */
export function sceneJsonWithEmbeddedImages(note: string, notePath: string, root: string): string {
	const sceneJson = extractSceneJsonFromObsidianMd(note);
	const resolved = resolveEmbeddedImages(note, notePath, root);
	if (Object.keys(resolved).length === 0) return sceneJson;
	const scene: unknown = JSON.parse(sceneJson);
	if (Array.isArray(scene) || !isRecord(scene)) return sceneJson;
	const existing = isRecord(scene["files"]) ? scene["files"] : {};
	return JSON.stringify({ ...scene, files: { ...existing, ...resolved } });
}

export { resolveEmbeddedImages };
