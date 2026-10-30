// The lines a reading draws.
//
// One line joins a pair of drawn parts, with an arrow at each end when its
// relationships run both ways. A door's line ends on the part that owns it. The
// lines of several parts to one door share a trunk, and they keep their words in
// their tips. Above a budget, a line that other drawn lines imply leaves the
// picture, and the reading says how many left.

import type { ChangeKind } from "#shared/rules/compare/variants.ts";
import { overviewLines, type DrawnEdge, type OverviewLine } from "#shared/rules/scope.ts";
import type { VariantContent } from "#shared/schemas/content.ts";

type Standing = Readonly<Record<string, ChangeKind>>;
type Edge = VariantContent["edges"][number];
type Node = VariantContent["nodes"][number];

/** Above this many lines, a picture drops the lines that its longer paths imply. */
const LINE_BUDGET = 18;

/** From this many lines of one kind to one door, each way, the lines share a trunk (rule 5). */
const BUS_LINES = 3;

/**
 * The visible modules at a relationship's two ends.
 * @param edge The relationship.
 * @param drawnAs The visible representative of each endpoint.
 * @returns Both ends.
 */
function drawnEnds(edge: Edge, drawnAs: ReadonlyMap<string, string>): readonly [string, string] {
	return [drawnAs.get(edge.from) ?? edge.from, drawnAs.get(edge.to) ?? edge.to];
}

/**
 * The lines that share a trunk to a door, which draw no words of their own.
 * @param lines The drawn lines.
 * @param doors The doors of the reading.
 * @returns The lines on a trunk.
 */
function busLines(lines: readonly OverviewLine[], doors: ReadonlySet<string>): Set<OverviewLine> {
	const trunks = new Map<string, OverviewLine[]>();
	for (const connection of lines) {
		const { from, to, kind, twoWay } = connection.line;
		if (doors.has(from) === doors.has(to)) continue;
		const key = [doors.has(from) ? `from ${from}` : `to ${to}`, kind, twoWay ?? false].join();
		trunks.set(key, [...(trunks.get(key) ?? []), connection]);
	}
	return new Set([...trunks.values()].filter((held) => held.length >= BUS_LINES).flat());
}

/**
 * One line joins a pair of drawn parts, and distinct comparison states stay separate lines.
 * @param complete The full model content.
 * @param edges Relationships included by this reading.
 * @param endsOf Where each relationship's line runs.
 * @param open Containers whose authored self-connections remain visible.
 * @param standing Exact comparison states.
 * @returns Every drawn line with all original relationships.
 */
function joinedLines(
	complete: VariantContent,
	edges: readonly Edge[],
	endsOf: (edge: Edge) => readonly [string, string],
	open: ReadonlySet<string>,
	standing: Standing,
): OverviewLine[] {
	const groups = new Map<string, Edge[]>();
	for (const edge of edges) {
		const key = standing[edge.id] ?? "unchanged";
		groups.set(key, [...(groups.get(key) ?? []), edge]);
	}
	return [...groups.values()]
		.flatMap((group) => overviewLines({ ...complete, edges: group }, open, endsOf))
		.toSorted((one, other) => one.line.order - other.line.order);
}

/**
 * What a reading draws, what it lists, and what it states as left out.
 * @param listed Every line of the reading.
 * @param parts The modules whose lines can leave the picture.
 * @param standing Exact comparison states.
 * @param everyLine Whether every line stays drawn.
 * @returns The drawn lines, the listed lines and the lines that their paths imply.
 */
function readingLines(
	listed: readonly OverviewLine[],
	parts: readonly Node[],
	standing: Standing,
	everyLine: boolean | undefined,
) {
	const implied = impliedLines(listed, new Set(parts.map((node) => node.id)), standing);
	const gone = new Set(implied);
	return {
		connections: everyLine === true ? listed : listed.filter((line) => !gone.has(line)),
		listed,
		implied,
	};
}

/**
 * Whether a line runs between two different parts of the reading.
 * @param connection The line.
 * @param parts The modules whose lines can leave the picture.
 * @returns Whether it does.
 */
function joinsParts(connection: OverviewLine, parts: ReadonlySet<string>): boolean {
	const { from, to } = connection.line;
	return from !== to && parts.has(from) && parts.has(to);
}

/**
 * Above the budget, a line between two parts leaves the picture if other drawn lines still join
 * its ends, each way that it runs. The weakest line goes first, so the result is deterministic, and
 * a path needs a line out of one end and a line into the other, so no connected part loses its last
 * line (rule 6). A changed line is what a comparison shows, and a removed line carries no path.
 * @param lines Every line of the reading.
 * @param parts The modules whose lines can leave the picture.
 * @param standing Exact comparison states.
 * @returns The lines that leave.
 */
function impliedLines(
	lines: readonly OverviewLine[],
	parts: ReadonlySet<string>,
	standing: Standing,
): OverviewLine[] {
	if (lines.length <= LINE_BUDGET) return [];
	const live = new Set(lines.filter((line) => joinsParts(line, parts)));
	const weakestFirst = [...live]
		.filter(({ line }) => standing[line.id] === undefined)
		.toSorted(
			(one, other) => one.joins.length - other.joins.length || other.line.order - one.line.order,
		);
	const gone = weakestFirst.filter((candidate) => {
		live.delete(candidate);
		const leaves = stillJoined([...live], standing, candidate.line);
		if (!leaves) live.add(candidate);
		return leaves;
	});
	return gone;
}

/**
 * Whether other lines still say what a line says: a two-way line needs a path each way.
 * @param lines The lines to follow.
 * @param standing Exact comparison states.
 * @param line The line that would leave.
 * @returns Whether its ends stay joined.
 */
function stillJoined(lines: readonly OverviewLine[], standing: Standing, line: DrawnEdge): boolean {
	const { from, to, twoWay } = line;
	return (
		reaches(lines, standing, line) &&
		(twoWay !== true || reaches(lines, standing, { from: to, to: from }))
	);
}

/**
 * Whether drawn lines lead from one end of a line to the other. A two-way line leads both ways.
 * @param lines The lines to follow.
 * @param standing Exact comparison states.
 * @param ends The two ends.
 * @param ends.from Where to start.
 * @param ends.to Where to arrive.
 * @returns Whether a path exists.
 */
function reaches(
	lines: readonly OverviewLine[],
	standing: Standing,
	ends: Pick<Edge, "from" | "to">,
): boolean {
	const paths = lines.filter(({ line }) => standing[line.id] !== "removed");
	const seen = new Set([ends.from]);
	for (const at of seen) {
		for (const { line } of paths) {
			if (line.from === at) seen.add(line.to);
			if (line.twoWay === true && line.to === at) seen.add(line.from);
		}
	}
	return seen.has(ends.to);
}

export { busLines, drawnEnds, joinedLines, readingLines };
