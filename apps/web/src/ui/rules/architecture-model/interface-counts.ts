import { interfaceMeasures } from "@archboard/board/container-interface";
import type { ModuleInterface } from "#ui/rules/architecture-model/selected-subject.ts";
import type { Wiring } from "#ui/rules/semantic-board-canvas/board/connections.ts";

type Interface = Extract<ModuleInterface, { readonly holdsParts: true }>;
type Parents = ReadonlyMap<string, string | undefined>;

/** One count of a module's interface, and what it selects on the module's own picture. */
interface InterfaceCount {
	readonly key: string;
	readonly count: number;
	/** What the count counts, in words. */
	readonly label: string;
	readonly subjects: readonly string[];
}

/**
 * The cards that stand for parts outside a module on its picture: each part's own card, or the
 * door that holds it. The picture draws a door one step below the path to the module.
 * @param parents What holds each module.
 * @param module The module.
 * @param parts The parts outside it.
 * @returns Each card once.
 */
function doorsOf(parents: Parents, module: string, parts: readonly string[]): readonly string[] {
	const trail = new Set<string>();
	for (let at: string | undefined = module; at !== undefined; at = parents.get(at)) trail.add(at);
	return [
		...new Set(
			parts.map((part) => {
				let at = part;
				for (let up = parents.get(at); up !== undefined && !trail.has(up); up = parents.get(at)) {
					at = up;
				}
				return at;
			}),
		),
	];
}

/**
 * What the column says of a module's interface. Each count stands alone, because nothing adds them
 * up, and a pass-through reads like the others, because it is a question and not a fault (ADR 0044).
 * A relationship that ends on the module itself names no part, so it makes a caller and no entry
 * point. Its count says so, and only for a module that has such a caller.
 * @param inspection The module's interface.
 * @param nodes Every module of the selected state.
 * @returns The counts, in the order a reader asks.
 */
function interfaceCounts(inspection: Interface, nodes: Wiring["nodes"]): readonly InterfaceCount[] {
	const { container, entryPoints, hiddenParts, callers, onContainer, passThrough } = inspection;
	const measures = interfaceMeasures(inspection);
	const parents = new Map(nodes.map(({ id, parent }) => [id, parent]));
	const whole = [...new Set(onContainer.map((edge) => edge.from))];
	const callerIds = callers.map(({ node }) => node.id);
	const counts = [
		{
			key: "entryPoints",
			count: measures.entryPoints,
			label: measures.entryPoints === 1 ? "entry" : "entries",
			subjects: entryPoints.map(({ node }) => node.id),
		},
		{
			key: "hiddenParts",
			count: measures.hiddenParts,
			label: "hidden",
			subjects: hiddenParts.map(({ id }) => id),
		},
		{
			key: "callers",
			count: measures.callers,
			label: measures.callers === 1 ? "caller" : "callers",
			subjects: doorsOf(parents, container.id, callerIds),
		},
		{
			key: "wholeModule",
			count: whole.length,
			label: "to module",
			subjects: doorsOf(parents, container.id, whole),
		},
		{
			key: "passThrough",
			count: measures.passThrough,
			label: "pass-through",
			subjects: passThrough.map(({ id }) => id),
		},
	];
	return counts.filter(({ key, count }) => key !== "wholeModule" || count > 0);
}

export { interfaceCounts, type Interface, type InterfaceCount };
