import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { z } from "zod";

import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import { startCountingProxy, type ProxyRecord } from "./support/counting-proxy.ts";
import { availablePort, runCli, sanitizedEnvironment } from "./support/process-http.ts";

const repoRoot = resolve(import.meta.dir, "../../..");
interface SceneElement {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	locked?: boolean;
	containerId?: string;
	points?: unknown[];
	source?: string;
}
interface ChangeFeed {
	cursor: number;
	events: Array<{ origin: string }>;
}
const CliObjectSchema = z.object({}).passthrough();
const writes = (records: ProxyRecord[]) =>
	records.filter(
		(record) =>
			!["GET", "HEAD"].includes(record.method) &&
			/^\/api\/(?:elements|files|bridges)/.test(record.pathname),
	);

test("arrange intents each cross the real proxy once and preserve related elements", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-element-ops-"));
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
		const boxes = Array.from({ length: 20 }, (_, index) => ({
			id: `box-${index}`,
			type: "rectangle",
			x: 100 + index * 37,
			y: 100 + index * 53,
			width: 120,
			height: 80,
		}));
		await request("/api/elements/batch?board=scratch", {
			method: "POST",
			body: { elements: boxes },
		});
		const ids = boxes.map((box) => box.id).join(",");
		const cli = async (args: string[]) => {
			await proxy.reset();
			const result = runCli({
				repoRoot,
				root,
				vault,
				base: proxy.base,
				args: [...args, "--board", "scratch", "--doing", "checking one write"],
			});
			expect(result.status).toBe(0);
			const output = CliObjectSchema.safeParse(JSON.parse(result.stdout));
			expect(output.success, `${result.stdout}\n${result.stderr}`).toBeTrue();
			const records = writes(await proxy.snapshot());
			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({ method: "POST", pathname: "/api/elements/changes" });
			expect(Buffer.from(records[0]!.bodyBase64, "base64").length).toBeGreaterThan(0);
			return output.success ? output.data : {};
		};

		await cli(["arrange", "align", "--ids", ids, "--to", "left"]);
		let elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		expect(
			new Set(elements.filter((element) => element.id.startsWith("box-")).map((e) => e.x)).size,
		).toBe(1);
		await cli(["arrange", "distribute", "--ids", ids, "--to", "vertical"]);
		await cli(["arrange", "lock", "--ids", ids]);
		elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		expect(
			elements.filter((element) => element.id.startsWith("box-")).every((e) => e.locked),
		).toBeTrue();
		await cli(["arrange", "unlock", "--ids", ids]);
		const grouped = await cli(["arrange", "group", "--ids", ids]);
		const groupId = String(grouped.groupId);
		expect(groupId.length).toBeGreaterThan(0);
		await cli(["arrange", "ungroup", "--group", groupId]);

		await request("/api/elements/changes?board=scratch", {
			method: "POST",
			body: {
				clientId: "pane",
				upserts: [
					{
						id: "human-box",
						type: "rectangle",
						x: 1600,
						y: 1600,
						width: 120,
						height: 80,
					},
				],
				deletes: [],
			},
		});
		await Bun.sleep(1_000);
		const beforeAgent = await request<ChangeFeed>("/api/changes?board=scratch&since=0");
		await cli(["arrange", "align", "--ids", "human-box,box-0", "--to", "top"]);
		const authored = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch"))
			.body.elements;
		expect(authored.find((element) => element.id === "human-box")?.source).toBe("frontend_sync");
		expect(authored.find((element) => element.id === "box-0")?.source).toBeUndefined();
		await Bun.sleep(1_000);
		const agentFeed = await request<ChangeFeed>(
			`/api/changes?board=scratch&since=${beforeAgent.body.cursor}`,
		);
		expect(agentFeed.body.events.length).toBeGreaterThan(0);
		expect(agentFeed.body.events.every((event) => event.origin === "agent")).toBeTrue();

		await request("/api/elements/batch?board=scratch", {
			method: "POST",
			body: {
				elements: [
					{ id: "svc", type: "rectangle", x: 200, y: 8000, width: 200, height: 100 },
					{ id: "db", type: "rectangle", x: 900, y: 8000, width: 200, height: 260 },
					{
						id: "label",
						type: "text",
						containerId: "svc",
						text: "Auth",
						x: 250,
						y: 8038,
						width: 100,
						height: 25,
					},
					{
						id: "wire",
						type: "arrow",
						x: 400,
						y: 8050,
						width: 10,
						height: 10,
						points: [
							[0, 0],
							[10, 10],
						],
						start: { id: "svc" },
						end: { id: "db" },
					},
				],
			},
		});
		await request("/api/elements/svc?board=scratch", {
			method: "PUT",
			body: { boundElements: [{ id: "label", type: "text" }] },
		});
		const before = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		const wireBefore = JSON.stringify(before.find((element) => element.id === "wire")?.points);
		await cli(["arrange", "align", "--ids", "svc,db", "--to", "bottom"]);
		elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		const svc = elements.find((element) => element.id === "svc")!;
		const db = elements.find((element) => element.id === "db")!;
		const label = elements.find((element) => element.id === "label")!;
		expect(Math.abs(svc.y + svc.height - db.y - db.height)).toBeLessThanOrEqual(0.5);
		expect(label.containerId).toBe("svc");
		expect(JSON.stringify(elements.find((element) => element.id === "wire")?.points)).not.toBe(
			wireBefore,
		);
	} finally {
		await proxy.dispose();
		await canvas.dispose();
		rmSync(root, { recursive: true, force: true });
	}
}, 30_000);
