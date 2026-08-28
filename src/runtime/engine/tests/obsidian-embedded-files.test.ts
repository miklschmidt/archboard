import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";

import { resolveEmbeddedImages } from "../board.ts";
import { embeddedFilesIn, wrapSceneAsObsidianMd } from "../obsidian-md.ts";
import {
	ELEMENT_LINKS,
	EMBEDDED_FILES,
	FRESH_NOTE,
	imageElement,
	insertBeforeDrawing,
	rectangle,
	scene,
	text,
} from "./support/obsidian-fixtures.ts";

let vault: string;

beforeEach(() => {
	vault = fs.mkdtempSync(join(os.tmpdir(), "archboard-obsidian-embedded-"));
});

afterEach(() => {
	fs.rmSync(vault, { recursive: true, force: true });
});

function pluginNote(section: string, files: Record<string, unknown> = {}): string {
	const imaged = scene([rectangle, text, imageElement]);
	imaged.files = files;
	return insertBeforeDrawing(wrapSceneAsObsidianMd(imaged), section);
}

describe("Embedded Files persistence", () => {
	test("current records carry through byte-for-byte while derived Element Links are removed", () => {
		const note = pluginNote(`${ELEMENT_LINKS}${EMBEDDED_FILES}`);
		const imaged = scene([rectangle, text, imageElement]);
		const saved = wrapSceneAsObsidianMd(imaged, note);

		expect(saved).toBe(note.replace(ELEMENT_LINKS, ""));
		expect(saved).toContain("abc12345: [[attachments/diagram.png]]");
		expect(saved).toContain("def45678: https://example.com/logo.svg");
		expect(saved).toContain("gh789012: $$\\int_0^1 x^2$$");
		expect(saved).not.toContain("## Element Links");
		expect(wrapSceneAsObsidianMd(imaged, saved)).toBe(saved);
	});

	test("the legacy Embedded files heading carries through exactly", () => {
		const note = pluginNote("# Embedded files\nabc12345: [[old/diagram.png]]\n\n");
		const imaged = scene([rectangle, text, imageElement]);
		expect(wrapSceneAsObsidianMd(imaged, note)).toBe(note);
	});

	test("an empty section is dropped and an entry list stops before prose", () => {
		const imaged = scene([rectangle, text, imageElement]);
		const bare = pluginNote("## Embedded Files\n\n");
		expect(wrapSceneAsObsidianMd(imaged, bare)).not.toContain("## Embedded Files");

		const trailing = pluginNote(
			"## Embedded Files\nabc12345: [[attachments/diagram.png]]\n\nsomething else entirely\n\n",
		);
		const saved = wrapSceneAsObsidianMd(imaged, trailing);
		expect(saved).toContain("abc12345: [[attachments/diagram.png]]");
		expect(saved).not.toContain("something else entirely");
	});

	test("a text element that spells a section never becomes a plugin record", () => {
		const impostor = {
			id: "text-thr",
			type: "text",
			x: 0,
			y: 400,
			width: 200,
			height: 50,
			text: "## Embedded Files\nzz999999: [[stolen.png]]",
			originalText: "## Embedded Files\nzz999999: [[stolen.png]]",
		};
		const impostorScene = scene([rectangle, impostor]);
		const note = wrapSceneAsObsidianMd(impostorScene);
		expect(embeddedFilesIn(note)).toHaveLength(0);
		expect(wrapSceneAsObsidianMd(impostorScene, wrapSceneAsObsidianMd(impostorScene, note))).toBe(
			note,
		);
	});

	test("covered bytes are omitted while an unrecorded image stays in the Drawing bytes", () => {
		const covered = scene([rectangle, text, imageElement]);
		covered.files = {
			abc12345: {
				id: "abc12345",
				dataURL: "data:image/png;base64,QUJPQVJEQUFBQQ==",
				mimeType: "image/png",
			},
		};
		const recorded = pluginNote(EMBEDDED_FILES);
		const savedCovered = wrapSceneAsObsidianMd(covered, recorded);
		expect(savedCovered).not.toContain("QUJPQVJEQUFBQQ==");
		expect(savedCovered).toContain("abc12345: [[attachments/diagram.png]]");
		expect(savedCovered).toBe(recorded);

		const other = scene([rectangle, text, { ...imageElement, id: "img-two", fileId: "zz999999" }]);
		other.files = {
			zz999999: {
				id: "zz999999",
				dataURL: "data:image/png;base64,QUJPQVJEQkJCQg==",
				mimeType: "image/png",
			},
		};
		expect(wrapSceneAsObsidianMd(other, recorded)).toContain("QUJPQVJEQkJCQg==");
	});
});

describe("Embedded Files records", () => {
	test("wikilink, HTTP, and equation targets retain their distinct kinds and order", () => {
		const entries = embeddedFilesIn(pluginNote(EMBEDDED_FILES));
		expect(entries).toEqual([
			{ fileId: "abc12345", kind: "wikilink", target: "attachments/diagram.png" },
			{ fileId: "def45678", kind: "hyperlink", target: "https://example.com/logo.svg" },
			{ fileId: "gh789012", kind: "other", target: "$$\\int_0^1 x^2$$" },
		]);
		expect(embeddedFilesIn(FRESH_NOTE)).toHaveLength(0);
	});
});

describe("vault image resolution", () => {
	test("vault-relative and note-relative wikilinks resolve with exact bytes and MIME types", () => {
		const attachments = join(vault, "attachments");
		const notes = join(vault, "notes");
		fs.mkdirSync(attachments, { recursive: true });
		fs.mkdirSync(notes, { recursive: true });
		fs.writeFileSync(join(attachments, "logo.png"), Buffer.from("vault-image"));
		fs.writeFileSync(join(notes, "local.svg"), Buffer.from("<svg/>"));
		const note = pluginNote(
			"## Embedded Files\nvault000: [[attachments/logo.png]]\n\nlocal000: [[local.svg]]\n\n",
		);

		const resolved = resolveEmbeddedImages(note, join(notes, "board.excalidraw.md"), vault);
		expect(resolved.vault000).toMatchObject({
			id: "vault000",
			dataURL: `data:image/png;base64,${Buffer.from("vault-image").toString("base64")}`,
			mimeType: "image/png",
		});
		expect(resolved.local000).toMatchObject({
			dataURL: `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
			mimeType: "image/svg+xml",
		});
	});

	test("a unique bare filename resolves but an ambiguous one is refused", () => {
		fs.mkdirSync(join(vault, "one"), { recursive: true });
		fs.writeFileSync(join(vault, "one", "logo.png"), Buffer.from("one"));
		const note = pluginNote("## Embedded Files\nabc12345: [[logo.png]]\n\n");
		expect(
			resolveEmbeddedImages(note, join(vault, "board.excalidraw.md"), vault).abc12345,
		).toBeDefined();

		fs.mkdirSync(join(vault, "two"), { recursive: true });
		fs.writeFileSync(join(vault, "two", "logo.png"), Buffer.from("two"));
		expect(resolveEmbeddedImages(note, join(vault, "board.excalidraw.md"), vault)).toEqual({});
	});

	test("missing, escaping, HTTP, and equation targets resolve to no local image", () => {
		const note = pluginNote(
			[
				"## Embedded Files",
				"missing1: [[gone.png]]",
				"escape01: [[../../etc/passwd.png]]",
				"remote01: https://example.com/logo.png",
				"equation: $$x^2$$",
				"",
				"",
			].join("\n"),
		);
		expect(resolveEmbeddedImages(note, join(vault, "board.excalidraw.md"), vault)).toEqual({});
	});
});
