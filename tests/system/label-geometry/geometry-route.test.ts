import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { BOUND_ARROW_GAP, boundEndpoint } from "../../../src/runtime/engine/arrow-binding.ts";
import { remeasureLinear } from "../../../src/runtime/engine/geometry.ts";
import type { ServerElement } from "../../../src/runtime/engine/types.ts";
import { createJsonRequester } from "../boards/support/http.ts";
import { startOwnedCanvas, type OwnedCanvas } from "../support/owned-canvas.ts";
import {
	AcknowledgementRouteResponseSchema,
	BoardInfoRouteResponseSchema,
	capturedArrowStart,
	capturedBrowserEndpoint,
	capturedFocusedNode,
	capturedUserArrow,
	ElementsRouteResponseSchema,
	geometryBoardElements,
	geometryRegionElements,
	geometryWireElements,
	malformedGeometryElements,
	malformedGeometryError,
	RefusalRouteResponseSchema,
} from "./fixtures/route-cases.ts";
interface Point {
	x: number;
	y: number;
}
type LinearElement = Extract<ServerElement, { type: "arrow" | "line" }>;

const pathOf = (element: LinearElement) => JSON.stringify(element.points);
const at = (element: LinearElement, index: number): Point => ({
	x: element.x + (element.points?.[index]?.[0] ?? 0),
	y: element.y + (element.points?.[index]?.[1] ?? 0),
});
const near = (a: number, b: number, slack = 0.5): boolean => Math.abs(a - b) <= slack;
const assert = (condition: unknown, message: string): void =>
	expect(Boolean(condition), message).toBeTrue();
const required = <T>(value: T | null | undefined, message: string): T => {
	expect(value, message).toBeDefined();
	if (value === null || value === undefined) throw new Error(message);
	return value;
};
const elementById = (elements: readonly ServerElement[], id: string): ServerElement =>
	required(
		elements.find((element) => element.id === id),
		`Missing fixture element ${id}.`,
	);
const linearById = (elements: readonly ServerElement[], id: string): LinearElement => {
	const element = elementById(elements, id);
	if (element.type !== "arrow" && element.type !== "line") throw new Error(`${id} is not linear`);
	return element;
};
const pointsOf = (element: LinearElement): readonly (readonly number[])[] => element.points;
const badlySized = (linearElements: readonly ServerElement[]): ServerElement[] =>
	linearElements.filter((element) => remeasureLinear(element) !== undefined);

const repoRoot = path.resolve(import.meta.dir, "../../..");
const vault = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-geometry-route-"));
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

describe("geometry routes", () => {
	test("refuses malformed geometry without changing note, version, or elements", async () => {
		const created = await request<unknown>("/api/boards/new", {
			method: "POST",
			body: { board: "geometry-refusal" },
		});
		AcknowledgementRouteResponseSchema.parse(created.body);
		const seeded = await request<unknown>("/api/elements?board=geometry-refusal", {
			method: "POST",
			body: {
				id: "seed",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 120,
				height: 60,
			},
		});
		AcknowledgementRouteResponseSchema.parse(seeded.body);
		const infoResponse = await request<unknown>("/api/boards/info?board=geometry-refusal");
		const info = BoardInfoRouteResponseSchema.parse(infoResponse.body);
		expect(typeof info.file).toBe("string");
		const beforeNote = fs.readFileSync(info.file);
		const beforeResponse = await request<unknown>("/api/elements?board=geometry-refusal");
		const before = ElementsRouteResponseSchema.parse(beforeResponse.body);
		const response = await request<unknown>("/api/elements/batch?board=geometry-refusal", {
			method: "POST",
			body: { elements: malformedGeometryElements() },
		});
		expect(response.status).toBe(400);
		const refusal = RefusalRouteResponseSchema.parse(response.body);
		expect(refusal.error).toBe(malformedGeometryError);
		const afterResponse = await request<unknown>("/api/elements?board=geometry-refusal");
		const after = ElementsRouteResponseSchema.parse(afterResponse.body);
		expect(fs.readFileSync(info.file).equals(beforeNote)).toBeTrue();
		expect(after.fingerprint?.version).toBe(before.fingerprint?.version);
		expect(JSON.stringify(after.elements)).toBe(JSON.stringify(before.elements));
	});

	test("remeasures, reroutes, queries, rebinds, nudges, and restores arrows", async () => {
		const write = async (method: string, url: string, body?: unknown): Promise<void> => {
			const response = await request<unknown>(url, {
				method,
				body,
				doing: "checking where an arrow goes",
			});
			AcknowledgementRouteResponseSchema.parse(response.body);
		};
		const board = "?board=scratch";
		const elementsOn = async (key = "scratch"): Promise<ServerElement[]> => {
			const response = await request<unknown>("/api/elements?board=" + encodeURIComponent(key));
			return ElementsRouteResponseSchema.parse(response.body).elements;
		};
		await write("POST", `/api/elements/batch${board}`, {
			elements: geometryBoardElements(),
		});
		const linearsOn = async (): Promise<LinearElement[]> =>
			(await elementsOn()).filter(
				(element): element is LinearElement => element.type === "arrow" || element.type === "line",
			);
		const drawn = await linearsOn();
		assert(drawn.length === 4, `the board should hold four arrows, not ${drawn.length}`);
		assert(
			drawn.every((el) => pointsOf(el).some(([px, py]) => (px ?? 0) < 0 || (py ?? 0) < 0)),
			"the check is not exercising the bug: every arrow here should run leftwards or upwards",
		);
		assert(
			pointsOf(linearById(drawn, "to-northwest")).some(
				([px, py]) => (px ?? 0) < 0 && (py ?? 0) < 0,
			),
			"the up-and-left arrow should be negative in both axes",
		);
		assert(
			badlySized(drawn).length === 0,
			`${badlySized(drawn).length} arrow(s) were created at a size their points do not agree with: ` +
				badlySized(drawn)
					.map((el) => `${el.id} ${el.width}x${el.height}`)
					.join(", "),
		);
		await write("PUT", `/api/elements/hub${board}`, { x: 2400, y: 1800 });
		const rerouted = await linearsOn();
		const bound = rerouted.filter((el) => el.id !== "stray");
		assert(
			bound.every((el) => {
				const was = linearById(drawn, el.id);
				return JSON.stringify(pointsOf(was)) !== JSON.stringify(pointsOf(el));
			}),
			"moving the hub should have re-routed all three arrows bound to it",
		);
		assert(
			badlySized(rerouted).length === 0,
			`re-routing left ${badlySized(rerouted).length} arrow(s) at a stale size: ` +
				badlySized(rerouted)
					.map(
						(el) => `${el.id} ${el.width}x${el.height} vs ${JSON.stringify(remeasureLinear(el))}`,
					)
					.join(", "),
		);
		await write("PUT", `/api/elements/to-west${board}`, {
			points: [
				[0, 0],
				[-900, -400],
			],
		});
		const repointed = elementById(await linearsOn(), "to-west");
		assert(
			near(repointed.width ?? 0, 900) && near(repointed.height ?? 0, 400),
			`re-pointing an arrow left it ${repointed.width}x${repointed.height}, not 900x400`,
		);
		await write("POST", `/api/elements/batch${board}`, {
			elements: geometryRegionElements(),
		});
		const inRegion = async () => {
			const query = "x_min=2400&x_max=2600&y_min=3900&y_max=4100";
			const response = await request<unknown>(`/api/elements/search?board=scratch&${query}`);
			const found = ElementsRouteResponseSchema.parse(response.body);
			return new Set(found.elements.map((el) => el.id));
		};
		const hits = await inRegion();
		assert(
			hits.has("crosser"),
			"an arrow drawn straight across the region should be found in it, wherever it started",
		);
		assert(
			hits.has("starter"),
			"an arrow that begins in the region overlaps it, so it is found — by its extent, like everything else",
		);
		assert(
			hits.has("wide-box"),
			"a box overlapping the region is in it, even though its top-left corner is not",
		);
		assert(
			!hits.has("elsewhere"),
			"a box 6000px away is not in the region, and a filter that says it is filters nothing",
		);
		await write("POST", "/api/boards/new", { board: "wires" });
		const wires = "?board=wires";
		const wiresOn = async () => elementsOn("wires");
		const wire = async (id: string): Promise<LinearElement> => linearById(await wiresOn(), id);

		await write("POST", `/api/elements/batch${wires}`, {
			elements: geometryWireElements(),
		});

		const drawnArr = await wire("arr");
		assert(
			!("start" in drawnArr) && !("end" in drawnArr),
			"an arrow's `start`/`end` refs were stored, so the board holds two answers to what it touches",
		);
		assert(
			drawnArr.startBinding?.elementId === "a" && drawnArr.endBinding?.elementId === "b",
			"the refs were not converted into the binding that replaces them",
		);
		assert(
			near(drawnArr.x, 100 + BOUND_ARROW_GAP),
			`a bound arrow starts ${Math.round(drawnArr.x - 100)}px off box A, not the ` +
				`${BOUND_ARROW_GAP} its own binding records`,
		);

		const bentBefore = await wire("bent");
		const bendBefore = at(bentBefore, 1);
		await write("PUT", `/api/elements/b${wires}`, { x: 400, y: -200 });
		const bentAfter = await wire("bent");
		assert(
			pointsOf(bentAfter).length === 3,
			`moving a box flattened a three-point arrow to ${pointsOf(bentAfter).length} points`,
		);
		const bendAfter = at(bentAfter, 1);
		assert(
			near(bendAfter.x, bendBefore.x, 1) && near(bendAfter.y, bendBefore.y, 1),
			`the bend moved from ${Math.round(bendBefore.x)},${Math.round(bendBefore.y)} to ` +
				`${Math.round(bendAfter.x)},${Math.round(bendAfter.y)}`,
		);
		assert(
			!near(at(bentAfter, 2).y, at(bentBefore, 2).y, 1),
			"the check is not exercising anything: the end bound to the box that moved should have followed it",
		);

		const rebound = {
			...(await wire("arr")),
			startBinding: {
				elementId: "c",
				focus: 0,
				gap: BOUND_ARROW_GAP,
				fixedPoint: null,
			},
			points: [
				[0, 0],
				[300, -270],
			],
		};
		await write("POST", `/api/elements/changes${wires}`, {
			upserts: [rebound],
			deletes: [],
			clientId: "a-person",
		});
		const asLeft = await wire("arr");
		assert(asLeft.startBinding?.elementId === "c", "the person's re-bind did not reach the board");

		await write("PUT", `/api/elements/a${wires}`, { x: 0, y: -200 });
		const afterUnrelatedMove = await wire("arr");
		assert(
			pathOf(afterUnrelatedMove) === pathOf(asLeft),
			`moving a shape the arrow no longer touches dragged it from ${pathOf(asLeft)} to ` +
				`${pathOf(afterUnrelatedMove)}, undoing where a person put it`,
		);

		const loosened = {
			...(await wire("arr")),
			endBinding: null,
			points: [
				[0, 0],
				[900, 900],
			],
		};
		await write("POST", `/api/elements/changes${wires}`, {
			upserts: [loosened],
			deletes: [],
			clientId: "a-person",
		});
		const loose = await wire("arr");
		assert(loose.endBinding === null, "unbinding an arrow end did not reach the board");
		await write("PUT", `/api/elements/b${wires}`, { x: 900, y: 400 });
		assert(
			pathOf(await wire("arr")) === pathOf(loose),
			"moving the box an arrow end was dragged off pulled the loose end back to it",
		);

		await write("POST", `/api/elements/batch${wires}`, {
			elements: [{ id: "d", ...capturedFocusedNode }],
		});
		await write("POST", `/api/elements/changes${wires}`, {
			upserts: [capturedUserArrow()],
			deletes: [],
			clientId: "a-person",
		});
		const userDrawn = await wire("user-arrow");
		assert(
			userDrawn.endBinding?.gap === 15 && userDrawn.endBinding?.focus === 0.9,
			"the person's own focus and gap did not survive the report",
		);

		const asDropped = at(userDrawn, 1);
		await write("PUT", `/api/elements/d${wires}`, {
			x: capturedFocusedNode.x,
			y: capturedFocusedNode.y,
		});
		const settledEnd = at(await wire("user-arrow"), 1);
		assert(
			Math.hypot(
				settledEnd.x - capturedBrowserEndpoint.x,
				settledEnd.y - capturedBrowserEndpoint.y,
			) <= 0.001,
			`the server settled the captured browser end at ${settledEnd.x},${settledEnd.y}`,
		);
		const settledArrow = await wire("user-arrow");
		const centred = boundEndpoint(
			capturedFocusedNode,
			{ elementId: "d", focus: 0, gap: 15, fixedPoint: null },
			at(settledArrow, 0),
			settledEnd,
		);
		assert(
			Math.hypot(settledEnd.x - centred.x, settledEnd.y - centred.y) > 10,
			`focus 0.9 was routed to ${Math.round(settledEnd.y)}, which is where focus 0 puts it ` +
				"(a centred path), rather than low on the box where it was attached",
		);
		assert(
			near(settledEnd.x, asDropped.x, 10),
			"the check is not exercising anything: routing moved the end right across the box",
		);

		const nudgedNode = {
			...capturedFocusedNode,
			x: capturedFocusedNode.x + 40,
			y: capturedFocusedNode.y + 30,
		};
		await write("PUT", `/api/elements/d${wires}`, {
			x: nudgedNode.x,
			y: nudgedNode.y,
		});
		const nudged = at(await wire("user-arrow"), 1);
		assert(
			!near(nudged.x, settledEnd.x, 1) || !near(nudged.y, settledEnd.y, 1),
			"moving the box did not re-route the arrow bound to it",
		);
		const expectedNudged = boundEndpoint(
			nudgedNode,
			{ elementId: "d", focus: 0.9, gap: 15, fixedPoint: null },
			capturedArrowStart,
			nudged,
		);
		assert(
			near(nudged.x, expectedNudged.x, 0.001) && near(nudged.y, expectedNudged.y, 0.001),
			`the server routed the nudged end to ${nudged.x},${nudged.y}, not ` +
				`${expectedNudged.x},${expectedNudged.y}`,
		);

		await write("PUT", `/api/elements/d${wires}`, {
			x: capturedFocusedNode.x,
			y: capturedFocusedNode.y,
		});
		const restored = at(await wire("user-arrow"), 1);
		assert(
			near(restored.x, settledEnd.x, 0.5) && near(restored.y, settledEnd.y, 0.5),
			`putting the box back left the arrow at ${Math.round(restored.x)},${Math.round(restored.y)} ` +
				`rather than the ${Math.round(settledEnd.x)},${Math.round(settledEnd.y)} its binding puts it at`,
		);
	});
});
