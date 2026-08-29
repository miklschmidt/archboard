import { expect, test } from "bun:test";
import {
	appendFileSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { heldReplaceScene, mergeScene } from "./fixtures/import-scenes.ts";
import { nonReadRecords, startCountingProxy } from "./support/counting-proxy.ts";
import {
	availablePort,
	parseCliJson,
	runCli,
	sanitizedEnvironment,
} from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
type ElementIdView = Pick<ExcalidrawElement, "id">;
const ConflictSchema = z
	.object({
		board: z.string(),
		file: z.string(),
		reason: z.enum(["changed", "unseen"]),
		expectedHash: z.string().optional(),
		actualHash: z.string(),
		lastReadAt: z.string().optional(),
		fileModifiedAt: z.string().optional(),
		versionMove: z.enum(["unchanged", "behind", "ahead", "unknown"]),
		expectedVersion: z.number().optional(),
		actualVersion: z.number().optional(),
		outcomes: z.object({ reload: z.string(), overwrite: z.string(), saveAs: z.string() }).strict(),
		message: z.string(),
	})
	.strict();
const HeldSchema = z
	.object({
		board: z.string(),
		since: z.string(),
		writes: z.number().int().nonnegative(),
		fromScreen: z.boolean(),
		conflict: ConflictSchema,
		message: z.string(),
	})
	.strict();
const MergeReceiptSchema = z
	.object({
		success: z.literal(true),
		imported: z.number().int().nonnegative(),
		files: z.number().int().nonnegative(),
		mode: z.literal("merge"),
	})
	.strict();
const HeldReplaceReceiptSchema = z
	.object({
		success: z.literal(true),
		imported: z.number().int().nonnegative(),
		files: z.number().int().nonnegative(),
		mode: z.literal("replace"),
		held: HeldSchema,
	})
	.strict();

test("merge and held replace each use one batch without advancing held persistence", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-import-held-"));
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
	try {
		await request("/api/boards/new", { method: "POST", body: { board: "held" } });
		await request("/api/elements/batch?board=held", {
			method: "POST",
			body: { elements: [{ id: "old", type: "rectangle", x: 0, y: 0, width: 20, height: 20 }] },
		});
		const mergeFile = join(root, "merge.excalidraw");
		writeFileSync(mergeFile, JSON.stringify(mergeScene));
		await proxy.reset();
		const merged = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: ["import", mergeFile, "--board", "held", "--doing", "merging scene"],
		});
		expect(merged.status).toBe(0);
		expect(parseCliJson(merged, MergeReceiptSchema)).toEqual({
			success: true,
			imported: 1,
			files: 0,
			mode: "merge",
		});
		const mergeWrites = nonReadRecords(await proxy.snapshot());
		expect(mergeWrites).toHaveLength(1);
		expect(mergeWrites[0]).toMatchObject({
			method: "POST",
			pathname: "/api/elements/batch",
			query: "?board=held&doing=merging%20scene",
		});
		expect(Buffer.from(mergeWrites[0]!.bodyBase64, "base64").toString()).toBe(
			JSON.stringify({ elements: mergeScene.elements }),
		);
		const afterMerge = await request<{ elements: ElementIdView[] }>("/api/elements?board=held");
		expect(afterMerge.body.elements.map((element) => element.id).toSorted()).toEqual([
			"merge-addition",
			"old",
		]);
		await request("/api/elements/batch?board=held", {
			method: "POST",
			body: {
				elements: [
					{ id: "held-new", type: "rectangle", x: 1, y: 2, width: 3, height: 4 },
					{ id: "held-stale", type: "diamond", x: 5, y: 6, width: 7, height: 8 },
					{
						id: "held-stale-image",
						type: "image",
						x: 9,
						y: 10,
						width: 11,
						height: 12,
						fileId: "stale-file",
					},
				],
			},
		});
		await request("/api/files?board=held", {
			method: "POST",
			body: [
				{
					id: "reused-file",
					dataURL: "data:image/png;base64,b2xkLXJldXNlZA==",
					mimeType: "image/png",
					created: 1,
				},
				{
					id: "stale-file",
					dataURL: "data:image/png;base64,c3RhbGU=",
					mimeType: "image/png",
					created: 1,
				},
			],
		});

		const info = await request<{ file: string; version: number }>("/api/boards/info?board=held");
		appendFileSync(info.body.file, "\nexternal edit\n");
		await request("/api/elements/batch?board=held", {
			method: "POST",
			body: { elements: [{ id: "trigger", type: "rectangle", x: 1, y: 1, width: 5, height: 5 }] },
		});
		const bytes = readFileSync(info.body.file);
		const mtime = statSync(info.body.file).mtimeMs;
		const heldFile = join(root, "held.excalidraw");
		writeFileSync(heldFile, JSON.stringify(heldReplaceScene));
		await proxy.reset();
		const replaced = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: ["import", heldFile, "--replace", "--board", "held", "--doing", "held replace"],
		});
		expect(replaced.status).toBe(0);
		expect(replaced.stderr).toContain("stopped saving");
		const replacedReceipt = parseCliJson(replaced, HeldReplaceReceiptSchema);
		expect(replacedReceipt).toEqual({
			success: true,
			imported: 2,
			files: 2,
			mode: "replace",
			held: {
				...replacedReceipt.held,
				board: "held",
				writes: 1,
				fromScreen: false,
				conflict: {
					...replacedReceipt.held.conflict,
					board: "held",
					file: info.body.file,
					reason: "changed",
					versionMove: "unchanged",
				},
			},
		});
		const replaceWrites = nonReadRecords(await proxy.snapshot());
		expect(replaceWrites).toHaveLength(1);
		expect(replaceWrites[0]).toMatchObject({
			method: "POST",
			pathname: "/api/elements/batch",
			query: "?board=held&doing=held%20replace",
		});
		expect(Buffer.from(replaceWrites[0]!.bodyBase64, "base64").toString()).toBe(
			JSON.stringify({
				elements: heldReplaceScene.elements,
				files: Object.values(heldReplaceScene.files),
				mutation: "replace-scene",
			}),
		);
		expect(readFileSync(info.body.file)).toEqual(bytes);
		expect(statSync(info.body.file).mtimeMs).toBe(mtime);
		expect((await request<{ version: number }>("/api/boards/info?board=held")).body.version).toBe(
			info.body.version,
		);
		const held = await request<{ elements: ElementIdView[]; held: { writes: number } }>(
			"/api/elements?board=held",
		);
		expect(held.body.elements.map((element) => element.id)).toEqual(["held-new", "held-new-image"]);
		expect(held.body.held.writes).toBe(1);
		const files = await request<{
			files: Record<string, { id: string; dataURL: string; mimeType: string; created: number }>;
		}>("/api/files?board=held");
		expect(files.body.files).toEqual({
			"reused-file": {
				id: "reused-file",
				dataURL: "data:image/png;base64,bmV3",
				mimeType: "image/png",
				created: 2,
			},
		});
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);
