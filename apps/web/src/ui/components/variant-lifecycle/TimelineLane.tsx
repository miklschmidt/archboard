// The lines of one variant's row in a timeline: the main line and the branches
// that pass it, the line into and out of its own mark, and the elbow by which
// a branch leaves the line it comes off. Laid behind the row, leaving a gap
// round each mark, so the marks read as stations on the line. The navigator
// draws it compactly and the About page roomily, from one geometry.

import type { CSSProperties, JSX } from "react";

import type { Lane } from "#ui/rules/variant-lifecycle/timeline.ts";

/** Where a row's columns are. */
interface LaneGeometry {
	/** From the row's left edge to the middle of the main line's mark. */
	readonly origin: number;
	/** How far right each depth's column is from the one before. */
	readonly step: number;
	/** From the row's top to the middle of its mark. */
	readonly middle: number;
	/** How far the line stops short of a mark's middle. */
	readonly clearance: number;
}

/** The line's own look: one pixel, the quiet ink of the tree's guides, a step stronger. */
const LINE = "bg-muted-foreground/40 pointer-events-none absolute";

/**
 * A row's lane.
 * @param props The lane and the row's geometry.
 * @param props.lane What the row draws.
 * @param props.geometry Where its columns are.
 * @returns The lines.
 */
function TimelineLane(props: {
	readonly lane: Lane;
	readonly geometry: LaneGeometry;
}): JSX.Element {
	const { lane, geometry } = props;
	/**
	 * Where a depth's column is.
	 * @param depth The depth.
	 * @returns Its distance from the row's left edge.
	 */
	const x = (depth: number): number => geometry.origin + depth * geometry.step;
	const own = x(lane.depth);
	const pieces: { readonly key: string; readonly style: CSSProperties }[] = lane.through.map(
		(depth) => ({
			key: `through-${depth}`,
			style: { left: x(depth), top: 0, bottom: 0, width: 1 },
		}),
	);
	if (lane.above) {
		pieces.push({
			key: "above",
			style: { left: own, top: 0, height: geometry.middle - geometry.clearance, width: 1 },
		});
	}
	if (lane.below) {
		pieces.push({
			key: "below",
			style: { left: own, top: geometry.middle + geometry.clearance, bottom: 0, width: 1 },
		});
	}
	if (lane.from !== null) {
		const from = x(lane.from);
		pieces.push(
			{ key: "elbow-down", style: { left: from, top: 0, height: geometry.middle + 1, width: 1 } },
			{
				key: "elbow-across",
				style: {
					left: from,
					top: geometry.middle,
					width: own - from - geometry.clearance,
					height: 1,
				},
			},
		);
	}
	return (
		<>
			{pieces.map((piece) => (
				<span
					key={piece.key}
					aria-hidden="true"
					data-slot="timeline-line"
					className={LINE}
					style={piece.style}
				/>
			))}
		</>
	);
}

export { TimelineLane, type LaneGeometry };
