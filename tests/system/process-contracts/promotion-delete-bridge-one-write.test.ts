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
const JsonSchema = z.object({}).passthrough();

test("promotion, deletion, and bridge intents each use one request", async () => {
	const resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-promote-one-write-"));
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
		const run = async (
			args: string[],
			expectedPath = "/api/elements/changes",
			expectsVersion = false,
		) => {
			const version = expectsVersion
				? (await request<{ version: number }>("/api/boards/info?board=scratch")).body.version
				: undefined;
			await proxy.reset();
			const result = runCli({
				repoRoot,
				root,
				vault,
				base: proxy.base,
				args: [...args, "--board", "scratch", "--doing", "checking one write"],
			});
			expect(result.status).toBe(0);
			const parsed = parseCliJson(result, JsonSchema);
			const records = nonReadRecords(await proxy.snapshot());
			expect(records).toHaveLength(1);
			const expectedMethod = expectedPath.startsWith("/api/bridges/") ? "DELETE" : "POST";
			expect(records[0]!.method).toBe(expectedMethod);
			expect(records[0]!.pathname).toBe(expectedPath);
			expect(records[0]!.query).toBe(
				`?board=scratch&doing=checking%20one%20write${version === undefined ? "" : `&expectVersion=${version}`}`,
			);
			const bodyLength = Buffer.from(records[0]!.bodyBase64, "base64").length;
			let body: unknown;
			if (records[0]!.method === "DELETE") expect(bodyLength).toBe(0);
			else {
				const rawBody = Buffer.from(records[0]!.bodyBase64, "base64").toString();
				body = JSON.parse(rawBody);
				expect(rawBody).toBe(JSON.stringify(body));
			}
			return { parsed, body, method: records[0]!.method };
		};
		const ids = lines.map((line) => line.id).join(",");
		const promoted = await run(
			["promote", "--ids", ids, "--kind", "datastore", "--name", "PostgreSQL"],
			"/api/elements/changes",
			true,
		);
		expect(promoted.body).toEqual({
			upserts: lines.map((line) => ({
				id: line.id,
				customData: {
					archboard: {
						node: "postgresql",
						kind: "datastore",
						name: "PostgreSQL",
						variant: "current",
					},
				},
			})),
			deletes: [],
			origin: "agent",
		});
		let elements = (
			await request<{ elements: Array<Record<string, unknown>> }>("/api/elements?board=scratch")
		).body.elements;
		const nodes = elements
			.filter((element) => String(element.id).startsWith("pg-"))
			.map((element) => (element.customData as { archboard?: { node?: string } })?.archboard?.node);
		expect(new Set(nodes).size).toBe(1);
		const demoted = await run(["demote", "--ids", ids]);
		expect(demoted.body).toEqual({
			upserts: lines.map((line) => ({ id: line.id, customData: {} })),
			deletes: [],
			origin: "agent",
		});
		elements = (
			await request<{ elements: Array<Record<string, unknown>> }>("/api/elements?board=scratch")
		).body.elements;
		expect(
			elements
				.filter((element) => String(element.id).startsWith("pg-"))
				.every(
					(element) =>
						(element.customData as { archboard?: { node?: string } })?.archboard?.node ===
						undefined,
				),
		).toBeTrue();
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
		expect(nonReadRecords(await proxy.snapshot())).toHaveLength(0);
		elements = (
			await request<{ elements: Array<Record<string, unknown>> }>("/api/elements?board=scratch")
		).body.elements;
		expect(
			elements
				.filter((element) => String(element.id).startsWith("pg-"))
				.every(
					(element) =>
						(element.customData as { archboard?: { node?: string } })?.archboard?.node ===
						undefined,
				),
		).toBeTrue();

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
		const deleted = await run(["delete", "gone-a", "gone-b", "gone-c"]);
		expect(deleted.body).toEqual({
			upserts: [],
			deletes: ["gone-a", "gone-b", "gone-c"],
			origin: "agent",
		});
		elements = (
			await request<{ elements: Array<Record<string, unknown>> }>("/api/elements?board=scratch")
		).body.elements;
		expect(
			elements.some((element) => ["gone-a", "gone-b", "gone-c"].includes(String(element.id))),
		).toBeFalse();
		expect(elements.some((element) => element.id === "stays")).toBeTrue();
		await proxy.reset();
		const badDelete = runCli({
			repoRoot,
			root,
			vault,
			base: proxy.base,
			args: ["delete", "stays", "missing", "--board", "scratch", "--doing", "bad delete"],
		});
		expect(badDelete.status).not.toBe(0);
		expect(nonReadRecords(await proxy.snapshot())).toHaveLength(0);
		expect(
			(
				await request<{ elements: Array<Record<string, unknown>> }>("/api/elements?board=scratch")
			).body.elements.some((element) => element.id === "stays"),
		).toBeTrue();

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
		expect(bridge.body).toEqual({ over: "over", under: "under", background: "#ffffff" });
		const bridgeId = String(bridge.parsed.bridgeId);
		expect(bridgeId.length).toBeGreaterThan(0);
		await request("/api/elements/changes?board=scratch", {
			method: "POST",
			body: { origin: "agent", upserts: [], deletes: ["over", "under"] },
		});
		elements = (
			await request<{ elements: Array<Record<string, unknown>> }>("/api/elements?board=scratch")
		).body.elements;
		expect(elements.some((element) => element.id === "over")).toBeFalse();
		expect(elements.some((element) => element.id === "under")).toBeFalse();
		expect(elements.some((element) => element.id === bridgeId)).toBeTrue();
		const removed = await run(["bridge", "remove", bridgeId], `/api/bridges/${bridgeId}`);
		expect(removed.body).toBeUndefined();
		expect(removed.method).toBe("DELETE");
		elements = (
			await request<{ elements: Array<Record<string, unknown>> }>("/api/elements?board=scratch")
		).body.elements;
		expect(elements.some((element) => element.id === bridgeId)).toBeFalse();
	} finally {
		await resources.disposeAsync();
	}
}, 30_000);
