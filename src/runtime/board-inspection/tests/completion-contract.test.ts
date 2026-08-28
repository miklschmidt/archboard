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
	source: "vault" as const,
});

describe("inspection completion contract", () => {
	test("keeps dense fixture hashes and exact compare bytes", async () => {
		const hashes = await Promise.all(
			["dense-before.excalidraw.json", "dense-after.excalidraw.json", "dense-compare.json"].map(
				async (name) => [name, new Bun.CryptoHasher("sha256").update(fixture(name)).digest("hex")],
			),
		);
		expect(Object.fromEntries(hashes)).toEqual({
			"dense-before.excalidraw.json":
				"15ad0be2a4f005cacd7c4ae87018c8d9bd3109c21ba29e20d50487e3666dca65",
			"dense-after.excalidraw.json":
				"e50affe508ab77f1915ae46868d0d5104aab2c0f4d01b39cb467dd0eabd9dbd9",
			"dense-compare.json": "e185e6a66e01f9ba8b2126abfa05014c5f105a01cb06d47f61fa5ec0a53e2899",
		});
		const before = scene("dense-before.excalidraw.json");
		const after = scene("dense-after.excalidraw.json");
		const compared = compareBoards(compareInput(before), compareInput(after));
		expect(`${JSON.stringify(compared, null, 2)}\n`).toBe(
			fixture("dense-compare.json").toString("utf8"),
		);
	});

	test("reroutes the whole board without changing grouped, stencil, or decoration records", () => {
		const before = scene("dense-before.excalidraw.json") as Record<string, unknown>[];
		const after = scene("dense-after.excalidraw.json") as Record<string, unknown>[];
		expect(inspectBoard(before).coverage).toBe("complete");
		expect(inspectBoard(after).coverage).toBe("complete");
		const beforeById = new Map(before.map((element) => [element.id, element]));
		expect(
			after.every(
				(element) =>
					element.id === "v" ||
					JSON.stringify(element) === JSON.stringify(beforeById.get(element.id)),
			),
		).toBe(true);
	});

	test("links the inspection completion eval to this native contract only", () => {
		const evalsPath = fileURLToPath(
			new URL("../../../../skills/archboard/evals/evals.json", import.meta.url),
		);
		const document = JSON.parse(readFileSync(evalsPath, "utf8")) as {
			evals: Array<{ id: number; graded_by: string; files: string[] }>;
		};
		const completion = document.evals.find(({ id }) => id === 8);
		expect(completion).toMatchObject({
			graded_by: "src/runtime/board-inspection/tests/completion-contract.test.ts",
			files: [
				"src/runtime/board-inspection/tests/completion-contract.test.ts",
				"scripts/check-branch-compare.mjs",
				"scripts/check-side-by-side.mjs",
			],
		});
		expect(document.evals.find(({ id }) => id === 5)?.graded_by).toBe(
			"scripts/check-branch-compare.mjs",
		);
		expect(document.evals.find(({ id }) => id === 7)?.graded_by).toBe(
			"scripts/check-side-by-side.mjs",
		);
		expect(document.evals.find(({ id }) => id === 5)?.files).toEqual([]);
		expect(document.evals.find(({ id }) => id === 7)?.files).toEqual([]);
	});
});
