import { expect, test } from "bun:test";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { createJsonRequester } from "../boards/support/http.ts";
import { openTestPane } from "../boards/support/pane-websocket.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { snapshotElements } from "./fixtures/snapshot-scenes.ts";
import { nonReadRecords, startCountingProxy } from "./support/counting-proxy.ts";
import {
	availablePort,
	parseCliJson,
	runCli,
	sanitizedEnvironment,
} from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const RestoreSchema = z.object({
	success: z.literal(true),
	name: z.string(),
	board: z.string(),
	restored: z.number(),
});
const HeldRestoreSchema = RestoreSchema.extend({
	held: z.object({ board: z.string() }).passthrough(),
});
interface SnapshotElement {
	id: string;
	customData?: { archboard?: { binding?: { path?: string } } };
}

test("snapshot refusal is zero writes and restore replaces scene once", async () => {
	const resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-snapshot-one-write-"));
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
	const pane = await openTestPane(canvas.base, request, "snapshot-pane", 0, { board: "target" });
	resources.defer(() => pane.close());
	try {
		await request("/api/boards/new", { method: "POST", body: { board: "source" } });
		await request("/api/elements/batch?board=source", {
			method: "POST",
			body: { elements: snapshotElements },
		});
		await request("/api/files?board=source", {
			method: "POST",
			body: [
				{
					id: "snapshot-file",
					dataURL: "data:image/png;base64,c25hcHNob3Q=",
					mimeType: "image/png",
					created: 1,
				},
			],
		});
		await request("/api/snapshots?board=source", { method: "POST", body: { name: "scene" } });
		const sourceDocument = await request<{ elements: SnapshotElement[] }>(
			"/api/elements?board=source",
		);
		await request("/api/boards/new", { method: "POST", body: { board: "target" } });
		await pane.adopt("target");
		await request("/api/elements/batch?board=target", {
			method: "POST",
			body: { elements: [{ id: "old", type: "rectangle", x: 0, y: 0, width: 20, height: 20 }] },
		});
		await request("/api/selection", {
			method: "POST",
			body: { clientId: pane.clientId, elementIds: ["old"] },
		});
		await proxy.reset();
		const refused = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: ["snapshot", "restore", "scene", "--board", "target", "--doing", "bad restore"],
		});
		expect(refused.status).toBe(1);
		expect(refused.stderr).toContain("Pass --board source");
		expect(nonReadRecords(await proxy.snapshot())).toHaveLength(0);
		const before = await request<{ version: number }>("/api/boards/info?board=target");
		await proxy.reset();
		const frameStart = pane.since();
		const restored = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: [
				"snapshot",
				"restore",
				"scene",
				"--force",
				"--board",
				"target",
				"--doing",
				"restore snapshot",
			],
		});
		await Bun.sleep(80);
		expect(restored.status).toBe(0);
		expect(parseCliJson(restored, RestoreSchema)).toEqual({
			success: true,
			name: "scene",
			board: "target",
			restored: 2,
		});
		const restoreRecords = nonReadRecords(await proxy.snapshot());
		expect(restoreRecords).toHaveLength(1);
		const restoreRecord = restoreRecords[0]!;
		expect(restoreRecord).toMatchObject({ method: "POST", pathname: "/api/elements/batch" });
		expect(restoreRecord.query).toBe("?board=target&doing=restore%20snapshot&expectVersion=1");
		expect(Buffer.from(restoreRecord.bodyBase64, "base64").toString()).toBe(
			JSON.stringify({
				elements: sourceDocument.body.elements,
				files: [],
				mutation: "replace-scene",
			}),
		);
		const elements = await request<{ elements: SnapshotElement[] }>("/api/elements?board=target");
		expect(elements.body.elements.map((element) => element.id)).toEqual([
			"snap-node",
			"snap-image",
		]);
		expect(elements.body.elements[0]?.customData?.archboard?.binding?.path).toBe(
			"src/snapshot/original.ts",
		);
		expect(
			Object.keys(
				(await request<{ files: Record<string, unknown> }>("/api/files?board=target")).body.files,
			),
		).toEqual([]);
		expect((await request<{ version: number }>("/api/boards/info?board=target")).body.version).toBe(
			before.body.version + 1,
		);
		const frames = pane.seen.slice(frameStart);
		const deltas = frames.filter((frame) => frame.type === "elements_changed");
		expect(deltas).toHaveLength(1);
		expect(deltas[0]?.deleted).toContain("old");
		expect(deltas[0]?.created).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: "snap-node" })]),
		);
		expect(frames.filter((frame) => frame.type === "files_replaced")).toEqual([
			expect.objectContaining({ board: "target", files: [] }),
		]);
		const panes = await request<{
			panes: Array<{ paneId: string; selection?: { count: number } }>;
		}>("/api/panes");
		expect(panes.body.panes.find((entry) => entry.paneId === pane.clientId)?.selection?.count).toBe(
			0,
		);
		await request("/api/elements/snap-node?board=target", {
			method: "PUT",
			body: {
				customData: {
					archboard: {
						node: "snapshot-node",
						binding: { repository: "archboard", path: "changed.ts" },
					},
				},
			},
		});
		await proxy.reset();
		const repeated = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: [
				"snapshot",
				"restore",
				"scene",
				"--force",
				"--board",
				"target",
				"--doing",
				"repeat restore",
			],
		});
		expect(repeated.status).toBe(0);
		const repeatedRecords = nonReadRecords(await proxy.snapshot());
		expect(repeatedRecords).toHaveLength(1);
		expect(repeatedRecords[0]).toMatchObject({
			method: "POST",
			pathname: "/api/elements/batch",
			query: "?board=target&doing=repeat%20restore&expectVersion=3",
		});
		expect(Buffer.from(repeatedRecords[0]!.bodyBase64, "base64").toString()).toBe(
			JSON.stringify({
				elements: sourceDocument.body.elements,
				files: [],
				mutation: "replace-scene",
			}),
		);
		const node = (
			await request<{ elements: SnapshotElement[] }>("/api/elements?board=target")
		).body.elements.find((element) => element.id === "snap-node");
		expect(node).toBeDefined();
		expect(node!.customData?.archboard?.binding?.path).toBe("src/snapshot/original.ts");
		const sourceNode = (
			await request<{ elements: SnapshotElement[] }>("/api/elements?board=source")
		).body.elements.find((element) => element.id === "snap-node");
		expect(sourceNode?.customData?.archboard?.binding?.path).toBe("src/snapshot/original.ts");

		await request("/api/boards/new", { method: "POST", body: { board: "held-target" } });
		await request("/api/elements/batch?board=held-target", {
			method: "POST",
			body: {
				elements: [
					{ id: "held-old", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
					{
						id: "held-image",
						type: "image",
						x: 30,
						y: 0,
						width: 20,
						height: 20,
						fileId: "held-file",
					},
				],
			},
		});
		await request("/api/files?board=held-target", {
			method: "POST",
			body: [
				{
					id: "held-file",
					dataURL: "data:image/png;base64,aGVsZA==",
					mimeType: "image/png",
					created: 1,
				},
			],
		});
		const heldInfo = await request<{ file: string; version: number }>(
			"/api/boards/info?board=held-target",
		);
		appendFileSync(heldInfo.body.file, "\nexternal snapshot edit\n");
		const stopped = await request<{ success: boolean; held?: { board: string } }>(
			"/api/elements/batch?board=held-target",
			{
				method: "POST",
				body: {
					elements: [{ id: "refused", type: "ellipse", x: 1, y: 1, width: 5, height: 5 }],
				},
			},
		);
		expect(stopped.body).toMatchObject({ success: false, held: { board: "held-target" } });
		const heldBytes = readFileSync(heldInfo.body.file);
		const heldMtime = statSync(heldInfo.body.file).mtimeMs;
		await proxy.reset();
		const heldRestore = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: [
				"snapshot",
				"restore",
				"scene",
				"--force",
				"--board",
				"held-target",
				"--doing",
				"held snapshot restore",
			],
		});
		expect(heldRestore.status).toBe(0);
		expect(heldRestore.stderr).toContain("stopped saving");
		expect(parseCliJson(heldRestore, HeldRestoreSchema)).toMatchObject({
			success: true,
			name: "scene",
			board: "held-target",
			restored: 2,
			held: { board: "held-target" },
		});
		const heldRecords = nonReadRecords(await proxy.snapshot());
		expect(heldRecords).toHaveLength(1);
		expect(heldRecords[0]).toMatchObject({
			method: "POST",
			pathname: "/api/elements/batch",
			query: "?board=held-target&doing=held%20snapshot%20restore&expectVersion=2",
		});
		expect(Buffer.from(heldRecords[0]!.bodyBase64, "base64").toString()).toBe(
			JSON.stringify({
				elements: sourceDocument.body.elements,
				files: [],
				mutation: "replace-scene",
			}),
		);
		const heldElements = await request<{
			elements: SnapshotElement[];
			held: { writes: number };
		}>("/api/elements?board=held-target");
		expect(heldElements.body.elements.map((element) => element.id)).toEqual([
			"snap-node",
			"snap-image",
		]);
		expect(heldElements.body.held.writes).toBe(1);
		expect(
			Object.keys(
				(await request<{ files: Record<string, unknown> }>("/api/files?board=held-target")).body
					.files,
			),
		).toEqual([]);
		expect(readFileSync(heldInfo.body.file)).toEqual(heldBytes);
		expect(statSync(heldInfo.body.file).mtimeMs).toBe(heldMtime);
		expect(
			(await request<{ version: number }>("/api/boards/info?board=held-target")).body.version,
		).toBe(heldInfo.body.version);
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);
