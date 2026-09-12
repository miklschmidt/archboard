// Laying out and routing with the track-pitch floor held.
//
// Forked from PR Lens's `layout/congestion.ts`, unchanged but for the names:
// a lane became a region, and band 0 — the gap under the region headers — is
// now an ordinary band that can be widened like any other.

import type { VariantContent } from "@/shared/semantic-board/index";
import {
	BAND_BOTTOM_PADDING,
	BAND_GAP,
	BAND_PADDING_X,
	HEAD_REACH,
	PILL_AIR,
	PILL_CLEARANCE,
	PILL_HEIGHT,
	ROW_GAP,
	TRACK_CLEARANCE,
	TRACK_PITCH_MIN,
} from "@/runtime/semantic-renderer/lib/design";
import type { Region } from "@/runtime/semantic-renderer/lib/regions";
import {
	layoutArchitecture,
	NO_EXPANSIONS,
	type ArchitectureLayout,
	type GapExpansions,
	type LayoutGrid,
} from "@/runtime/semantic-renderer/lib/layout/architecture";
import {
	channelTraffic,
	routeEdges,
	type ChannelTraffic,
	type RoutedEdge,
} from "@/runtime/semantic-renderer/lib/layout/edges";

const CORRIDOR_WIDTH = BAND_PADDING_X * 2 + BAND_GAP;

/** How many rounds of widening are allowed before the layout is taken as settled. */
const ROUNDS = 3;

/**
 * Room for this many tracks at the floor pitch plus clearance to the cards, and
 * never less than the pills crossing the gap need.
 * @param traffic How many runs the gap carries.
 * @param pills How many label pills stack in the gap's depth.
 * @returns The width the gap needs.
 */
function widthNeeded(traffic: number, pills: number): number {
	const lines = (traffic - 1) * TRACK_PITCH_MIN + TRACK_CLEARANCE * 2;
	return Math.max(lines, pillsNeeded(pills));
}

/**
 * How deep a gap must be for the pills crossing it: one pill and its clearance
 * per route, plus the arrowhead and clearance at each end, where no pill may
 * stand. Measured as a stack growing to one side, which is what it does when
 * the first pill takes the middle of the gap; a pill with nowhere left on its
 * line is drawn off it.
 * @param pills How many pills stack in the gap.
 * @returns The depth they need, or nothing when no pill crosses the gap.
 */
function pillsNeeded(pills: number): number {
	if (pills === 0) {
		return 0;
	}
	const step = PILL_HEIGHT + PILL_AIR;
	return 2 * ((pills - 1) * step + PILL_HEIGHT / 2 + PILL_CLEARANCE + HEAD_REACH);
}

/**
 * The extra width each corridor needs, where it needs any.
 * @param traffic How many runs each gap carries.
 * @returns The corridor expansions.
 */
function corridorExpansions(traffic: ChannelTraffic): Map<number, number> {
	const corridors = new Map<number, number>();
	for (const index of gapsIn(traffic.corridors, traffic.corridorPills)) {
		const extra =
			widthNeeded(traffic.corridors.get(index) ?? 0, traffic.corridorPills.get(index) ?? 0) -
			CORRIDOR_WIDTH;
		if (extra > 0) {
			corridors.set(index, extra);
		}
	}
	return corridors;
}

/**
 * The extra height each band needs, where it needs any.
 * @param traffic How many runs each gap carries.
 * @param grid The gaps of the layout, for how many rows there are.
 * @returns The band expansions.
 */
function bandExpansions(traffic: ChannelTraffic, grid: LayoutGrid): Map<number, number> {
	const bands = new Map<number, number>();
	for (const index of gapsIn(traffic.bands, traffic.bandPills)) {
		// The band after the last row is the sliver of band bottom padding. The
		// container chrome standing in a gap is deliberately not counted: it is
		// carved out of the gap rather than added to it, so the room a route has
		// is this constant however deeply the boxes nest there.
		const height = index === grid.rows.length ? BAND_BOTTOM_PADDING : ROW_GAP;
		const extra =
			widthNeeded(traffic.bands.get(index) ?? 0, traffic.bandPills.get(index) ?? 0) - height;
		if (extra > 0) {
			bands.set(index, extra);
		}
	}
	return bands;
}

/**
 * Every gap either count knows about.
 * @param lines How many runs each gap carries.
 * @param pills How many pills stack in each gap.
 * @returns The gap indices, each once.
 */
function gapsIn(lines: ReadonlyMap<number, number>, pills: ReadonlyMap<number, number>): number[] {
	return [...new Set([...lines.keys(), ...pills.keys()])];
}

/**
 * Whether two sets of gap expansions ask for the same thing.
 * @param a One set.
 * @param b The other.
 * @returns True when they agree.
 */
function sameExpansions(a: GapExpansions, b: GapExpansions): boolean {
	return sameEntries(a.corridors, b.corridors) && sameEntries(a.bands, b.bands);
}

/**
 * Whether two maps hold the same entries.
 * @param a One map.
 * @param b The other.
 * @returns True when they agree.
 */
function sameEntries(a: ReadonlyMap<number, number>, b: ReadonlyMap<number, number>): boolean {
	return a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
}

/**
 * Layout and routing with the pitch floor held: any gap whose traffic would
 * compress its tracks below the floor is widened to exactly what that traffic
 * needs, and the graph is laid out again around the wider gap.
 *
 * The extra room is a pure function of the traffic count, so one added route
 * moves the bands or rows beside a saturated gap by one pitch step — a small
 * change staying a small move — and an uncrowded document is laid out exactly
 * as if this pass did not exist.
 * @param regions The bands, in the order they are drawn.
 * @param content The architecture.
 * @returns The settled layout and its routes.
 */
function relieveCongestion(
	regions: readonly Region[],
	content: VariantContent,
): { layout: ArchitectureLayout; routed: readonly RoutedEdge[] } {
	let expansions: GapExpansions = NO_EXPANSIONS;
	let layout = layoutArchitecture(regions, content, expansions);

	// Widening never changes which gaps the routes choose — plans are made of
	// band and row indices, and cards keep their in-band positions — so the
	// second round sees the same traffic and settles. The bound is a backstop.
	for (let round = 0; round < ROUNDS; round += 1) {
		const traffic = channelTraffic(content.edges, layout);
		const needed: GapExpansions = {
			corridors: corridorExpansions(traffic),
			bands: bandExpansions(traffic, layout.grid),
		};
		if (sameExpansions(needed, expansions)) {
			break;
		}
		expansions = needed;
		layout = layoutArchitecture(regions, content, expansions);
	}

	return { layout, routed: routeEdges(content.edges, layout) };
}

export { relieveCongestion };
