import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { z } from "zod";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

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
type ElementIdView = Pick<ExcalidrawElement, "id">;
type ArchboardElementView = Pick<ExcalidrawElement, "id" | "customData"> & {
	customData?: { archboard?: { node?: string } };
};
type BridgeFactsView = {
	background: string;
	bridgeId: string;
	crossing: { x: number; y: number };
	overConnectorId: string;
	overSegmentIndex: number;
	underConnectorId: string;
	underSegmentIndex: number;
};
type BridgePartView<Role extends "mask" | "redraw"> = Pick<
	Extract<ExcalidrawElement, { type: "arrow" | "line" }>,
	"id" | "type" | "customData"
> & {
	type: "line";
	customData: { archboard: { bridge: BridgeFactsView & { role: Role } } };
};
type FingerprintView = { note: string; elements: number; version: number | null };
type DeleteReceiptView = {
	success: true;
	deleted: number;
	count: number;
	elements: ElementIdView[];
	fingerprint: FingerprintView;
};
type BridgeReceiptView = {
	success: true;
	board: string;
	bridgeId: string;
	overConnectorId: string;
	underConnectorId: string;
	overSegmentIndex: number;
	underSegmentIndex: number;
	crossing: { x: number; y: number };
	elements: [BridgePartView<"mask">, BridgePartView<"redraw">];
	fingerprint: FingerprintView;
};
type BridgeRemovalReceiptView = {
	success: true;
	board: string;
	bridgeId: string;
	deleted: [string, string];
	elements: never[];
	fingerprint: FingerprintView;
};
const FingerprintSchema = z.object({
	note: z.string().length(64),
	elements: z.number().int().nonnegative(),
	version: z.number().int().nullable(),
});
const PromotionReceiptSchema = z.object({
	success: z.literal(true),
	summary: z.string(),
	nodes: z.array(
		z.object({
			node: z.string(),
			kind: z.string(),
			name: z.string(),
			elementIds: z.array(z.string()),
			variant: z.string(),
		}),
	),
	elementsUpdated: z.number().int().nonnegative(),
});
const DemotionReceiptSchema = z.object({
	success: z.literal(true),
	summary: z.string(),
	nodes: z.array(
		z.object({
			node: z.string().optional(),
			name: z.string().optional(),
			elementIds: z.array(z.string()),
		}),
	),
	elementsUpdated: z.number().int().nonnegative(),
});
const ElementIdSchema: z.ZodType<ElementIdView> = z.object({ id: z.string() }).passthrough();
const DeleteReceiptSchema: z.ZodType<DeleteReceiptView> = z.object({
	success: z.literal(true),
	deleted: z.number().int().nonnegative(),
	count: z.number().int().nonnegative(),
	elements: z.array(ElementIdSchema),
	fingerprint: FingerprintSchema,
});
const BridgeFactsSchema = z.object({
	background: z.string(),
	bridgeId: z.string(),
	crossing: z.object({ x: z.number(), y: z.number() }),
	overConnectorId: z.string(),
	overSegmentIndex: z.number().int().nonnegative(),
	underConnectorId: z.string(),
	underSegmentIndex: z.number().int().nonnegative(),
});
const BridgePartSchema = <Role extends "mask" | "redraw">(
	role: Role,
): z.ZodType<BridgePartView<Role>> =>
	z
		.object({
			id: z.string(),
			type: z.literal("line"),
			customData: z.object({
				archboard: z.object({ bridge: BridgeFactsSchema.extend({ role: z.literal(role) }) }),
			}),
		})
		.passthrough();
const BridgeReceiptSchema: z.ZodType<BridgeReceiptView> = z.object({
	success: z.literal(true),
	board: z.string(),
	bridgeId: z.string().min(1),
	overConnectorId: z.string(),
	underConnectorId: z.string(),
	overSegmentIndex: z.number().int().nonnegative(),
	underSegmentIndex: z.number().int().nonnegative(),
	crossing: z.object({ x: z.number(), y: z.number() }),
	elements: z.tuple([BridgePartSchema("mask"), BridgePartSchema("redraw")]),
	fingerprint: FingerprintSchema,
});
const BridgeRemovalReceiptSchema: z.ZodType<BridgeRemovalReceiptView> = z.object({
	success: z.literal(true),
	board: z.string(),
	bridgeId: z.string().min(1),
	deleted: z.tuple([z.string(), z.string()]),
	elements: z.array(z.never()).length(0),
	fingerprint: FingerprintSchema,
});

test("promotion, deletion, and bridge intents each use one request", async () => {
	await using resources = new AsyncDisposableStack();
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
		const run = async <T>(
			args: string[],
			schema: z.ZodType<T>,
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
			const parsed = parseCliJson(result, schema);
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
			PromotionReceiptSchema,
			"/api/elements/changes",
			true,
		);
		expect(promoted.parsed).toEqual({
			success: true,
			summary: 'Promoted 7 elements to the datastore "PostgreSQL" (node postgresql), unbound.',
			nodes: [
				{
					node: "postgresql",
					kind: "datastore",
					name: "PostgreSQL",
					elementIds: lines.map((line) => line.id),
					variant: "current",
				},
			],
			elementsUpdated: 7,
		});
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
			await request<{ elements: ArchboardElementView[] }>("/api/elements?board=scratch")
		).body.elements;
		const nodes = elements
			.filter((element) => String(element.id).startsWith("pg-"))
			.map((element) => element.customData?.archboard?.node);
		expect(new Set(nodes).size).toBe(1);
		const demoted = await run(["demote", "--ids", ids], DemotionReceiptSchema);
		expect(demoted.parsed).toEqual({
			success: true,
			summary: 'Demoted the node "PostgreSQL" back to 7 plain elements.',
			nodes: [{ node: "postgresql", name: "PostgreSQL", elementIds: lines.map((line) => line.id) }],
			elementsUpdated: 7,
		});
		expect(demoted.body).toEqual({
			upserts: lines.map((line) => ({ id: line.id, customData: {} })),
			deletes: [],
			origin: "agent",
		});
		elements = (await request<{ elements: ArchboardElementView[] }>("/api/elements?board=scratch"))
			.body.elements;
		expect(
			elements
				.filter((element) => String(element.id).startsWith("pg-"))
				.every((element) => element.customData?.archboard?.node === undefined),
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
		elements = (await request<{ elements: ArchboardElementView[] }>("/api/elements?board=scratch"))
			.body.elements;
		expect(
			elements
				.filter((element) => String(element.id).startsWith("pg-"))
				.every((element) => element.customData?.archboard?.node === undefined),
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
		const deleted = await run(["delete", "gone-a", "gone-b", "gone-c"], DeleteReceiptSchema);
		expect(deleted.parsed).toEqual({
			success: true,
			deleted: 3,
			count: 3,
			elements: [],
			fingerprint: {
				note: deleted.parsed.fingerprint.note,
				elements: 8,
				version: 5,
			},
		});
		expect(deleted.body).toEqual({
			upserts: [],
			deletes: ["gone-a", "gone-b", "gone-c"],
			origin: "agent",
		});
		elements = (await request<{ elements: ArchboardElementView[] }>("/api/elements?board=scratch"))
			.body.elements;
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
				await request<{ elements: ArchboardElementView[] }>("/api/elements?board=scratch")
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
			BridgeReceiptSchema,
			"/api/bridges",
		);
		const [mask, redraw] = bridge.parsed.elements;
		expect(bridge.parsed).toEqual({
			success: true,
			board: "scratch",
			bridgeId: mask.id,
			overConnectorId: "over",
			underConnectorId: "under",
			overSegmentIndex: 0,
			underSegmentIndex: 0,
			crossing: { x: 50, y: 400 },
			elements: [mask, redraw],
			fingerprint: { note: bridge.parsed.fingerprint.note, elements: 12, version: 7 },
		});
		expect(mask.customData.archboard.bridge).toEqual({
			background: "#ffffff",
			bridgeId: mask.id,
			crossing: { x: 50, y: 400 },
			overConnectorId: "over",
			overSegmentIndex: 0,
			role: "mask",
			underConnectorId: "under",
			underSegmentIndex: 0,
		});
		expect(redraw.customData.archboard.bridge).toEqual({
			...mask.customData.archboard.bridge,
			role: "redraw",
		});
		expect(bridge.body).toEqual({ over: "over", under: "under", background: "#ffffff" });
		const bridgeId = String(bridge.parsed.bridgeId);
		expect(bridgeId.length).toBeGreaterThan(0);
		await request("/api/elements/changes?board=scratch", {
			method: "POST",
			body: { origin: "agent", upserts: [], deletes: ["over", "under"] },
		});
		elements = (await request<{ elements: ArchboardElementView[] }>("/api/elements?board=scratch"))
			.body.elements;
		expect(elements.some((element) => element.id === "over")).toBeFalse();
		expect(elements.some((element) => element.id === "under")).toBeFalse();
		expect(elements.some((element) => element.id === bridgeId)).toBeTrue();
		const removed = await run(
			["bridge", "remove", bridgeId],
			BridgeRemovalReceiptSchema,
			`/api/bridges/${bridgeId}`,
		);
		expect(removed.parsed).toEqual({
			success: true,
			board: "scratch",
			bridgeId,
			deleted: [bridgeId, redraw.id],
			elements: [],
			fingerprint: { note: removed.parsed.fingerprint.note, elements: 8, version: 9 },
		});
		expect(removed.body).toBeUndefined();
		expect(removed.method).toBe("DELETE");
		elements = (await request<{ elements: ArchboardElementView[] }>("/api/elements?board=scratch"))
			.body.elements;
		expect(elements.some((element) => element.id === bridgeId)).toBeFalse();
	} finally {
		await resources.disposeAsync();
	}
}, 30_000);
