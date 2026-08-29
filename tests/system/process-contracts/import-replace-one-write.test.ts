import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { createJsonRequester } from "../boards/support/http.ts";
import { openTestPane } from "../boards/support/pane-websocket.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { replaceScene } from "./fixtures/import-scenes.ts";
import { nonReadRecords, startCountingProxy } from "./support/counting-proxy.ts";
import {
	availablePort,
	parseCliJson,
	runCli,
	sanitizedEnvironment,
} from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const ReceiptSchema = z.object({
	success: z.literal(true),
	imported: z.number(),
	files: z.number(),
	mode: z.literal("replace"),
});
type ImportedElement = ExcalidrawElement & {
	customData?: { archboard?: { node?: string; binding?: { path?: string } } };
};
type ImportedArrow = Extract<ExcalidrawElement, { type: "arrow" }> & ImportedElement;

test("image replace persists one canonical batch before its frames", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-import-replace-"));
	resources.defer(() => rmSync(root, { recursive: true, force: true }));
	const vault = join(root, "vault");
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: sanitizedEnvironment(root, vault),
	});
	resources.defer(() => canvas.dispose());
	const proxy = await startCountingProxy({
		port: await availablePort(),
		upstream: canvas.base,
		env: sanitizedEnvironment(root, vault),
	});
	resources.defer(() => proxy.dispose());
	const request = createJsonRequester(canvas);
	const pane = await openTestPane(canvas.base, request, "import-pane", 0, { board: "replace" });
	resources.defer(() => pane.close());
	try {
		await request("/api/boards/new", { method: "POST", body: { board: "replace" } });
		await pane.adopt("replace");
		await request("/api/elements/batch?board=replace", {
			method: "POST",
			body: {
				elements: [
					{ id: "old", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
					{
						id: "old-image",
						type: "image",
						x: 30,
						y: 0,
						width: 20,
						height: 20,
						fileId: "stale-file",
					},
				],
			},
		});
		await request("/api/files?board=replace", {
			method: "POST",
			body: [
				{
					id: "stale-file",
					dataURL: "data:image/png;base64,b2xk",
					mimeType: "image/png",
					created: 1,
				},
			],
		});
		await request("/api/selection", {
			method: "POST",
			body: { clientId: pane.clientId, elementIds: ["old"] },
		});
		const before = await request<{ file: string; version: number }>(
			"/api/boards/info?board=replace",
		);
		let noteAtDelta: string | undefined;
		let observe = false;
		pane.socket.on("message", (data) => {
			const message = JSON.parse(data.toString()) as { type?: string; board?: string };
			if (observe && message.type === "elements_changed" && message.board === "replace")
				noteAtDelta = readFileSync(before.body.file, "utf8");
		});
		const file = join(root, "replace.excalidraw");
		writeFileSync(file, JSON.stringify(replaceScene));
		await proxy.reset();
		const start = pane.since();
		observe = true;
		const result = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: ["import", file, "--replace", "--board", "replace", "--doing", "replacing scene"],
		});
		await Bun.sleep(80);
		observe = false;
		expect(result.status).toBe(0);
		expect(parseCliJson(result, ReceiptSchema)).toEqual({
			success: true,
			imported: 4,
			files: 2,
			mode: "replace",
		});
		const records = nonReadRecords(await proxy.snapshot());
		expect(records).toHaveLength(1);
		expect(records[0]).toMatchObject({
			method: "POST",
			pathname: "/api/elements/batch",
			query: "?board=replace&doing=replacing%20scene",
		});
		expect(Buffer.from(records[0]!.bodyBase64, "base64").toString()).toBe(
			JSON.stringify({
				elements: replaceScene.elements,
				files: Object.values(replaceScene.files),
				mutation: "replace-scene",
			}),
		);
		const elements = (await request<{ elements: ImportedElement[] }>("/api/elements?board=replace"))
			.body.elements;
		expect(elements.some((element) => ["old", "old-image"].includes(element.id))).toBeFalse();
		const container = elements.find(
			(element) => element.customData?.archboard?.node === "replacement-node",
		)!;
		expect(container.id).toBe("replacement-container-id-too-long");
		expect(container.customData?.archboard?.binding?.path).toBe(
			"src/runtime/engine/scene-document.ts",
		);
		expect(
			elements.some((element) => element.type === "text" && element.containerId === container.id),
		).toBeTrue();
		expect(
			elements.find((element): element is ImportedArrow => element.type === "arrow")?.startBinding
				?.elementId,
		).toBe(container.id);
		expect(elements.find((element) => element.type === "ellipse")?.id.length).toBeLessThanOrEqual(
			8,
		);
		expect(new Set(elements.map((element) => element.index)).size).toBe(elements.length);
		const files = (
			await request<{ files: Record<string, { dataURL: string }> }>("/api/files?board=replace")
		).body.files;
		expect(Object.keys(files)).toEqual(["reused-file"]);
		expect(files["reused-file"]?.dataURL).toBe("data:image/png;base64,bmV3");
		expect(
			(await request<{ version: number }>("/api/boards/info?board=replace")).body.version,
		).toBe(before.body.version + 1);
		const frames = pane.seen.slice(start);
		const deltas = frames.filter((frame) => frame.type === "elements_changed");
		expect(deltas).toHaveLength(1);
		expect(deltas[0]?.deleted).toEqual(expect.arrayContaining(["old", "old-image"]));
		expect(deltas[0]?.created).toBeArray();
		expect(noteAtDelta).toContain("data:image/png;base64,bmV3");
		expect(noteAtDelta).not.toContain("data:image/png;base64,b2xk");
		expect(noteAtDelta).not.toContain("data:image/png;base64,b3JwaGFu");
		expect(noteAtDelta).not.toMatch(/\^(?:old|old-image)\b/);
		const fileFrames = frames.filter((frame) => frame.type === "files_replaced");
		expect(fileFrames).toHaveLength(1);
		expect(fileFrames[0]?.files).toEqual([
			{
				id: "reused-file",
				dataURL: "data:image/png;base64,bmV3",
				mimeType: "image/png",
				created: 2,
			},
		]);
		const panes = await request<{
			panes: Array<{ paneId: string; selection?: { count: number } }>;
		}>("/api/panes");
		expect(panes.body.panes.find((entry) => entry.paneId === pane.clientId)?.selection?.count).toBe(
			0,
		);
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);
