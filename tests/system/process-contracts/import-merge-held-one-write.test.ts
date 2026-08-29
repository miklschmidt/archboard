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
const ReceiptSchema = z
	.object({ success: z.literal(true), imported: z.number(), mode: z.string() })
	.passthrough();

test("merge and held replace each use one batch without advancing held persistence", async () => {
	const resources = new AsyncDisposableStack();
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
		expect(parseCliJson(merged, ReceiptSchema)).toMatchObject({
			success: true,
			imported: 1,
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
		expect(parseCliJson(replaced, ReceiptSchema)).toMatchObject({
			success: true,
			mode: "replace",
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
		const held = await request<{ elements: Array<{ id: string }>; held: { writes: number } }>(
			"/api/elements?board=held",
		);
		expect(held.body.elements.some((element) => element.id === "held-new")).toBeTrue();
		expect(held.body.held.writes).toBe(1);
		const files = await request<{ files: Record<string, unknown> }>("/api/files?board=held");
		expect(Object.keys(files.body.files)).toEqual(["reused-file"]);
	} finally {
		await resources.disposeAsync();
	}
}, 20_000);
