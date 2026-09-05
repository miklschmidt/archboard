import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { labelTextIdFor } from "../../../src/runtime/engine/labels.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import type { OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "./support/http.ts";

interface Element {
	readonly id: string;
	readonly type: string;
	readonly label?: unknown;
	readonly start?: unknown;
	readonly end?: unknown;
	readonly containerId?: string;
	readonly startBinding?: { readonly elementId: string } | null;
	readonly endBinding?: { readonly elementId: string } | null;
	readonly boundElements?: readonly { readonly id: string; readonly type: string }[];
}

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-conversion-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;

beforeAll(async () => {
	canvas = await startOwnedCanvas({ serverPath: path.join(repoRoot, "src/server.ts"), vault });
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await canvas.dispose();
});

describe("write-boundary conversion", () => {
	test("spends labels and arrow endpoint references on the way in", async () => {
		await request("/api/boards/new", { method: "POST", body: { board: "converted" } });
		const written = await request<{ elements: Element[] }>("/api/elements/batch?board=converted", {
			method: "POST",
			body: {
				elements: [
					{
						id: "left",
						type: "rectangle",
						x: 0,
						y: 0,
						width: 200,
						height: 100,
						label: { text: "Client" },
					},
					{
						id: "right",
						type: "rectangle",
						x: 400,
						y: 0,
						width: 200,
						height: 100,
						label: { text: "API" },
					},
					{
						id: "edge",
						type: "arrow",
						x: 200,
						y: 50,
						points: [
							[0, 0],
							[200, 0],
						],
						start: { id: "left" },
						end: { id: "right" },
						label: { text: "HTTP" },
					},
				],
			},
		});
		expect(written.status).toBe(200);
		const board = await request<{ count: number; elements: Element[] }>(
			"/api/elements?board=converted",
		);
		expect(board.body.count).toBe(6);
		expect(board.body.elements.every((element) => element.label === undefined)).toBeTrue();
		expect(board.body.elements.every((element) => element.start === undefined)).toBeTrue();
		expect(board.body.elements.every((element) => element.end === undefined)).toBeTrue();
		const edge = board.body.elements.find((element) => element.id === "edge");
		if (edge === undefined) {
			throw new Error("Converted board did not retain its edge.");
		}
		expect(edge.startBinding?.elementId).toBe("left");
		expect(edge.endBinding?.elementId).toBe("right");
		for (const container of board.body.elements.filter((element) => element.boundElements)) {
			const labelId = container.boundElements?.find((entry) => entry.type === "text")?.id;
			expect(labelId).toBe(labelTextIdFor(container.id));
			expect(board.body.elements.find((element) => element.id === labelId)?.containerId).toBe(
				container.id,
			);
		}
	});
});
