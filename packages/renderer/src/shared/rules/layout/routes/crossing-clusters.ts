// Crossings along one line close enough that hops on it would touch are one
// cluster: they are settled together, so a line rises over all of them or
// none, and hops along one bundle layer the same way (`crossings.ts`).
import { BRIDGE_CLEARANCE, BRIDGE_RADIUS } from "#shared/constants/spacing.ts";
import {
	along,
	type DrawnCrossing,
	type Line,
	type Run,
} from "#shared/rules/layout/routes/drawn-lines.ts";

/** How close two crossings along one line are for hops on it to touch: one cluster. */
const CLUSTER_REACH = (BRIDGE_RADIUS + BRIDGE_CLEARANCE) * 2;

/** Crossings along one run close enough that hops on it would touch. */
interface Cluster {
	readonly run: Run;
	/** Which of each crossing's lines the run draws: the line across, or the line down. */
	readonly side: 0 | 1;
	readonly crossings: readonly DrawnCrossing[];
}

/**
 * A crossing's line along a cluster, and the other.
 * @param cluster The cluster.
 * @param crossing A crossing of it.
 * @returns The cluster's line there and the line crossing it.
 */
function sidesOf(cluster: Cluster, crossing: DrawnCrossing): readonly [Line, Line] {
	return [crossing.lines[cluster.side], crossing.lines[1 - cluster.side]!];
}

/**
 * Where a crossing lies along a run.
 * @param run The run.
 * @param crossing A crossing on it.
 * @returns The distance from the run's start.
 */
function atOn(run: Run, crossing: DrawnCrossing): number {
	return along(run, crossing.point[run.axis]);
}

/**
 * Crossings along one run, in order, split where hops on it would not touch.
 * @param run The run.
 * @param crossings Its crossings.
 * @returns The groups.
 */
function groupsAlong(run: Run, crossings: readonly DrawnCrossing[]): DrawnCrossing[][] {
	const groups: DrawnCrossing[][] = [];
	let previous: number | undefined;
	for (const crossing of crossings.toSorted((a, b) => atOn(run, a) - atOn(run, b))) {
		const at = atOn(run, crossing);
		if (previous === undefined || at - previous > CLUSTER_REACH) groups.push([]);
		groups.at(-1)!.push(crossing);
		previous = at;
	}
	return groups;
}

/**
 * The clusters along every run, and each crossing's cluster along each of
 * its lines.
 * @param crossings Every crossing.
 * @returns The clusters, and each crossing's two, the one across first.
 */
function clustersOf(
	crossings: readonly DrawnCrossing[],
): readonly [Cluster[], Map<DrawnCrossing, [Cluster, Cluster]>] {
	const clusters = ([0, 1] as const).flatMap((side) => {
		const runs = [...new Set(crossings.map((crossing) => crossing.lines[side].drawer))];
		return runs.flatMap((run) => {
			const on = crossings.filter((crossing) => crossing.lines[side].drawer === run);
			return groupsAlong(run, on).map((group) => ({ run, side, crossings: group }));
		});
	});
	const of = new Map<DrawnCrossing, [Cluster, Cluster]>();
	for (const cluster of clusters) {
		for (const crossing of cluster.crossings) {
			const both = of.get(crossing) ?? [cluster, cluster];
			both[cluster.side] = cluster;
			of.set(crossing, both);
		}
	}
	return [clusters, of];
}

export { atOn, clustersOf, sidesOf, type Cluster };
