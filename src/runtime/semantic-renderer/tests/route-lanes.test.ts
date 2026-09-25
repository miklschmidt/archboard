import { expect, test } from "bun:test";
import type { ElkPoint as Point } from "@archboard/elk-rs";
import { instance } from "@viz-js/viz";
import { AvoidLib } from "libavoid-js";
import { createLayoutEngine } from "@/transformers/semantic-renderer/engine";

const loaded = AvoidLib.load();

/** One straight run of a route. */
interface Run {
	readonly vertical: boolean;
	/** Where it lies across its axis. */
	readonly at: number;
	readonly from: number;
	readonly to: number;
}

/**
 * The Graphviz engine with its placement fixed, so the real router alone decides.
 * @param objects Each card's Graphviz centre.
 * @param bb The Graphviz bounds.
 * @returns The engine.
 */
async function fixedEngine(objects: { name: string; pos: string }[], bb: string) {
	const viz = await instance();
	await loaded;
	return createLayoutEngine(
		Object.assign(viz, { renderJSON: () => ({ bb, objects }) }),
		AvoidLib.getInstance(),
	);
}

/**
 * Route one graph of cards on a fixed placement.
 * @param cards Each card's id, Graphviz centre and size.
 * @param edges Each relationship's id, source and target.
 * @param bb The Graphviz bounds.
 * @returns Each relationship's runs.
 */
async function routedRuns(
	cards: { id: string; pos: string; width: number; height: number }[],
	edges: [string, string, string][],
	bb: string,
): Promise<Map<string, Run[]>> {
	const solve = await fixedEngine(
		cards.map(({ id, pos }) => ({ name: id, pos })),
		bb,
	);
	const routed = solve(
		{
			id: "root",
			children: cards.map(({ id, width, height }) => ({ id, width, height })),
			edges: edges.map(([id, source, target]) => ({ id, sources: [source], targets: [target] })),
		},
		{},
	);
	return new Map(
		routed.edges!.map((edge) => {
			const section = edge.sections![0]!;
			return [
				edge.id,
				runsOf([section.startPoint, ...(section.bendPoints ?? []), section.endPoint]),
			];
		}),
	);
}

/**
 * Every run of a route.
 * @param points The route's corners.
 * @returns Its runs.
 */
function runsOf(points: readonly Point[]): Run[] {
	return points.slice(1).map((point, index) => {
		const previous = points[index]!;
		const vertical = Math.abs(point.x - previous.x) < 0.01;
		const [along, across] = vertical ? (["y", "x"] as const) : (["x", "y"] as const);
		return {
			vertical,
			at: point[across],
			from: Math.min(point[along], previous[along]),
			to: Math.max(point[along], previous[along]),
		};
	});
}

/**
 * How far apart two routes' parallel runs lie wherever they run side by side for a lane.
 * @param one A route's runs.
 * @param other Another route's runs.
 * @returns The gaps.
 */
function besideGaps(one: readonly Run[], other: readonly Run[]): number[] {
	return one.flatMap((run) =>
		other
			.filter(
				(next) =>
					next.vertical === run.vertical &&
					Math.min(run.to, next.to) - Math.max(run.from, next.from) >= 16,
			)
			.map((next) => Math.abs(run.at - next.at)),
	);
}

test("two lines sharing an open corridor run a whole lane apart", async () => {
	// Both lines pass the wall's open end, the one corridor between the rows.
	const card = { width: 100, height: 40 };
	const routes = await routedRuns(
		[
			{ id: "west1", pos: "300,30", ...card },
			{ id: "west2", pos: "420,30", ...card },
			{ id: "wall", pos: "250,250", width: 500, height: 100 },
			{ id: "east1", pos: "380,470", ...card },
			{ id: "east2", pos: "260,470", ...card },
		],
		[
			["upper", "west1", "east1"],
			["lower", "west2", "east2"],
		],
		"0,0,620,500",
	);
	const gaps = besideGaps(routes.get("upper")!, routes.get("lower")!).filter((gap) => gap < 100);
	expect(gaps.length).toBeGreaterThan(0);
	for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(16 - 0.01);
});

test("two unrelated lines into facing sides of one row do not share a track", async () => {
	const card = { width: 340, height: 88 };
	const routes = await routedRuns(
		[
			{ id: "browser", pos: "575,76", ...card },
			{ id: "bun", pos: "957,76", ...card },
			{ id: "canvas", pos: "575,303", ...card },
			{ id: "renderer", pos: "1242,303", ...card },
		],
		[
			["install", "browser", "renderer"],
			["offscreen", "bun", "canvas"],
		],
		"0,0,1440,370",
	);
	const gaps = besideGaps(routes.get("install")!, routes.get("offscreen")!);
	expect(gaps.filter((gap) => gap <= 2)).toEqual([]);
});
