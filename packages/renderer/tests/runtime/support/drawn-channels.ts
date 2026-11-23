// Empty track bands: room in a channel between the cards that no line runs across. Two level
// runs in one channel, one above the other, with more than a lane between them and no card or
// frame edge between them, leave the lanes between them empty.

import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { runsOf } from "#tests/runtime/support/drawn-ink.ts";

/** How far apart the lanes of a channel stand: the router's lane. */
const LANE = 16;

/** One level run: its height and the stretch it spans. */
interface Level {
	readonly y: number;
	readonly from: number;
	readonly to: number;
}

/**
 * The level runs of a drawing longer than a lane: what a reader sees cross a channel.
 * @param drawing The rendered document.
 * @returns The runs, highest first.
 */
function levelsOf(drawing: Pick<RenderedDiagram, "svg">): Level[] {
	return runsOf(drawing)
		.filter(([from, to]) => from.y === to.y && Math.abs(to.x - from.x) > LANE)
		.map(([from, to]) => ({ y: from.y, from: Math.min(from.x, to.x), to: Math.max(from.x, to.x) }))
		.sort((one, other) => one.y - other.y);
}

/**
 * The empty track bands of a drawing: for each level run, the run nearest below it that spans
 * some of the same stretch with no card or frame edge between them, and every whole lane
 * between the two that no level run uses.
 * @param drawing The rendered document.
 * @returns Each band, by the height of its top.
 */
function emptyTrackBands(drawing: Pick<RenderedDiagram, "svg" | "atlas">): number[] {
	const levels = levelsOf(drawing);
	const edges = Object.values(drawing.atlas.nodes).flatMap((box) => [box.y, box.y + box.height]);
	const used = new Set(levels.map((level) => Math.round(level.y)));
	const bands = new Set<number>();
	for (const [index, level] of levels.entries()) {
		const below = levels
			.slice(index + 1)
			.find((other) => other.y > level.y + 0.5 && other.from < level.to && level.from < other.to);
		if (below === undefined || below.y - level.y < 2 * LANE - 0.5) continue;
		if (edges.some((edge) => edge > level.y && edge < below.y)) continue;
		for (let y = level.y + LANE; y <= below.y - LANE + 0.5; y += LANE) {
			const taken = [...used].some((at) => Math.abs(at - y) < LANE / 2);
			if (!taken) bands.add(Math.round(y));
		}
	}
	return [...bands].sort((one, other) => one - other);
}

export { emptyTrackBands };
