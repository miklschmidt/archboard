import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
// An arrow must meet the subject it names squarely. The router may choose
// any face, and a self-loop may travel around any side of its own card.

import { expect, test } from "bun:test";
import frameApproach from "./frame-head-approach.json";
import sideApproach from "./side-head-approach.json";
import { type VariantContent } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	routeCrosses,
	routePoints,
	type DrawnPoint,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import type { DiagramBox } from "@/shared/semantic-board/index";

/** Containment and opposing relationships exercise each endpoint face. */
const CROWDED: VariantContent = orderedFixture({
	nodes: [
		{ id: "edge", name: "Edge", kind: "service" },
		{ id: "gw", name: "API Gateway", kind: "route", parent: "edge" },
		{ id: "web", name: "Operator Console", kind: "ui", parent: "edge" },
		{ id: "core", name: "Board Runtime", kind: "service" },
		{ id: "io", name: "board-io", kind: "module", parent: "core" },
		{ id: "queue", name: "Edit Queue", kind: "queue", parent: "core" },
		{ id: "lease", name: "Write Lease", kind: "module", parent: "core" },
		{ id: "store", name: "Vault", kind: "datastore" },
	],
	edges: [
		{ id: "e1", from: "web", to: "gw", kind: "http", label: "REST" },
		{ id: "e2", from: "gw", to: "io", kind: "call", label: "read board" },
		{ id: "e3", from: "gw", to: "queue", kind: "event", label: "enqueue" },
		{ id: "e4", from: "queue", to: "io", kind: "call", label: "drain" },
		{ id: "e5", from: "io", to: "lease", kind: "call", label: "take" },
		{ id: "e6", from: "io", to: "store", kind: "data", label: "writes" },
		{ id: "e7", from: "store", to: "web", kind: "data", label: "the picture" },
		{ id: "e8", from: "lease", to: "gw", kind: "event", label: "released" },
	],
});

/** A nonzero tangent beside an endpoint, toward the rest of its route. */
function tangent(points: readonly DrawnPoint[], end: "first" | "last"): DrawnPoint {
	const ordered = end === "first" ? points : points.toReversed();
	const tip = ordered[0]!;
	const beside = ordered.find(({ x, y }) => Math.hypot(x - tip.x, y - tip.y) > 0.01);
	if (beside === undefined) throw new Error("Route has no visible departure or arrival");
	return { x: beside.x - tip.x, y: beside.y - tip.y };
}

/** Outward normal of the named card face touched by an endpoint. */
function faceNormal(point: DrawnPoint, box: DiagramBox): DrawnPoint {
	const sides = [
		{ distance: Math.abs(point.x - box.x), normal: { x: -1, y: 0 } },
		{ distance: Math.abs(point.x - box.x - box.width), normal: { x: 1, y: 0 } },
		{ distance: Math.abs(point.y - box.y), normal: { x: 0, y: -1 } },
		{ distance: Math.abs(point.y - box.y - box.height), normal: { x: 0, y: 1 } },
	].toSorted((a, b) => a.distance - b.distance);
	expect(point.x).toBeGreaterThanOrEqual(box.x - 2);
	expect(point.x).toBeLessThanOrEqual(box.x + box.width + 2);
	expect(point.y).toBeGreaterThanOrEqual(box.y - 2);
	expect(point.y).toBeLessThanOrEqual(box.y + box.height + 2);
	expect(sides[0]!.distance).toBeLessThan(2);
	return sides[0]!.normal;
}

/** The route approaches the actual named face perpendicularly. */
function expectSquare(point: DrawnPoint, vector: DrawnPoint, box: DiagramBox): void {
	const normal = faceNormal(point, box);
	const length = Math.hypot(vector.x, vector.y);
	expect(Math.abs((vector.x * normal.x + vector.y * normal.y) / length)).toBeGreaterThan(0.999);
}

test("every relationship of a crowded board leaves and arrives square to its named subject", async () => {
	const drawing = await renderArchitecture({ content: CROWDED, theme: "light" });
	const paths = routePoints(drawing.svg);
	expect(paths.size).toBe(CROWDED.edges.length);
	for (const edge of CROWDED.edges) {
		const path = paths.get(edge.id)!;
		expect(path.length, `${edge.id} is drawn`).toBeGreaterThan(1);
		expectSquare(path[0]!, tangent(path, "first"), drawing.atlas.nodes[edge.from]!);
		expectSquare(path.at(-1)!, tangent(path, "last"), drawing.atlas.nodes[edge.to]!);
	}
});

test("a self-loop meets its own card squarely and stays outside its interior", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "core", name: "Board Runtime", kind: "service" },
			{ id: "io", name: "board-io", kind: "module", parent: "core" },
		],
		edges: [
			{ id: "self", from: "io", to: "io", kind: "call", label: "retries" },
			{ id: "down", from: "core", to: "io", kind: "call" },
		],
	});
	const drawing = await renderArchitecture({ content, theme: "light" });
	const path = routePoints(drawing.svg).get("self")!;
	const card = drawing.atlas.nodes["io"]!;
	expect(path.length).toBeGreaterThan(2);
	expectSquare(path[0]!, tangent(path, "first"), card);
	expectSquare(path.at(-1)!, tangent(path, "last"), card);
	expect(
		routeCrosses(path, {
			x: card.x + 1,
			y: card.y + 1,
			width: card.width - 2,
			height: card.height - 2,
		}),
	).toBe(false);
});

// Reduced from Cloud platform-strangler: two relationship kinds put the hero
// arrival's quarter-slot inside the IIS title band. Its eight-unit final leg
// was shorter than the visible arrowhead and left no room for the bend.
test("an incoming frame arrow has a whole head and rounded bend before its endpoint", async () => {
	const content = orderedFixture(frameApproach);
	const drawing = await renderArchitecture({ content, theme: "light" });
	const points = routePoints(drawing.svg).get("g1zvz5QO")!;
	expectSquare(points.at(-1)!, tangent(points, "last"), drawing.atlas.nodes["j6TdeSth"]!);
	const group = drawing.svg.match(
		/<g data-semantic-kind="edge" data-semantic-id="g1zvz5QO"[^>]*>([\s\S]*?)<\/g>/,
	)![1]!;
	const route = [
		...group.matchAll(/<path[^>]*\sd="([^"]*)"[^>]*marker-end="url\(#([^)]+)\)"[^>]*>/g),
	].at(-1)!;
	const width = Number(route[0].match(/stroke-width="([^"]+)"/)![1]);
	const marker = drawing.svg.match(new RegExp(`<marker id="${route[2]}"[^>]*>`))![0];
	const refX = Number(marker.match(/refX="([^"]+)"/)![1]);
	const markerWidth = Number(marker.match(/markerWidth="([^"]+)"/)![1]);
	const viewWidth = Number(marker.match(/viewBox="[^ ]+ [^ ]+ ([^ ]+) [^"]+"/)![1]);
	const headReach = ((refX * markerWidth) / viewWidth) * width;
	const steps = [...route[1]!.matchAll(/([MLC])([^MLC]+)/g)].map((match) => ({
		kind: match[1],
		values: match[2]!.trim().split(/[ ,]+/).map(Number),
	}));
	const end = steps.at(-1)!;
	const corner = steps.at(-2)!;
	expect(end.kind).toBe("L");
	expect(corner.kind, "the incoming bend stays rounded").toBe("C");
	const tip = end.values;
	const beside = corner.values.slice(-2);
	expect(Math.hypot(tip[0]! - beside[0]!, tip[1]! - beside[1]!)).toBeGreaterThan(headReach);
	const start = steps.at(-3)!.values.slice(-2);
	const radius = Math.min(Math.abs(start[0]! - beside[0]!), Math.abs(start[1]! - beside[1]!));
	expect(radius, "the bend has its own room before the head").toBeGreaterThanOrEqual(7.99);
});

// Reduced from Kubernetes runtime HIE4JB9t: Portal's ordinary OIDC connection
// entered a crowded side corridor with only 12.1 units for the head and bend.
test("an ordinary arrow reserves a full straight approach and bend beside neighboring cards", async () => {
	const content = orderedFixture(sideApproach);
	const drawing = await renderArchitecture({ content, theme: "light" });
	const points = routePoints(drawing.svg).get("tPQRa40r")!;
	expectSquare(points.at(-1)!, tangent(points, "last"), drawing.atlas.nodes["mVg3PdJf"]!);
	const group = drawing.svg.match(
		/<g data-semantic-kind="edge" data-semantic-id="tPQRa40r"[^>]*>([\s\S]*?)<\/g>/,
	)![1]!;
	const path = [...group.matchAll(/<path[^>]*\sd="([^"]*)"[^>]*marker-end=/g)].at(-1)![1]!;
	const steps = [...path.matchAll(/([MLC])([^MLC]+)/g)].map((match) => ({
		kind: match[1],
		point: match[2]!.trim().split(/[ ,]+/).map(Number).slice(-2),
	}));
	const tip = steps.at(-1)!;
	const before = steps.at(-2)!;
	expect(tip.kind).toBe("L");
	expect(
		Math.hypot(tip.point[0]! - before.point[0]!, tip.point[1]! - before.point[1]!),
	).toBeGreaterThanOrEqual(11.99);
	if (steps.length === 2) return; // A clear straight connection needs no bend.
	expect(before.kind).toBe("C");
	const start = steps.at(-3)!.point;
	const radius = Math.min(
		Math.abs(start[0]! - before.point[0]!),
		Math.abs(start[1]! - before.point[1]!),
	);
	expect(radius).toBeCloseTo(8, 2);
});
