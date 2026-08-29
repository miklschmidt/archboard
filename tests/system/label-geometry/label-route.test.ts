import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	boundTextDrift,
	boundTextPlacement,
	boundTextsByContainer,
	labelSeedOf,
} from "../../../src/runtime/engine/labels.ts";
import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import {
	AcknowledgementRouteResponseSchema,
	ElementsRouteResponseSchema,
	labelRouteElements,
	RouteElementRequestSchema,
	SuccessfulRouteResponseSchema,
} from "./fixtures/route-cases.ts";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-label-route-"));
let canvas: OwnedCanvas;
let request: ReturnType<typeof createJsonRequester>;

beforeAll(async () => {
	canvas = await startOwnedCanvas({
		serverPath: path.join(repoRoot, "src/server.ts"),
		vault,
	});
	request = createJsonRequester(canvas);
});

afterAll(async () => {
	await canvas?.dispose();
});

const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const required = <T>(value: T | null | undefined, message: string): T => {
	expect(value, message).toBeDefined();
	if (value === null || value === undefined) throw new Error(message);
	return value;
};
const seedOf = labelSeedOf;
const textOf = (element: ServerElement | undefined): string | undefined =>
	element?.type === "text" ? element.text : undefined;

describe("label routes", () => {
	test("rejects misspelled request fixtures and malformed response elements", () => {
		expect(
			RouteElementRequestSchema.safeParse({
				id: "bad",
				type: "rectangel",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
			}).success,
		).toBeFalse();
		expect(
			RouteElementRequestSchema.safeParse({
				id: "bad",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 10,
				height: 10,
				widht: 10,
			}).success,
		).toBeFalse();
		expect(
			AcknowledgementRouteResponseSchema.safeParse({ success: false, error: "no" }).success,
		).toBeFalse();
		expect(
			ElementsRouteResponseSchema.safeParse({
				elements: [{ id: "bad", type: "rectangle", x: "zero", y: 0 }],
			}).success,
		).toBeFalse();
	});

	test("expands, moves, resizes, reroutes, renames, saves, and reopens labels", async () => {
		const write = async (method: string, url: string, body?: unknown): Promise<void> => {
			const response = await request<unknown>(url, {
				method,
				body,
				doing: "checking that a label goes where its shape goes",
			});
			if ((response.body as { success?: unknown }).success !== true)
				throw new Error(`${method} ${url} failed: ${JSON.stringify(response.body)}`);
			AcknowledgementRouteResponseSchema.parse(response.body);
		};
		const board = "?board=scratch";
		const elementsOn = async (key = "scratch"): Promise<ServerElement[]> => {
			const response = await request<unknown>("/api/elements?board=" + encodeURIComponent(key));
			return ElementsRouteResponseSchema.parse(response.body).elements;
		};
		const driftOn = async (key: string) => boundTextDrift(await elementsOn(key));
		await write("POST", `/api/elements/batch${board}`, {
			elements: labelRouteElements(),
		});

		const drawnElements = await elementsOn();
		assert(
			drawnElements.length === 8,
			`four labelled elements became ${drawnElements.length} on the board, not eight`,
		);
		const drawnLabels = boundTextsByContainer(drawnElements);
		for (const id of ["svc", "gw", "pg", "wire"]) {
			assert(
				drawnLabels.get(id)?.length === 1,
				`${id} came back with ${drawnLabels.get(id)?.length ?? 0} bound texts, not one`,
			);
		}
		assert(
			(await driftOn("scratch")).length === 0,
			"the newly drawn board was drifted before anything moved",
		);

		const held = drawnElements
			.filter((element) => seedOf(element) !== undefined)
			.map((element) => element.id);
		assert(held.length === 0, `the board came back holding a label seed on ${held.join(", ")}`);

		await write("PUT", `/api/elements/svc${board}`, { x: 100, y: 900 });
		let drifted = await driftOn("scratch");
		assert(
			drifted.length === 0,
			`moving a shape stranded ${drifted.length} label(s): ${drifted.map((d) => `${d.text} ${Math.round(d.distance)}px`).join(", ")}`,
		);

		await write("PUT", `/api/elements/gw${board}`, { width: 500, height: 400 });
		drifted = await driftOn("scratch");
		assert(
			drifted.length === 0,
			`resizing a shape stranded ${drifted.length} label(s): ${drifted.map((d) => `${d.text} ${Math.round(d.distance)}px`).join(", ")}`,
		);

		await write("PUT", `/api/elements/wire${board}`, {
			points: [
				[0, 0],
				[400, 500],
			],
		});
		assert((await driftOn("scratch")).length === 0, "re-pointing an arrow stranded its label");

		await write("PUT", `/api/elements/wire${board}`, { end: { id: "pg" } });
		const wire = required(
			(await elementsOn()).find((element) => element.id === "wire"),
			"the wire was not persisted",
		);
		if (wire.type !== "arrow" && wire.type !== "line") throw new Error("wire is not linear");
		assert(
			JSON.stringify(wire.points) !==
				JSON.stringify([
					[0, 0],
					[400, 500],
				]),
			"pointing an arrow at a different shape did not re-route it",
		);
		assert((await driftOn("scratch")).length === 0, "re-binding an arrow stranded its label");

		const scene = await elementsOn();
		const byId = new Map(scene.map((element) => [element.id, element]));
		for (const [containerId, textIds] of boundTextsByContainer(scene)) {
			const text = required(
				byId.get(required(textIds[0], "a label id is missing")),
				"text missing",
			);
			const wanted = required(
				boundTextPlacement(required(byId.get(containerId), "container missing"), text),
				"the label has no placement",
			);
			assert(
				Math.abs(text.x - wanted.x) < 0.5 && Math.abs(text.y - wanted.y) < 0.5,
				`${JSON.stringify(textOf(text))} is stored at ${Math.round(text.x)},${Math.round(text.y)} ` +
					`where its container draws it at ${Math.round(wanted.x)},${Math.round(wanted.y)}`,
			);
		}

		await write("PUT", `/api/elements/svc${board}`, {
			label: { text: "IdentityService" },
		});
		const renamed = await elementsOn();
		const svcLabels = boundTextsByContainer(renamed).get("svc") ?? [];
		assert(
			svcLabels.length === 1,
			`renaming over PUT left svc with ${svcLabels.length} bound texts`,
		);
		assert(
			textOf(renamed.find((element) => element.id === svcLabels[0])) === "IdentityService",
			"the rename did not reach the text element that is the label",
		);
		assert(
			seedOf(
				required(
					renamed.find((element) => element.id === "svc"),
					"svc missing",
				),
			) === undefined,
			"a rename over PUT left its seed on the board",
		);
		assert(renamed.length === 8, `renaming changed the board from 8 elements to ${renamed.length}`);

		const savedResponse = await request<unknown>(`/api/boards/save${board}`, {
			method: "POST",
			body: { name: "labelled" },
			doing: "checking that a label goes where its shape goes",
		});
		if ((savedResponse.body as { success?: unknown }).success !== true)
			throw new Error(`Saving labelled failed: ${JSON.stringify(savedResponse.body)}`);
		const saved = SuccessfulRouteResponseSchema.parse(savedResponse.body);
		assert(saved.success, `saving the board failed: ${JSON.stringify(saved?.error ?? saved)}`);
		const reopenedResponse = await request<unknown>("/api/boards/open", {
			method: "POST",
			body: { board: "labelled" },
			doing: "checking that a label goes where its shape goes",
		});
		if ((reopenedResponse.body as { success?: unknown }).success !== true)
			throw new Error(`Reopening labelled failed: ${JSON.stringify(reopenedResponse.body)}`);
		const reopened = SuccessfulRouteResponseSchema.parse(reopenedResponse.body);
		assert(
			reopened.success,
			`reopening the board failed: ${JSON.stringify(reopened?.error ?? reopened)}`,
		);
		const back = await driftOn("labelled");
		assert(
			back.length === 0,
			`a board saved and reopened came back with ${back.length} drifted label(s): ` +
				back.map((d) => `${d.text} ${Math.round(d.distance)}px`).join(", "),
		);
	});
});
