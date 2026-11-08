// What a code finding is about, by the names of the reading (ADR 0046): the modules its evidence
// joins, the ends of the relationship it is about, or the one subject it names.

import type { CodeFinding } from "#ui/architecture-drawing/canvas/presentation/components/SemanticInspectorCode.tsx";

/** The modules and relationships of the whole reading, which a finding's route is named from. */
interface FindingEnds {
	readonly nodes: readonly { readonly id: string; readonly name: string }[];
	readonly edges: readonly { readonly id: string; readonly from: string; readonly to: string }[];
}

/** Where a finding leads: from the modules that make a use to the ones it reaches. */
interface FindingRoute {
	readonly from: string | null;
	readonly to: string;
}

/**
 * The names of the modules on one side of a finding's evidence, each once.
 * @param finding The finding.
 * @param side Which side: the modules that make a use, or those it reaches.
 * @param ends The modules of the reading.
 * @returns The names, or nothing when the evidence names no module on that side.
 */
function sideOf(finding: CodeFinding, side: "from" | "to", ends: FindingEnds): string {
	const ids = (finding.evidence ?? []).flatMap((piece) => piece[side] ?? []);
	return [...new Set(ids.map((id) => nameIn(ends, id)))].join(", ");
}

/**
 * What the reading calls a module.
 * @param ends The modules of the reading.
 * @param id The module.
 * @returns Its name, or its identity when the reading does not hold it.
 */
function nameIn(ends: FindingEnds, id: string): string {
	return ends.nodes.find((node) => node.id === id)?.name ?? id;
}

/**
 * The ends of the relationship a finding is about, by name.
 * @param finding The finding.
 * @param ends The modules and relationships of the reading.
 * @returns The two names, or empty names for a finding about anything else.
 */
function edgeOf(finding: CodeFinding, ends: FindingEnds): { from: string; to: string } {
	const { subject } = finding;
	const edge =
		subject?.kind === "edge" ? ends.edges.find((one) => one.id === subject.id) : undefined;
	if (edge === undefined) return { from: "", to: "" };
	return { from: nameIn(ends, edge.from), to: nameIn(ends, edge.to) };
}

/**
 * The route of a finding: the modules its evidence joins, the ends of the relationship it is about,
 * or the one subject it names. A route with one end, or with the same module at both, names it once.
 * @param finding The finding.
 * @param ends The modules and relationships of the reading.
 * @returns The route, or null for a finding on the whole model.
 */
function routeOf(finding: CodeFinding, ends: FindingEnds): FindingRoute | null {
	const edge = edgeOf(finding, ends);
	const from = firstOf(sideOf(finding, "from", ends), edge.from);
	const to = firstOf(sideOf(finding, "to", ends), edge.to, finding.subject?.name ?? "");
	return routeBetween(from, to);
}

/**
 * The first name that says something.
 * @param names The names, the best first.
 * @returns The first that is not empty, or an empty name.
 */
function firstOf(...names: readonly string[]): string {
	return names.find((name) => name !== "") ?? "";
}

/**
 * A route between two names, either of which can be missing.
 * @param from What makes the use, or an empty name.
 * @param to What it reaches, or an empty name.
 * @returns The route, which names a lone end or one module at both ends once, or null for none.
 */
function routeBetween(from: string, to: string): FindingRoute | null {
	const end = to || from;
	if (end === "") return null;
	return { from: from === "" || from === end ? null : from, to: end };
}

/**
 * A pass's findings in the order they are read: the warnings first, each severity in the pass's order.
 * @param findings The findings.
 * @returns The same findings, warnings first.
 */
function warningsFirst(findings: readonly CodeFinding[]): CodeFinding[] {
	return findings.toSorted(
		(one, other) => Number(one.severity !== "warning") - Number(other.severity !== "warning"),
	);
}

export { routeOf, warningsFirst, type FindingEnds, type FindingRoute };
