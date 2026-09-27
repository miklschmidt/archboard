// Crossings along one line close enough for their hops to touch, on fixed
// route geometry: who rises over them, under how many arcs.
import { expect, test } from "bun:test";
import { across, bridged, down, drawing, hops } from "./fixed-routes";

// Command interface and Skill evaluation: two lines sixteen apart crossing one
// line each hopped it cleanly, and became one long brace on the line they cross.
test("lines crossing a line sixteen apart each hop it, where every hop fits", () => {
	// Whether the crossed line is painted first or between the two.
	for (const routes of [
		[down(50, 0, 150), across(50), across(66)],
		[across(50), down(50, 0, 150), across(66)],
	]) {
		const line = String(routes.indexOf(routes.find((points) => points[0]!.x === 50)!));
		const result = bridged(drawing(routes));
		expect(result.bridges).toHaveLength(2);
		for (const bridge of result.bridges) {
			expect(hops(bridge)).toBe(true);
			expect(bridge.under).toEqual([line]);
		}
	}
});

// Code review: a hop on one of two close lines stood first, and left the other
// line cut where one crest over both fits.
test("where lines too close to hop one each cross a line, it rises over them under one crest, even with less room", () => {
	const turning = [
		{ x: 50, y: 0 },
		{ x: 50, y: 90 },
		{ x: 100, y: 90 },
	];
	for (const routes of [
		[turning, across(50), across(62)],
		[across(50), turning, across(62)],
	]) {
		const line = String(routes.indexOf(turning));
		const result = bridged(drawing(routes));
		expect(result.bridges).toHaveLength(1);
		expect(result.bridges[0]!.edgeId).toBe(line);
		expect(hops(result.bridges[0]!)).toBe(true);
		expect(result.bridges[0]!.under.toSorted()).toEqual(
			["0", "1", "2"].filter((id) => id !== line),
		);
	}
});

// Where a cluster holds a crossing no hop can pass over, its line still rises
// over the crossings it can, one at a time.
test("a line rises over one crossing of a cluster whose crest cannot stand", () => {
	const result = bridged(
		drawing([
			across(50),
			// Turns eight below the crossing: it cannot rise, but a hop passes over it.
			[
				{ x: 40, y: 0 },
				{ x: 40, y: 64 },
				{ x: 0, y: 64 },
			],
			// Ends ten above the crossing: nothing rises over it.
			down(60, 100, 40),
		]),
	);
	const hop = result.bridges.find(hops);
	expect(hop).toMatchObject({ edgeId: "0", under: ["1"] });
	expect(result.bridges.filter((bridge) => !hops(bridge))).toHaveLength(1);
});

// Code review: a crest over two lines spanned a line ending between them,
// whose cut beneath then erased its arrowhead under ink no longer there.
test("a crest never spans a crossing it does not hop", () => {
	const result = bridged(drawing([down(40), down(60), down(50, 100, 47), across(50)]));
	for (const bridge of result.bridges.filter(hops)) {
		const xs = [bridge.curve.from.x, bridge.curve.segments.at(-1)!.to.x];
		const ys = [bridge.curve.from.y, bridge.curve.segments.at(-1)!.to.y];
		const spans = Math.min(...xs) < 50 && Math.max(...xs) > 50 && ys.every((y) => y === 50);
		expect(spans).toBe(false);
	}
});

// Browser application (blocks): a line hopped one line and was hopped by
// another sixteen apart, the two arcs one knot.
test("a line is above or beneath along all of one cluster, never both", () => {
	const result = bridged(
		drawing([
			// Turns fourteen below its second crossing: it can hop that one alone, but
			// has no room for a crest over both.
			[
				{ x: 100, y: 0 },
				{ x: 100, y: 138 },
				{ x: 200, y: 138 },
			],
			across(100, 0, 200),
			// Turns six before the crossing: it cannot rise.
			[
				{ x: 86, y: 200 },
				{ x: 86, y: 116 },
				{ x: 200, y: 116 },
			],
		]),
	);
	const over = result.bridges.filter((bridge) => hops(bridge) && bridge.under.includes("0"));
	expect(over).toHaveLength(1);
	expect(result.bridges.some((bridge) => hops(bridge) && bridge.edgeId === "0")).toBe(false);
});

// Agent workbench (blocks): a solid line rose over two dashed lines sixteen
// apart under one long brace, where cutting reads cleaner. The cut is the solid
// line's: a dashed line's gap is lost among its own (the user, 2026-09-27).
test("dashed lines close together across a solid line are not hopped under one crest; the solid line is cut", () => {
	const result = bridged(
		drawing([down(50, 0, 150), across(50), across(66)], [{}, { kind: "event" }, { kind: "event" }]),
	);
	expect(result.bridges).toHaveLength(2);
	for (const bridge of result.bridges) {
		expect(hops(bridge)).toBe(false);
		expect(bridge.under).toEqual(["0"]);
	}
});

// Agent workbench (blocks): a line hopped one line sixteen past where a
// weightier line it could not rise over was cut through it. The weightier line
// hops it instead, and the line is cut where no hop has room beside that one.
test("a weightier line hops a line that cannot rise over it, and no hop stands beside that one", () => {
	const result = bridged(
		drawing(
			[
				// Starts twenty above the weightier line, too near to rise over it.
				down(50, 30, 150),
				across(50),
				// Turns four before the crossing: it cannot rise.
				[
					{ x: 38, y: 120 },
					{ x: 38, y: 66 },
					{ x: 150, y: 66 },
				],
			],
			[{}, { emphasis: "hero" }, {}],
		),
	);
	expect(result.bridges.filter(hops)).toMatchObject([{ edgeId: "1", under: ["0"] }]);
});

// Archboard server (blocks): a line hopped a line eight points from where a
// weightier line hopped it, the two arcs one knot.
test("hops on crossing lines keep a hop's radius between them", () => {
	const result = bridged(
		drawing(
			[
				across(50, 0, 150),
				down(50),
				// Turns six below the crossing: it cannot rise, but a hop passes over it.
				[
					{ x: 72, y: 0 },
					{ x: 72, y: 64 },
					{ x: 150, y: 64 },
				],
			],
			[{}, { emphasis: "hero" }, {}],
		),
	);
	expect(result.bridges.filter(hops)).toMatchObject([{ edgeId: "1" }]);
});
