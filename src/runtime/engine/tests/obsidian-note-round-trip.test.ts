import { describe, expect, test } from "bun:test";

import { extractSceneJsonFromObsidianMd, wrapSceneAsObsidianMd } from "../obsidian-md.ts";
import {
	FRESH_NOTE,
	PROSE,
	QUOTED_HEADINGS,
	TAIL,
	board,
	impostorText,
	rectangle,
	scene,
	text,
} from "./support/obsidian-fixtures.ts";

function expectStable(
	note: string,
	expectedScene: Record<string, unknown>,
	expectedHeadingCount = 1,
): void {
	expect(wrapSceneAsObsidianMd(expectedScene, note)).toBe(note);
	expect(wrapSceneAsObsidianMd(expectedScene, wrapSceneAsObsidianMd(expectedScene, note))).toBe(
		note,
	);
	const parsed = JSON.parse(extractSceneJsonFromObsidianMd(note)) as Record<string, unknown>;
	expect(parsed.type).toBe("excalidraw");
	expect(parsed.elements).toHaveLength((expectedScene.elements as unknown[]).length);
	expect(note).toContain("\n# Excalidraw Data\n## Text Elements\n");
	expect(note.startsWith("---\n")).toBe(true);
	expect(note.match(/^# Excalidraw Data[ \t]*$/gm)).toHaveLength(expectedHeadingCount);
}

describe("fresh Obsidian notes", () => {
	test("a new board serializes to the exact plugin-shaped bytes", () => {
		const fresh = wrapSceneAsObsidianMd(board);
		expect(fresh).toBe(FRESH_NOTE);
		expect(fresh).toContain("Switch to EXCALIDRAW VIEW");
		expect(fresh).toContain("AuthService ^text-one");
		expect(fresh.endsWith("```\n%%")).toBe(true);
		expectStable(fresh, board);
	});

	test("an empty destination produces the same exact bytes as a missing destination", () => {
		const fromEmpty = wrapSceneAsObsidianMd(board, "");
		expect(fromEmpty).toBe(FRESH_NOTE);
		expectStable(fromEmpty, board);
	});

	test("frontmatter-only notes keep custom keys and gain the banner", () => {
		const note = wrapSceneAsObsidianMd(board, "---\naliases: [payments]\n---\n");
		expect(note).toContain("aliases: [payments]");
		expect(note).toContain("Switch to EXCALIDRAW VIEW");
		expectStable(note, board);
	});

	test("plain prose becomes a board without losing a byte of prose", () => {
		const plain = "# Payments\n\nNotes I took before there was a diagram.\n";
		const note = wrapSceneAsObsidianMd(board, plain);
		expect(note).toContain(plain);
		expect(note).toContain("Switch to EXCALIDRAW VIEW");
		expect(note).toContain("excalidraw-plugin: parsed");
		expectStable(note, board);
	});
});

describe("human-authored note regions", () => {
	test("prose above the data section survives unchanged and a moved scene regenerates", () => {
		const withProse = FRESH_NOTE.replace(
			"\n# Excalidraw Data\n",
			`\n${PROSE}\n# Excalidraw Data\n`,
		);
		expect(wrapSceneAsObsidianMd(board, withProse)).toBe(withProse);
		expectStable(withProse, board);

		const moved = scene([{ ...rectangle, x: 999 }, text]);
		const afterMove = wrapSceneAsObsidianMd(moved, withProse);
		expect(afterMove).toContain(PROSE);
		expect(afterMove).toContain('"x": 999');
		expectStable(afterMove, moved);
	});

	test("prose after the Drawing block survives unchanged", () => {
		const note = FRESH_NOTE + TAIL;
		expect(wrapSceneAsObsidianMd(board, note)).toBe(note);
		expectStable(note, board);
	});

	test("prose on both sides survives unchanged", () => {
		const note =
			FRESH_NOTE.replace("\n# Excalidraw Data\n", `\n${PROSE}\n# Excalidraw Data\n`) + TAIL;
		expect(wrapSceneAsObsidianMd(board, note)).toBe(note);
		expectStable(note, board);
	});

	test("a fenced example of plugin headings is content, not a region boundary", () => {
		const note = FRESH_NOTE.replace(
			"\n# Excalidraw Data\n",
			`\n${QUOTED_HEADINGS}\n# Excalidraw Data\n`,
		);
		expect(wrapSceneAsObsidianMd(board, note)).toBe(note);
		expect(note).toContain("````markdown");
		expectStable(note, board, 2);
	});

	test("deleting the banner is a human edit and does not cause reinsertion", () => {
		const bannerless = FRESH_NOTE.replace(/^==⚠.*⚠==\n\n\n/m, "");
		expect(wrapSceneAsObsidianMd(board, bannerless)).toBe(bannerless);
		expect(bannerless).not.toContain("Switch to EXCALIDRAW VIEW");
		expectStable(bannerless, board);
	});
});

describe("plugin-shaped text and frontmatter", () => {
	test("text containing plugin headings remains idempotent and does not grow the note", () => {
		const impostorBoard = scene([rectangle, impostorText]);
		const note = wrapSceneAsObsidianMd(impostorBoard);
		expect(wrapSceneAsObsidianMd(impostorBoard, wrapSceneAsObsidianMd(impostorBoard, note))).toBe(
			note,
		);
		expectStable(note, impostorBoard, 2);
	});

	test("custom frontmatter survives while the board identity key is upserted", () => {
		const custom = FRESH_NOTE.replace(
			"excalidraw-plugin: parsed",
			"aliases:\n  - payments\nexcalidraw-plugin: parsed",
		);
		const oneElementBoard = scene([rectangle]);
		const saved = wrapSceneAsObsidianMd(oneElementBoard, custom, {
			frontmatter: [["archboard-board", "payments"]],
		});
		expect(saved).toContain("  - payments");
		expect(saved).toContain("archboard-board: payments");
		expectStable(saved, oneElementBoard);
	});
});
