import { describe, expect, test } from "bun:test";

import { applyElementInput } from "../apply-element-input.ts";
import { extractSceneJsonFromObsidianMd, wrapSceneAsObsidianMd } from "../obsidian-md.ts";
import { buildScene } from "../scene-document.ts";
import type { ServerElement } from "../types.ts";
import { derivedId, isBlockId, mintId } from "../../../shared/ids/ids.ts";
import { impostorText, rectangle, scene, text } from "./support/obsidian-fixtures.ts";

function idsInNote(note: string): string[] {
	const parsed = JSON.parse(extractSceneJsonFromObsidianMd(note)) as {
		elements: Array<{ id: string }>;
	};
	return parsed.elements.map((element) => element.id);
}

describe("server-minted ids", () => {
	test("a labelled shape, labelled arrow, and standalone text need no note-boundary rename", () => {
		const inputBoard = new Map<string, ServerElement>();
		applyElementInput(inputBoard, {
			origin: "agent",
			upserts: [
				{
					type: "rectangle",
					x: 0,
					y: 0,
					width: 200,
					height: 100,
					label: { text: "AuthService" },
				},
				{
					type: "arrow",
					x: 0,
					y: 0,
					points: [
						[0, 0],
						[220, 0],
					],
					label: { text: "HTTP" },
				},
				{ type: "text", x: 0, y: 200, text: "a note somebody left" },
			],
		});
		const { scene: built } = buildScene([...inputBoard.values()]);
		const elements = built.elements as ServerElement[];
		const minted = elements.map((element) => element.id);

		expect(minted).toHaveLength(5);
		expect(minted.every(isBlockId)).toBe(true);
		expect(minted.every((id) => id.length >= 1 && id.length <= 8)).toBe(true);
		expect(minted.every((id) => /^[A-Za-z0-9]+$/.test(id))).toBe(true);

		const note = wrapSceneAsObsidianMd(built);
		expect(idsInNote(note)).toEqual(minted);
		for (const element of JSON.parse(extractSceneJsonFromObsidianMd(note))
			.elements as ServerElement[]) {
			if (!element.containerId) continue;
			expect(minted).toContain(element.containerId);
			expect(note).toContain(`^${element.id}`);
		}
		expect(wrapSceneAsObsidianMd(built, note)).toBe(note);
	});

	test("200 random mints all use the Obsidian block-id alphabet and length", () => {
		const ids = Array.from({ length: 200 }, () => mintId());
		expect(ids.every(isBlockId)).toBe(true);
		expect(ids.every((id) => /^[A-Za-z0-9]{8}$/.test(id))).toBe(true);
	});
});

describe("historical derived ids", () => {
	test.each([
		["text-plain", "Koh9JpWT"],
		["0fiCOql98KV5AVNsb7yti", "QO4jtmur"],
		["M0uzDDmr3XAuPV1LLV0qO", "vbJqUUt6"],
		["GOThTByyWuX7VIo4b-EbG", "ct9GeNvu"],
	] as const)("%s retains the historical golden id %s", (before, after) => {
		expect(derivedId(before)).toBe(after);
	});

	test("a pre-existing vault note settles foreign text ids once and then stays byte-identical", () => {
		const foreign = scene([
			{ ...rectangle, id: "M0uzDDmr3XAuPV1LLV0qO" },
			{ ...text, id: "0fiCOql98KV5AVNsb7yti" },
			{ ...impostorText, id: "text-plain" },
		]);
		const vaultNote = wrapSceneAsObsidianMd(foreign);
		expect(idsInNote(vaultNote)).toEqual(["M0uzDDmr3XAuPV1LLV0qO", "QO4jtmur", "Koh9JpWT"]);

		const reopened = JSON.parse(extractSceneJsonFromObsidianMd(vaultNote)) as Record<
			string,
			unknown
		>;
		const resaved = wrapSceneAsObsidianMd(reopened, vaultNote);
		expect(resaved).toBe(vaultNote);
		expect(idsInNote(resaved)).toEqual(idsInNote(vaultNote));
	});
});

describe("id collisions", () => {
	test("a salted derivation avoids a taken golden and remains deterministic", () => {
		const taken = new Set(["Koh9JpWT"]);
		const second = derivedId("text-plain", taken);
		expect(second).not.toBe("Koh9JpWT");
		expect(isBlockId(second)).toBe(true);
		expect(derivedId("text-plain", taken)).toBe(second);
	});

	test("mintId retries every refused candidate and never returns one", () => {
		const refused: string[] = [];
		const inUse = {
			has: (id: string) => {
				if (refused.length >= 3) return false;
				refused.push(id);
				return true;
			},
		};
		const eventual = mintId(inUse);
		expect(refused).toHaveLength(3);
		expect(refused).not.toContain(eventual);
	});
});
