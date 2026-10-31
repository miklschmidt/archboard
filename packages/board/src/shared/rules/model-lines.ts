// The lines a reading draws.
//
// One line joins a pair of drawn parts, with an arrow at each end when its
// relationships run both ways, and every relationship has a line. A door's line
// ends on the part that owns it, and wears its words beside that part.

import type { ChangeKind } from "#shared/rules/compare/variants.ts";
import { overviewLines, type OverviewLine } from "#shared/rules/scope.ts";
import type { VariantContent } from "#shared/schemas/content.ts";

type Standing = Readonly<Record<string, ChangeKind>>;
type Edge = VariantContent["edges"][number];

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

export { drawnEnds, joinedLines };
