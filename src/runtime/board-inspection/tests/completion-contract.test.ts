import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compareBoards } from "../../engine/compare.js";
import type { ServerElement } from "../../engine/types.js";
import { inspectBoard } from "../index.js";

const fixture = (name: string) =>
	readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));
const scene = (name: string) => JSON.parse(fixture(name).toString("utf8"));
const compareInput = (elements: unknown[]) => ({
	key: "dense",
	identity: { board: "dense", variant: "current" as const },
	elements: elements as ServerElement[],
});

describe("inspection completion contract", () => {
	test("compares the dense before and after boards", () => {
		const before = scene("dense-before.excalidraw.json");
		const after = scene("dense-after.excalidraw.json");
		const compared = compareBoards(compareInput(before), compareInput(after));
		expect(`${JSON.stringify(compared, null, 2)}\n`).toBe(
			fixture("dense-compare.json").toString("utf8"),
		);
	});

	test("inspects both dense boards completely", () => {
		const before = scene("dense-before.excalidraw.json") as Record<string, unknown>[];
		const after = scene("dense-after.excalidraw.json") as Record<string, unknown>[];
		expect(inspectBoard(before).coverage).toBe("complete");
		expect(inspectBoard(after).coverage).toBe("complete");
	});
});
