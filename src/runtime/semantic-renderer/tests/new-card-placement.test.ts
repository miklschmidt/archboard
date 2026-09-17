import { expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { along, depth, readingOf } from "@/runtime/semantic-renderer/tests/drawn-reading";
import { routeLabels, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";

test("new dependent cards use nearby free space and align their terminal connection", async () => {
	const before = VariantContentSchema.parse({
		nodes: [
			["LgbAlvMN", "Canvas server"],
			["wpI1LbzG", "View dispatcher"],
			["Y0smyqtZ", "Compound layout"],
			["wLF1X11D", "Data-flow layout"],
			["u1OXg3Yy", "Theme palette"],
			["J7mPrUeP", "SVG painters"],
			["eECDrhMc", "SVG document"],
		].map(([id, name]) => ({ id, name, kind: "module" })),
		edges: [
			["fl3z5Duy", "LgbAlvMN", "wpI1LbzG"],
			["PjA6m5Ft", "wpI1LbzG", "wLF1X11D"],
			["WwNFCjLE", "wpI1LbzG", "u1OXg3Yy"],
			["SIdU2g2Q", "Y0smyqtZ", "J7mPrUeP"],
			["qDiEFiIT", "J7mPrUeP", "eECDrhMc"],
			["8EDKem8V", "eECDrhMc", "LgbAlvMN"],
		].map(([id, from, to]) => ({ id, from, to, kind: "call" })),
	});
	const content = VariantContentSchema.parse({
		...before,
		nodes: [
			...before.nodes,
			{ id: "g4QgxvtX", name: "Measure", kind: "module" },
			{ id: "QlYHEFsZ", name: "Leaf", kind: "module" },
		],
		edges: [
			...before.edges,
			{ id: "8c58qiNK", from: "g4QgxvtX", to: "Y0smyqtZ", kind: "call" },
			{ id: "LQhiBOCm", from: "g4QgxvtX", to: "QlYHEFsZ", kind: "call" },
		],
	});
	const baseline = await renderArchitecture({ content: before, theme: "light" });
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const farthest = Math.max(...Object.values(baseline.atlas.nodes).map((box) => box.x + box.width));
	expect(drawing.atlas.nodes["g4QgxvtX"]!.x).toBeLessThan(farthest);
	for (const node of before.nodes)
		expect(drawing.atlas.nodes[node.id]!.x).toBe(baseline.atlas.nodes[node.id]!.x);
	const points = routePoints(drawing.svg).get("LQhiBOCm")!;
	for (const point of points) expect(point.x).toBeCloseTo(points[0]!.x, 2);
});

test("a new terminal stays below its new dependency when only the dependency reaches an old anchor", async () => {
	const before = VariantContentSchema.parse({
		nodes: ["n0", "n1", "n2"].map((id, index) => ({ id, name: `Stage ${index}`, kind: "module" })),
		edges: [
			{ id: "first", from: "n0", to: "n1", kind: "call" },
			{ id: "second", from: "n1", to: "n2", kind: "call" },
		],
	});
	const content = VariantContentSchema.parse({
		...before,
		nodes: [
			...before.nodes,
			{ id: "new", name: "New branch", kind: "module" },
			{ id: "leaf", name: "Terminal", kind: "module" },
		],
		edges: [
			...before.edges,
			{ id: "anchor", from: "new", to: "n2", kind: "call" },
			{ id: "terminal", from: "new", to: "leaf", kind: "call" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const direction = readingOf(drawing);
	const source = drawing.atlas.nodes["new"]!,
		target = drawing.atlas.nodes["leaf"]!;
	expect(along(target, direction)).toBeGreaterThan(
		along(source, direction) + depth(source, direction),
	);
});

test("new branches leave measured badge room beside an inherited return corridor", async () => {
	const before = VariantContentSchema.parse({
		nodes: ["n0", "n1", "n2"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "first", from: "n0", to: "n1", kind: "call" },
			{ id: "second", from: "n1", to: "n2", kind: "call" },
			{ id: "return", from: "n2", to: "n0", kind: "call" },
		],
	});
	const content = VariantContentSchema.parse({
		...before,
		nodes: [
			...before.nodes,
			{ id: "new", name: "New branch", kind: "module" },
			{ id: "leaf", name: "Terminal", kind: "module" },
		],
		edges: [
			...before.edges,
			{ id: "anchor", from: "new", to: "n1", kind: "call", label: "Measured card and label sizes" },
			{ id: "terminal", from: "new", to: "leaf", kind: "call" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const routes = routePoints(drawing.svg);
	const returnLane = Math.max(...routes.get("return")!.map((point) => point.x));
	const source = routes.get("anchor")![0]!;
	const badge = routeLabels(drawing.svg).get("anchor")!;
	expect(source.x - returnLane).toBeGreaterThan(badge.width);
	const anchor = routes.get("anchor")!;
	expect(
		anchor.slice(1).some((end, index) => {
			const start = anchor[index]!;
			return (
				start.y === end.y &&
				Math.abs(start.y - badge.y - badge.height / 2) < 0.01 &&
				Math.min(start.x, end.x) <= badge.x &&
				Math.max(start.x, end.x) >= badge.x + badge.width
			);
		}),
	).toBe(true);
});

test("removed return routes do not reserve room beside new branches", async () => {
	const before = VariantContentSchema.parse({
		nodes: ["n0", "n1", "n2"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "first", from: "n0", to: "n1", kind: "call" },
			{ id: "second", from: "n1", to: "n2", kind: "call" },
			{ id: "return", from: "n2", to: "n0", kind: "call" },
		],
	});
	const withoutReturn = VariantContentSchema.parse({
		...before,
		edges: before.edges.filter((edge) => edge.id !== "return"),
	});
	const content = VariantContentSchema.parse({
		...withoutReturn,
		nodes: [
			...before.nodes,
			{ id: "new", name: "New branch", kind: "module" },
			{ id: "leaf", name: "Terminal", kind: "module" },
		],
		edges: [
			...withoutReturn.edges,
			{ id: "anchor", from: "new", to: "n1", kind: "call", label: "Measured card and label sizes" },
			{ id: "terminal", from: "new", to: "leaf", kind: "call" },
		],
	});
	const removed = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const absent = await renderArchitecture({
		content,
		predecessors: [withoutReturn],
		theme: "light",
	});
	expect(removed.atlas.nodes["new"]!.x - removed.atlas.nodes["n1"]!.x).toBe(
		absent.atlas.nodes["new"]!.x - absent.atlas.nodes["n1"]!.x,
	);
});

test("a new terminal shares its independent old sibling's layer after inserting their dependency", async () => {
	const before = VariantContentSchema.parse({
		nodes: ["n0", "n1"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [{ id: "old", from: "n0", to: "n1", kind: "call", label: "visible regions" }],
	});
	const content = VariantContentSchema.parse({
		...before,
		nodes: [
			...before.nodes,
			{ id: "new", name: "Card measurement", kind: "module" },
			{ id: "leaf", name: "Pretext", kind: "module" },
		],
		edges: [
			...before.edges,
			{ id: "in", from: "n0", to: "new", kind: "call", label: "subjects to measure" },
			{ id: "out", from: "new", to: "n1", kind: "call", label: "card and label sizes" },
			{ id: "end", from: "new", to: "leaf", kind: "call", label: "prepare and wrap text" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	const direction = readingOf(drawing);
	expect(along(drawing.atlas.nodes["leaf"]!, direction)).toBe(
		along(drawing.atlas.nodes["n1"]!, direction),
	);
});

test("new cards joined by a relationship the router routes freely still draw", async () => {
	// A skip a first render does not bracket carries no ports at all: the engine
	// picks its faces. Two new cards on such a relationship have no ordered
	// attachment to line up on, and the placement hints must say so rather than
	// read a port that was never made.
	const before = VariantContentSchema.parse({
		nodes: [
			{ id: "driver", name: "Driver", kind: "module" },
			{ id: "painter", name: "Painter", kind: "module" },
		],
		edges: [{ id: "paint", from: "driver", to: "painter", kind: "call" }],
	});
	const content = VariantContentSchema.parse({
		nodes: [
			...before.nodes,
			{ id: "layout", name: "Layout", kind: "module" },
			{ id: "reading", name: "Reading", kind: "module" },
			{ id: "score", name: "Score", kind: "module" },
		],
		edges: [
			...before.edges,
			{ id: "settle", from: "driver", to: "layout", kind: "call" },
			{ id: "choose", from: "layout", to: "reading", kind: "call" },
			{ id: "skip", from: "layout", to: "score", kind: "call" },
			{ id: "reject", from: "reading", to: "score", kind: "call" },
		],
	});
	const drawing = await renderArchitecture({ content, predecessors: [before], theme: "light" });
	for (const node of content.nodes) expect(drawing.atlas.nodes[node.id]).toBeDefined();
});
