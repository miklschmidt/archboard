import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { z } from "zod";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { boundTextPlacement } from "../../../src/runtime/engine/labels.ts";
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
type SceneElement = ExcalidrawElement & {
	source?: string;
	customData?: { archboard?: Record<string, unknown> };
};
type SceneArrow = Extract<ExcalidrawElement, { type: "arrow" }> & SceneElement;
type SceneText = Extract<ExcalidrawElement, { type: "text" }> & SceneElement;
interface ChangeFeed {
	cursor: number;
	events: Array<{ origin: string }>;
}
const ElementIdsReceipt = {
	elementIds: z.array(z.string()),
	successCount: z.number().int().nonnegative(),
};
const AlignReceiptSchema = z.object({
	aligned: z.literal(true),
	...ElementIdsReceipt,
	alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
});
const DistributeReceiptSchema = z.object({
	distributed: z.literal(true),
	elementIds: z.array(z.string()),
	direction: z.enum(["horizontal", "vertical"]),
	count: z.number().int().nonnegative(),
});
const LockReceiptSchema = z.object({ locked: z.literal(true), ...ElementIdsReceipt });
const UnlockReceiptSchema = z.object({ unlocked: z.literal(true), ...ElementIdsReceipt });
const GroupReceiptSchema = z.object({ groupId: z.string().min(1), ...ElementIdsReceipt });
const UngroupReceiptSchema = z.object({
	groupId: z.string().min(1),
	ungrouped: z.literal(true),
	...ElementIdsReceipt,
});
const ChangeBodySchema = z.object({
	upserts: z.array(z.object({ id: z.string() }).passthrough()),
	deletes: z.array(z.string()),
	origin: z.literal("agent"),
});

test("arrange intents each cross the real proxy once and preserve related elements", async () => {
	await using resources = new AsyncDisposableStack();
	const root = mkdtempSync(join(tmpdir(), "archboard-element-ops-"));
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
		const cli = async <T>(args: string[], schema: z.ZodType<T>) => {
			await proxy.reset();
			const result = runCli({
				repoRoot,
				root,
				vault,
				base: proxy.base,
				args: [...args, "--board", "scratch", "--doing", "checking one write"],
			});
			expect(result.status).toBe(0);
			const output = parseCliJson(result, schema);
			const records = nonReadRecords(await proxy.snapshot());
			expect(records).toHaveLength(1);
			expect(records[0]).toMatchObject({
				method: "POST",
				pathname: "/api/elements/changes",
				query: "?board=scratch&doing=checking%20one%20write",
			});
			const rawBody = Buffer.from(records[0]!.bodyBase64, "base64").toString();
			const body = ChangeBodySchema.parse(JSON.parse(rawBody));
			expect(rawBody).toBe(JSON.stringify(body));
			return { output, body };
		};

		const aligned = await cli(
			["arrange", "align", "--ids", ids, "--to", "left"],
			AlignReceiptSchema,
		);
		expect(aligned.output).toEqual({
			aligned: true,
			elementIds: boxes.map((box) => box.id),
			alignment: "left",
			successCount: 20,
		});
		expect(aligned.body).toEqual({
			upserts: boxes.map((box) => ({ id: box.id, x: 100 })),
			deletes: [],
			origin: "agent",
		});
		let elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		expect(
			new Set(elements.filter((element) => element.id.startsWith("box-")).map((e) => e.x)).size,
		).toBe(1);
		const distributed = await cli(
			["arrange", "distribute", "--ids", ids, "--to", "vertical"],
			DistributeReceiptSchema,
		);
		expect(distributed.output).toEqual({
			distributed: true,
			elementIds: boxes.map((box) => box.id),
			direction: "vertical",
			count: 20,
		});
		expect(distributed.body).toEqual({
			upserts: boxes.map((box) => ({ id: box.id, y: box.y })),
			deletes: [],
			origin: "agent",
		});
		elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		const tops = elements
			.filter((element) => element.id.startsWith("box-"))
			.map((element) => element.y)
			.toSorted((left, right) => left - right);
		const gaps = tops.slice(1).map((top, index) => top - tops[index]!);
		expect(gaps.every((gap) => Math.abs(gap - gaps[0]!) <= 0.01)).toBeTrue();
		const locked = await cli(["arrange", "lock", "--ids", ids], LockReceiptSchema);
		expect(locked.output).toEqual({
			locked: true,
			elementIds: boxes.map((box) => box.id),
			successCount: 20,
		});
		expect(locked.body).toEqual({
			upserts: boxes.map((box) => ({ id: box.id, locked: true })),
			deletes: [],
			origin: "agent",
		});
		elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		expect(
			elements.filter((element) => element.id.startsWith("box-")).every((e) => e.locked),
		).toBeTrue();
		const unlocked = await cli(["arrange", "unlock", "--ids", ids], UnlockReceiptSchema);
		expect(unlocked.output).toEqual({
			unlocked: true,
			elementIds: boxes.map((box) => box.id),
			successCount: 20,
		});
		expect(unlocked.body).toEqual({
			upserts: boxes.map((box) => ({ id: box.id, locked: false })),
			deletes: [],
			origin: "agent",
		});
		elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		expect(
			elements.filter((element) => element.id.startsWith("box-")).every((e) => !e.locked),
		).toBeTrue();
		await request("/api/elements/box-0?board=scratch", {
			method: "PUT",
			body: { groupIds: ["existing"] },
		});
		const grouped = await cli(["arrange", "group", "--ids", ids], GroupReceiptSchema);
		const groupId = grouped.output.groupId;
		expect(groupId.length).toBeGreaterThan(0);
		expect(grouped.output).toEqual({
			groupId,
			elementIds: boxes.map((box) => box.id),
			successCount: 20,
		});
		expect(grouped.body).toEqual({
			upserts: boxes.map((box) => ({
				id: box.id,
				groupIds: box.id === "box-0" ? ["existing", groupId] : [groupId],
			})),
			deletes: [],
			origin: "agent",
		});
		elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		expect(
			elements
				.filter((element) => element.id.startsWith("box-"))
				.every((element) => element.groupIds?.includes(groupId)),
		).toBeTrue();
		expect(elements.find((element) => element.id === "box-0")?.groupIds).toContain("existing");
		const ungrouped = await cli(["arrange", "ungroup", "--group", groupId], UngroupReceiptSchema);
		expect(ungrouped.output).toEqual({
			groupId,
			ungrouped: true,
			elementIds: boxes.map((box) => box.id),
			successCount: 20,
		});
		expect(ungrouped.body).toEqual({
			upserts: boxes.map((box) => ({
				id: box.id,
				groupIds: box.id === "box-0" ? ["existing"] : [],
			})),
			deletes: [],
			origin: "agent",
		});
		elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		expect(
			elements
				.filter((element) => element.id.startsWith("box-"))
				.every((element) => !element.groupIds?.includes(groupId)),
		).toBeTrue();
		expect(elements.find((element) => element.id === "box-0")?.groupIds).toContain("existing");

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
		const humanAligned = await cli(
			["arrange", "align", "--ids", "human-box,box-0", "--to", "top"],
			AlignReceiptSchema,
		);
		expect(humanAligned.output).toEqual({
			aligned: true,
			elementIds: ["human-box", "box-0"],
			alignment: "top",
			successCount: 2,
		});
		expect(humanAligned.body).toEqual({
			upserts: [
				{ id: "human-box", y: 100 },
				{ id: "box-0", y: 100 },
			],
			deletes: [],
			origin: "agent",
		});
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
		const wireBefore = JSON.stringify(
			before.find(
				(element): element is SceneArrow => element.id === "wire" && element.type === "arrow",
			)?.points,
		);
		const related = await cli(
			["arrange", "align", "--ids", "svc,db", "--to", "bottom"],
			AlignReceiptSchema,
		);
		expect(related.output).toEqual({
			aligned: true,
			elementIds: ["svc", "db"],
			alignment: "bottom",
			successCount: 2,
		});
		expect(related.body).toEqual({
			upserts: [
				{ id: "svc", y: 8160 },
				{ id: "db", y: 8000 },
			],
			deletes: [],
			origin: "agent",
		});
		elements = (await request<{ elements: SceneElement[] }>("/api/elements?board=scratch")).body
			.elements;
		const svc = elements.find((element) => element.id === "svc")!;
		const db = elements.find((element) => element.id === "db")!;
		const label = elements.find(
			(element): element is SceneText => element.id === "label" && element.type === "text",
		)!;
		expect(Math.abs(svc.y + svc.height - db.y - db.height)).toBeLessThanOrEqual(0.5);
		expect(label.containerId).toBe("svc");
		expect(svc.y).not.toBe(before.find((element) => element.id === "svc")?.y);
		const wanted = boundTextPlacement(svc, label)!;
		expect(Math.abs(label.x - wanted.x)).toBeLessThanOrEqual(0.5);
		expect(Math.abs(label.y - wanted.y)).toBeLessThanOrEqual(0.5);
		expect(
			JSON.stringify(
				elements.find(
					(element): element is SceneArrow => element.id === "wire" && element.type === "arrow",
				)?.points,
			),
		).not.toBe(wireBefore);
	} finally {
		await resources.disposeAsync();
	}
}, 30_000);
