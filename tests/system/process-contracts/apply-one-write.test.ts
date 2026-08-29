import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { z } from "zod";

import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { nonReadRecords, startCountingProxy } from "./support/counting-proxy.ts";
import {
	availablePort,
	parseCliJson,
	runCli,
	sanitizedEnvironment,
} from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const ApplySchema = z.object({
	created: z.number(),
	updated: z.number(),
	deleted: z.number(),
	elements: z.array(z.object({ id: z.string() }).passthrough()),
	fingerprint: z.object({ note: z.string().length(64), elements: z.number() }).passthrough(),
	document: z.array(z.unknown()).optional(),
});

test("apply is atomic, compact by default, and one real proxy write", async () => {
	const resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-apply-one-write-"));
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
		await request("/api/elements/batch?board=scratch", {
			method: "POST",
			body: {
				elements: [
					{ id: "box-1", type: "rectangle", x: 0, y: 0, width: 20, height: 20 },
					{ id: "box-2", type: "rectangle", x: 30, y: 0, width: 20, height: 20 },
					{ id: "gone", type: "rectangle", x: 60, y: 0, width: 20, height: 20 },
				],
			},
		});
		const patch = {
			create: [
				{ id: "made", type: "rectangle", x: 100, y: 0, width: 20, height: 20 },
				{ type: "ellipse", x: 130, y: 0, width: 20, height: 20 },
			],
			update: [
				{ id: "box-1", set: { backgroundColor: "#ffc9c9" } },
				{ id: "box-2", set: { x: 400 } },
			],
			delete: ["gone"],
		};
		await proxy.reset();
		const result = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: ["apply", "--board", "scratch", "--doing", "applying a patch", "-"],
			stdin: JSON.stringify(patch),
		});
		expect(result.status).toBe(0);
		const applied = parseCliJson(result, ApplySchema);
		expect(applied).toMatchObject({ created: 2, updated: 2, deleted: 1 });
		expect(applied.document).toBeUndefined();
		expect(applied.elements.map((element) => element.id)).toEqual(
			expect.arrayContaining(["made", "box-1", "box-2"]),
		);
		expect(
			applied.elements.some(
				(element) => element.id.length <= 8 && !["made", "box-1", "box-2"].includes(element.id),
			),
		).toBeTrue();
		const writes = nonReadRecords(await proxy.snapshot());
		expect(writes).toHaveLength(1);
		expect(writes[0]).toMatchObject({
			method: "POST",
			pathname: "/api/elements/changes",
			query: "?board=scratch&doing=applying%20a%20patch",
		});
		expect(Buffer.from(writes[0]!.bodyBase64, "base64").toString()).toBe(
			JSON.stringify({
				upserts: [
					...patch.create,
					{ backgroundColor: "#ffc9c9", id: "box-1" },
					{ x: 400, id: "box-2" },
				],
				deletes: ["gone"],
				origin: "agent",
			}),
		);

		await proxy.reset();
		const full = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: ["apply", "--board", "scratch", "--doing", "applying a patch", "--document", "-"],
			stdin: JSON.stringify({ update: [{ id: "box-1", set: { backgroundColor: "#b2f2bb" } }] }),
		});
		expect(parseCliJson(full, ApplySchema).document?.length).toBeGreaterThan(0);
		const fullWrites = nonReadRecords(await proxy.snapshot());
		expect(fullWrites).toHaveLength(1);
		expect(fullWrites[0]).toMatchObject({
			method: "POST",
			pathname: "/api/elements/changes",
			query: "?board=scratch&doing=applying%20a%20patch",
		});
		expect(Buffer.from(fullWrites[0]!.bodyBase64, "base64").toString()).toBe(
			JSON.stringify({
				upserts: [{ backgroundColor: "#b2f2bb", id: "box-1" }],
				deletes: [],
				origin: "agent",
				document: true,
			}),
		);

		const before = await request("/api/elements?board=scratch");
		await proxy.reset();
		const refused = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: ["apply", "--board", "scratch", "--doing", "bad patch", "-"],
			stdin: JSON.stringify({
				update: [
					{ id: "box-2", set: { x: 9999 } },
					{ id: "missing", set: { x: 1 } },
				],
			}),
		});
		expect(refused.status).not.toBe(0);
		expect(nonReadRecords(await proxy.snapshot())).toHaveLength(0);
		expect((await request("/api/elements?board=scratch")).body).toEqual(before.body);

		for (const upserts of [
			[
				{ id: "missing", customData: { archboard: { node: "bad" } } },
				{ id: "box-1", x: 700 },
			],
			[
				{ id: "box-1", x: 700 },
				{ id: "missing", customData: { archboard: { node: "bad" } } },
			],
		]) {
			const prior = await request("/api/elements?board=scratch");
			const bad = await request<{ success: boolean }>("/api/elements/changes?board=scratch", {
				method: "POST",
				body: { origin: "agent", upserts, deletes: [] },
			});
			expect(bad.body.success).toBeFalse();
			expect((await request("/api/elements?board=scratch")).body).toEqual(prior.body);
		}

		const human = await request<Record<string, unknown>>("/api/elements/changes?board=scratch", {
			method: "POST",
			body: {
				clientId: "pane",
				upserts: [{ id: "human", type: "rectangle", x: 0, y: 100, width: 20, height: 20 }],
				deletes: [],
			},
		});
		expect(human.body.document).toBeUndefined();
		expect(human.body.corrections).toBeDefined();
		const compact = await request<{
			document?: unknown;
			corrections: { upserts: unknown[]; deletes: string[] };
			fingerprint: { note: string; version: number };
		}>("/api/elements/changes?board=scratch", {
			method: "POST",
			body: { clientId: "pane", upserts: [{ id: "human", x: 1 }], deletes: [] },
		});
		expect(compact.body.document).toBeUndefined();
		expect(compact.body.corrections).toEqual({ upserts: [], deletes: [] });
		expect(compact.body.fingerprint.note).toHaveLength(64);
		expect(compact.body.fingerprint.version).toBeNumber();

		const foreignTextId = "text-element-minted-by-a-browser";
		const canonical = await request<{
			document?: unknown;
			corrections: { upserts: Array<Record<string, unknown>>; deletes: string[] };
		}>("/api/elements/changes?board=scratch", {
			method: "POST",
			body: {
				clientId: "pane",
				upserts: [
					{
						id: foreignTextId,
						type: "text",
						text: "Canonical",
						x: 100,
						y: 100,
						width: 120,
						height: 24,
						fontSize: 20,
						fontFamily: 1,
					},
				],
				deletes: [],
			},
		});
		const correctedText = canonical.body.corrections.upserts.find(
			(element) => element.type === "text",
		)!;
		expect(canonical.body.document).toBeUndefined();
		expect(canonical.body.corrections.deletes).toContain(foreignTextId);
		expect(String(correctedText.id).length).toBeGreaterThan(0);
		expect(String(correctedText.id).length).toBeLessThanOrEqual(8);
		expect(correctedText.rawText).toBe("Canonical");
		const canonicalScene = await request<{ elements: Array<Record<string, unknown>> }>(
			"/api/elements?board=scratch",
		);
		expect(canonicalScene.body.elements.find((element) => element.id === correctedText.id)).toEqual(
			expect.objectContaining({
				id: correctedText.id,
				text: correctedText.text,
				rawText: correctedText.rawText,
			}),
		);

		await request("/api/boards/new", { method: "POST", body: { board: "ack-corrections" } });
		await request("/api/elements/changes?board=ack-corrections", {
			method: "POST",
			body: {
				origin: "agent",
				upserts: [
					{ id: "ack-box", type: "rectangle", x: 0, y: 0, width: 100, height: 60 },
					{
						id: "ack-arrow",
						type: "arrow",
						x: 100,
						y: 30,
						width: 100,
						height: 0,
						points: [
							[0, 0],
							[100, 0],
						],
						start: { id: "ack-box" },
					},
				],
				deletes: [],
			},
		});
		const outside = await request<{
			corrections: { upserts: Array<Record<string, unknown>> };
		}>("/api/elements/changes?board=ack-corrections", {
			method: "POST",
			body: {
				clientId: "pane",
				upserts: [{ id: "ack-box", x: 20, boundElements: [] }],
				deletes: [],
			},
		});
		const correctedBox = outside.body.corrections.upserts.find(
			(element) => element.id === "ack-box",
		)!;
		expect(correctedBox.boundElements).toEqual(
			expect.arrayContaining([expect.objectContaining({ id: "ack-arrow" })]),
		);
		const repaired = await request<{ elements: Array<Record<string, unknown>> }>(
			"/api/elements?board=ack-corrections",
		);
		expect(repaired.body.elements.find((element) => element.id === "ack-box")).toEqual(
			correctedBox,
		);
		await request("/api/boards/hold?board=scratch", {
			method: "POST",
			body: { clientId: "blocking" },
		});
		let answered = false;
		const pending = fetch(
			`${canvas.base}/api/elements/changes?board=scratch&doing=waiting+for+persistence`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					upserts: [{ id: "agent", type: "rectangle", x: 40, y: 100, width: 20, height: 20 }],
					deletes: [],
				}),
			},
		).then(async (response) => {
			answered = true;
			return response.json() as Promise<Record<string, unknown>>;
		});
		await Bun.sleep(150);
		expect(answered).toBeFalse();
		await request("/api/boards/hold/release?board=scratch", {
			method: "POST",
			body: { clientId: "blocking" },
		});
		const agent = await pending;
		expect(agent.elements).toBeDefined();
		expect(agent.corrections).toBeUndefined();
	} finally {
		await resources.disposeAsync();
	}
}, 30_000);
