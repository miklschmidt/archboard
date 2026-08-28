import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { z } from "zod";

import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { startCountingProxy } from "./support/counting-proxy.ts";
import { availablePort, runCli, sanitizedEnvironment } from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
const JsonSchema = z.object({}).passthrough();

test("promotion, deletion, and bridge intents each use one request", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-promote-one-write-"));
	const vault = join(root, "vault");
	const canvas = await startOwnedCanvas({
		serverPath: join(repoRoot, "src/server.ts"),
		vault,
		env: sanitizedEnvironment(root, vault),
	});
	const proxy = await startCountingProxy({
		port: await availablePort(),
		upstream: canvas.base,
		env: sanitizedEnvironment(root, vault),
	});
	const request = createJsonRequester(canvas);
	try {
		const lines = Array.from({ length: 7 }, (_, index) => ({
			id: `pg-${index}`,
			type: "line",
			x: 0,
			y: index * 12,
			width: 100,
			height: 0,
			points: [
				[0, 0],
				[100, 0],
			],
		}));
		await request("/api/elements/batch?board=scratch", {
			method: "POST",
			body: { elements: lines },
		});
		const run = async (args: string[], expectedPath = "/api/elements/changes") => {
			await proxy.reset();
			const result = runCli({
				repoRoot,
				root,
				vault,
				base: proxy.base,
				args: [...args, "--board", "scratch", "--doing", "checking one write"],
			});
			expect(result.status).toBe(0);
			const parsed = JsonSchema.safeParse(JSON.parse(result.stdout));
			expect(parsed.success, result.stderr).toBeTrue();
			const records = (await proxy.snapshot()).filter(
				(record) => record.method !== "GET" && record.pathname === expectedPath,
			);
			expect(records).toHaveLength(1);
			const bodyLength = Buffer.from(records[0]!.bodyBase64, "base64").length;
			if (records[0]!.method === "DELETE") expect(bodyLength).toBe(0);
			else expect(bodyLength).toBeGreaterThan(0);
			return parsed.success ? parsed.data : {};
		};
		const ids = lines.map((line) => line.id).join(",");
		await run(["promote", "--ids", ids, "--kind", "datastore", "--name", "PostgreSQL"]);
		let elements = (
			await request<{ elements: Array<Record<string, unknown>> }>("/api/elements?board=scratch")
		).body.elements;
		const nodes = elements
			.filter((element) => String(element.id).startsWith("pg-"))
			.map((element) => (element.customData as { archboard?: { node?: string } })?.archboard?.node);
		expect(new Set(nodes).size).toBe(1);
		await run(["demote", "--ids", ids]);
		await proxy.reset();
		const badPromotion = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: [
				"promote",
				"--ids",
				`${ids},missing`,
				"--kind",
				"datastore",
				"--name",
				"PostgreSQL",
				"--board",
				"scratch",
				"--doing",
				"bad promotion",
			],
		});
		expect(badPromotion.status).not.toBe(0);
		expect(
			(await proxy.snapshot()).filter(
				(record) => record.method !== "GET" && record.pathname.startsWith("/api/elements"),
			),
		).toHaveLength(0);

		await request("/api/elements/batch?board=scratch", {
			method: "POST",
			body: {
				elements: ["gone-a", "gone-b", "gone-c", "stays"].map((id, index) => ({
					id,
					type: "rectangle",
					x: index * 30,
					y: 200,
					width: 20,
					height: 20,
				})),
			},
		});
		await run(["delete", "gone-a", "gone-b", "gone-c"]);
		await proxy.reset();
		const badDelete = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: ["delete", "stays", "missing", "--board", "scratch", "--doing", "bad delete"],
		});
		expect(badDelete.status).not.toBe(0);
		expect(
			(await proxy.snapshot()).filter(
				(record) => record.method !== "GET" && record.pathname.startsWith("/api/elements"),
			),
		).toHaveLength(0);

		await request("/api/elements/batch?board=scratch", {
			method: "POST",
			body: {
				elements: [
					{
						id: "over",
						type: "line",
						x: 0,
						y: 400,
						width: 100,
						height: 0,
						points: [
							[0, 0],
							[100, 0],
						],
					},
					{
						id: "under",
						type: "arrow",
						x: 50,
						y: 350,
						width: 0,
						height: 100,
						points: [
							[0, 0],
							[0, 100],
						],
					},
				],
			},
		});
		const bridge = await run(
			["bridge", "--over", "over", "--under", "under", "--background", "#ffffff"],
			"/api/bridges",
		);
		const bridgeId = String(bridge.bridgeId);
		expect(bridgeId.length).toBeGreaterThan(0);
		await run(["bridge", "remove", bridgeId], `/api/bridges/${bridgeId}`);
		elements = (
			await request<{ elements: Array<Record<string, unknown>> }>("/api/elements?board=scratch")
		).body.elements;
		expect(elements.some((element) => element.id === bridgeId)).toBeFalse();
	} finally {
		await proxy.dispose();
		await canvas.dispose();
		rmSync(root, { recursive: true, force: true });
	}
}, 30_000);
