import { DEFAULT_SHAPE_BACKGROUND } from "@/shared/appearance/appearance";
import type { ServerElement } from "@/runtime/engine/types";
import { CLUSTER_GAP, regionName } from "@/runtime/engine/layout";
import {
	KIND_ORDER,
	UNTYPED,
	counts,
	hasText,
	pairs,
	renderCounts,
} from "@/runtime/engine/lib/describe-scene-model";
import type {
	DeepReadonly,
	Edge,
	Folded,
	Item,
	NodeFold,
} from "@/runtime/engine/lib/describe-scene-model";

type SceneItem = DeepReadonly<Item>;
type SceneEdge = DeepReadonly<Edge>;

interface SceneBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

/**
 * What the scene is made of, in numbers: how many of each thing, what kinds
 * of node, and the box they all sit in.
 * @param args The scene as the description read it.
 * @returns The lines.
 */
function appendStats(args: DeepReadonly<SceneStats>): readonly string[] {
	const { allElements, nodes, typeCounts, box } = args;
	const lines = [`Total elements: ${allElements.length} (${compositionOf(args).join(", ")})`];
	if (nodes.length > 0) {
		lines.push(`Kinds: ${renderCounts(args.kindCounts, KIND_ORDER)}`, semanticLine(args));
	}
	lines.push(
		`Types: ${renderCounts(typeCounts)}`,
		`Bounding box: (${Math.round(box.minX)}, ${Math.round(box.minY)}) to (${Math.round(box.maxX)}, ${Math.round(box.maxY)}) = ${Math.round(box.maxX - box.minX)}x${Math.round(box.maxY - box.minY)}`,
	);
	return lines;
}

/** Everything the numbers at the top of a description are counted from. */
interface SceneStats {
	allElements: ServerElement[];
	nodes: SceneItem[];
	edges: SceneEdge[];
	others: SceneItem[];
	folded: Folded;
	nodeFold: NodeFold;
	kindCounts: Record<string, number>;
	variantCounts: Record<string, number>;
	levelCounts: Record<string, number>;
	typeCounts: Record<string, number>;
	boundNodes: number;
	box: SceneBox;
}

/**
 * How many of each thing the scene holds, including what was folded away so
 * the total adds up.
 * @param args The scene as the description read it.
 * @returns The parts of the composition line.
 */
function compositionOf(args: DeepReadonly<SceneStats>): string[] {
	const composition = [
		plural(args.nodes.length, "node"),
		plural(args.edges.length, "edge"),
		`${args.others.length} plain`,
	];
	if (args.folded.hidden.size > 0) {
		composition.push(`${plural(args.folded.hidden.size, "bound label")} folded in`);
	}
	if (args.nodeFold.hidden > 0) {
		composition.push(`${plural(args.nodeFold.hidden, "node member")} folded in`);
	}
	return composition;
}

/**
 * What the nodes mean: which variants and levels they claim, and how many of
 * them reach code.
 * @param args The scene as the description read it.
 * @returns The line.
 */
function semanticLine(args: DeepReadonly<SceneStats>): string {
	const semantic: string[] = [];
	if (Object.keys(args.variantCounts).length > 0) {
		semantic.push(`Variants: ${renderCounts(args.variantCounts, ["current"])}`);
	}
	if (Object.keys(args.levelCounts).length > 0) {
		semantic.push(`Levels: ${renderCounts(args.levelCounts)}`);
	}
	semantic.push(`Bindings: ${args.boundNodes}/${args.nodes.length} bound to code`);
	return semantic.join(" | ");
}

/**
 * What the graph looks like: which nodes everything hangs off, and which
 * nodes nothing reaches.
 * @param nodes The scene's nodes.
 * @param edges Its connectors.
 * @param degree How many connectors reach each node.
 * @returns The lines, which are none on a scene too small to say this about.
 */
function appendGraphNotes(
	nodes: readonly SceneItem[],
	edges: readonly SceneEdge[],
	degree: ReadonlyMap<string, DeepReadonly<{ in: number; out: number }>>,
): readonly string[] {
	const lines: string[] = [];
	const busiest = edges.length >= 3 ? mostConnected(nodes, degree) : "";
	if (busiest !== "") {
		lines.push(busiest);
	}
	const isolated = nodes.filter((n) => !degree.has(n.el.id));
	if (isolated.length > 0 && edges.length > 0) {
		lines.push(`Unconnected nodes (${isolated.length}): ${namesOf(isolated, 8)}`);
	}
	return lines;
}

/**
 * The three busiest nodes, when any of them carries three connectors.
 * @param nodes The scene's nodes.
 * @param degree How many connectors reach each node.
 * @returns The line, or "" when nothing is busy enough to name.
 */
function mostConnected(
	nodes: readonly SceneItem[],
	degree: ReadonlyMap<string, DeepReadonly<{ in: number; out: number }>>,
): string {
	const ranked = nodes
		.map((n) => ({ n, d: degree.get(n.el.id) ?? { in: 0, out: 0 } }))
		.filter((r) => r.d.in + r.d.out >= 3)
		.toSorted((a, b) => b.d.in + b.d.out - (a.d.in + a.d.out))
		.slice(0, 3);
	if (ranked.length === 0) {
		return "";
	}
	return `Most connected: ${ranked.map((r) => `${r.n.name} (${r.d.in} in, ${r.d.out} out)`).join(", ")}`;
}

/**
 * Some items by name, cut short with an ellipsis past a limit.
 * @param items The items.
 * @param limit How many to name.
 * @returns The names.
 */
function namesOf(items: readonly SceneItem[], limit: number): string {
	const shown = items
		.slice(0, limit)
		.map((i) => i.name)
		.join(", ");
	return `${shown}${items.length > limit ? ", …" : ""}`;
}

/**
 * Which nodes sit together, named by whereabouts on the board they are.
 * @param realClusters The clusters of more than one node.
 * @param clusters Every cluster, including the nodes on their own.
 * @param box The box the whole scene sits in, which the regions are thirds of.
 * @returns The lines, which are none when there is only one cluster.
 */
function appendClusters(
	realClusters: readonly (readonly SceneItem[])[],
	clusters: readonly (readonly SceneItem[])[],
	box: SceneBox,
): readonly string[] {
	const lines: string[] = [];
	if (realClusters.length <= 1) {
		return lines;
	}
	lines.push("", `### Clusters (nodes within ${CLUSTER_GAP}px of each other)`);
	for (const cluster of realClusters.slice(0, 12)) {
		const cx = cluster.reduce((sum, n) => sum + n.x + n.w / 2, 0) / cluster.length;
		const cy = cluster.reduce((sum, n) => sum + n.y + n.h / 2, 0) / cluster.length;
		const kinds = renderCounts(counts(cluster.map((n) => n.meta.kind ?? UNTYPED)), KIND_ORDER);
		const names = cluster
			.slice(0, 8)
			.map((n) => n.name)
			.join(", ");
		lines.push(
			`  ${regionName(cx, cy, box)} (${cluster.length}): ${names}${cluster.length > 8 ? ", …" : ""} — ${kinds}`,
		);
	}
	const loose = clusters.filter((cluster) => cluster.length === 1);
	if (loose.length > 0) {
		lines.push(
			`  on their own (${loose.length}): ${loose
				.slice(0, 8)
				.map((cluster) => cluster[0]?.name ?? "unnamed")
				.join(", ")}${loose.length > 8 ? ", …" : ""}`,
		);
	}
	return lines;
}

/**
 * Where one item is and how big it is, in whole pixels.
 * @param i The item.
 * @returns The phrase.
 */
function geometry(i: SceneItem): string {
	const parts = [`at (${Math.round(i.x)}, ${Math.round(i.y)})`];
	if (i.w || i.h) {
		parts.push(`size ${Math.round(i.w)}x${Math.round(i.h)}`);
	}
	return parts.join(" | ");
}

/**
 * One node as a line of the description.
 * @param n The node.
 * @param showLevel Whether the scene has levels worth naming.
 * @returns The line.
 */
function nodeLine(n: SceneItem, showLevel: boolean): string {
	// Node identity leads: it is the join key across variants and boards, and
	// the only handle that survives a redraw.
	const parts = [`${hasText(n.meta.node) ? `<${n.meta.node}>` : `[${n.el.id}]`} "${n.name}"`];
	if (hasText(n.meta.node)) {
		parts.push(`element ${n.el.id}${n.members > 1 ? ` +${n.members - 1} more` : ""}`);
	}
	parts.push(...nodeIdentity(n, showLevel), geometry(n), n.el.type);
	if (n.el.locked) {
		parts.push("(locked)");
	}
	return parts.join(" | ");
}

/**
 * What a node claims to be: its declared name where that has diverged from
 * its label, what it binds to, and which variant and level it says it is.
 * @param n The node.
 * @param showLevel Whether the scene has levels worth naming.
 * @returns The parts of the line.
 */
function nodeIdentity(n: SceneItem, showLevel: boolean): string[] {
	return [
		...worded("declared", divergedName(n), true),
		hasText(n.meta.binding) ? `bound ${n.meta.binding}` : "unbound",
		...worded("variant", statedVariant(n)),
		...worded("level", showLevel ? n.meta.level : undefined),
	];
}

/**
 * The variant a node claims, where it claims one worth saying: everything on
 * a current board says "current", which is not news.
 * @param n The node.
 * @returns The variant, or undefined.
 */
function statedVariant(n: SceneItem): string | undefined {
	if (!hasText(n.meta.variant) || n.meta.variant === "current") {
		return undefined;
	}
	return n.meta.variant;
}

/**
 * One labelled part of a line, said only where the value is there to say.
 * @param label What the value is called.
 * @param value The value.
 * @param quoted Whether the value is a name, which reads in quotes.
 * @returns The part, or none.
 */
function worded(label: string, value: string | undefined, quoted = false): string[] {
	if (!hasText(value)) {
		return [];
	}
	return [quoted ? `${label} "${value}"` : `${label} ${value}`];
}

/**
 * A node's declared name, when it says something its label does not.
 *
 * The label is what the board shows and what a human points at; a declared
 * name only earns a mention when the two have diverged.
 * @param n The node.
 * @returns The name, or undefined.
 */
function divergedName(n: SceneItem): string | undefined {
	if (!hasText(n.meta.name) || !hasText(n.labelText)) {
		return undefined;
	}
	return n.meta.name === n.labelText ? undefined : n.meta.name;
}

/**
 * What a node carries beyond what its main line already said.
 * @param n The node.
 * @returns The second line, or "" when there is nothing more to say.
 */
function nodeExtras(n: SceneItem): string {
	const parts: string[] = [];
	const { link } = n.el;
	if (hasText(link) && !echoesBinding(n, link)) {
		parts.push(`link ${link}`);
	}
	if (Object.keys(n.meta.extra).length > 0) {
		parts.push(pairs(n.meta.extra));
	}
	if (Object.keys(n.meta.foreign).length > 0) {
		parts.push(`other customData: ${pairs(n.meta.foreign)}`);
	}
	if (n.el.groupIds.length > 0) {
		parts.push(`groups: [${n.el.groupIds.join(", ")}]`);
	}
	return parts.join(" | ");
}

/**
 * Whether a node's link only re-states what its binding already said: a
 * `file://` that repeats the bound path is noise on every node.
 * @param n The node.
 * @param link Its link.
 * @returns True when the link says nothing new.
 */
function echoesBinding(n: SceneItem, link: string): boolean {
	if (hasText(n.meta.binding) && link.includes(n.meta.binding)) {
		return true;
	}
	return hasText(n.meta.bindingPath) && link.endsWith(n.meta.bindingPath);
}

/**
 * One element nobody promoted, as a line of the description.
 * @param o The element.
 * @returns The line.
 */
function plainLine(o: SceneItem): string {
	const { el } = o;
	const parts = [`[${el.id}] ${el.type}`, geometry(o), ...wordsOn(o), ...coloursOf(o)];
	if (hasText(el.link)) {
		parts.push(`link: ${el.link}`);
	}
	if (Object.keys(o.meta.foreign).length > 0) {
		parts.push(`customData: ${pairs(o.meta.foreign)}`);
	}
	if (el.locked) {
		parts.push("(locked)");
	}
	if (el.groupIds.length > 0) {
		parts.push(`groups: [${el.groupIds.join(", ")}]`);
	}
	return parts.join(" | ");
}

/**
 * The words on one plain element: its own text, or the label bound to it.
 * @param o The element.
 * @returns The part of the line, or none.
 */
function wordsOn(o: SceneItem): string[] {
	const { el } = o;
	if (el.type === "text" && hasText(el.text)) {
		return [`text: "${el.text}"`];
	}
	return hasText(o.labelText) ? [`label: "${o.labelText}"`] : [];
}

/**
 * The colours on one plain element, where somebody chose them.
 *
 * The default fill is on nearly every shape now — it is what makes them
 * tappable — so printing it would add a column of noise to the agent's main
 * read path.
 * @param o The element.
 * @returns The parts of the line.
 */
function coloursOf(o: SceneItem): string[] {
	const { el } = o;
	const parts: string[] = [];
	if (isChosenBackground(el.backgroundColor)) {
		parts.push(`bg: ${el.backgroundColor}`);
	}
	if (hasText(el.strokeColor) && el.strokeColor !== "#000000") {
		parts.push(`stroke: ${el.strokeColor}`);
	}
	return parts;
}

/**
 * Whether a fill is one somebody picked rather than the default or none.
 * @param background The fill.
 * @returns True when it is worth a word.
 */
function isChosenBackground(background: string | undefined): boolean {
	if (!hasText(background) || background === "transparent") {
		return false;
	}
	return background.toLowerCase() !== DEFAULT_SHAPE_BACKGROUND;
}

// ---------------------------------------------------------------------------
// The one sentence an agent can speak verbatim
// ---------------------------------------------------------------------------

/**
 * A count and its noun, pluralised, with the one irregular noun a description
 * uses spelled out.
 * @param n How many.
 * @param word The singular noun.
 * @returns The phrase.
 */
function plural(n: number, word: string): string {
	const noun = word === "external" ? "external system" : word;
	if (n === 1) {
		return `1 ${noun}`;
	}
	return `${n} ${noun}${noun.endsWith("s") ? "" : "s"}`;
}

/**
 * Some phrases as a person would say them: commas, and "and" before the last.
 * @param parts The phrases.
 * @returns The list.
 */
function joinList(parts: readonly string[]): string {
	if (parts.length <= 1) {
		return parts[0] ?? "";
	}
	return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * The one sentence an agent can speak verbatim: what is on the board, how it
 * is arranged, and what is missing.
 * @param s The scene as the description counted it.
 * @returns The sentence.
 */
function summarise(s: DeepReadonly<SceneSummary>): string {
	if (s.nodes.length === 0) {
		return `no nodes yet — ${s.total} elements (${renderCounts(s.typeCounts)}). Nothing on this canvas carries archboard metadata.`;
	}
	const clauses = [joinList(kindClause(s.kindCounts))];
	if (s.clusters > 1) {
		clauses.push(`in ${s.clusters} clusters`);
	}
	clauses.push(
		s.edges.length > 0 ? `linked by ${plural(s.edges.length, "edge")}` : "with no edges drawn yet",
	);
	const notes = summaryNotes(s);
	return `${clauses.join(" ")}${notes.length > 0 ? `; ${joinList(notes)}` : ""}.`;
}

/** What the one-sentence summary is counted from. */
interface SceneSummary {
	nodes: SceneItem[];
	others: SceneItem[];
	edges: SceneEdge[];
	kindCounts: Record<string, number>;
	typeCounts: Record<string, number>;
	clusters: number;
	boundNodes: number;
	total: number;
}

/**
 * The kinds of node on the board, most interesting first and cut to six.
 * @param kindCounts How many nodes of each kind.
 * @returns The phrases, with a count of the kinds not named.
 */
function kindClause(kindCounts: DeepReadonly<Record<string, number>>): string[] {
	const ordered = Object.keys(kindCounts).toSorted(
		(a, b) => rankOf(a) - rankOf(b) || (kindCounts[b] ?? 0) - (kindCounts[a] ?? 0),
	);
	const shown = ordered.slice(0, 6).map((k) => plural(kindCounts[k] ?? 0, k));
	const hidden = ordered.length - 6;
	if (hidden > 0) {
		shown.push(hidden === 1 ? "1 other kind" : `${hidden} other kinds`);
	}
	return shown;
}

/**
 * Where one kind sits in the order a description names them; a kind nobody
 * named comes after the ones that are.
 * @param kind The kind.
 * @returns Its rank.
 */
function rankOf(kind: string): number {
	const at = KIND_ORDER.indexOf(kind);
	return at === -1 ? 1e6 : at;
}

/**
 * What the summary adds after the semicolon: the nodes that reach no code,
 * and the elements nobody promoted.
 * @param s The scene as the description counted it.
 * @returns The notes.
 */
function summaryNotes(s: DeepReadonly<SceneSummary>): string[] {
	const notes: string[] = [];
	const unbound = s.nodes.length - s.boundNodes;
	if (unbound > 0) {
		notes.push(`${unbound} unbound`);
	}
	if (s.others.length > 0) {
		notes.push(`${plural(s.others.length, "plain element")} alongside`);
	}
	return notes;
}

// ---------------------------------------------------------------------------
// Selection — what a human has picked on the board
// ---------------------------------------------------------------------------
//
// Same read-path discipline as the scene description: an agent has to be able
// to re-narrate this in one spoken sentence ("you've got the two payment
// services selected"), so `summary` comes first and the per-element lines are
// the same ones `describe` uses.

/**
 * What a human has picked, in one sentence an agent can speak verbatim.
 * @param items The selected elements the board still holds.
 * @param missing How many selected ids it no longer holds.
 * @returns The sentence.
 */
function selectionSummary(items: readonly SceneItem[], missing: number): string {
	if (items.length === 0 && missing === 0) {
		return "Nothing is selected on the board.";
	}
	const nodes = items.filter((i) => i.isNode);
	const plain = items.filter((i) => !i.isNode);
	const clauses = [
		...(nodes.length > 0 ? [nodeClause(nodes)] : []),
		...(plain.length > 0 ? [plainClause(plain)] : []),
		...missingClause(missing),
	];
	return `${plural(items.length + missing, "element")} selected: ${joinList(clauses)}.`;
}

/**
 * The selected ids the board no longer holds, where there are any.
 * @param missing How many.
 * @returns The clause, or none.
 */
function missingClause(missing: number): string[] {
	if (missing === 0) {
		return [];
	}
	return [`${missing} selected id${missing === 1 ? "" : "s"} not on the canvas`];
}

/**
 * The selected nodes, counted by kind and named.
 * @param nodes The nodes.
 * @returns The clause.
 */
function nodeClause(nodes: readonly SceneItem[]): string {
	const kinds = renderCounts(counts(nodes.map((n) => n.meta.kind ?? UNTYPED)), KIND_ORDER);
	return `${plural(nodes.length, "node")} (${kinds}) — ${namedList(nodes)}`;
}

/**
 * Some items by name, cut to six with a count of the rest.
 * @param list The items.
 * @returns The names.
 */
function namedList(list: readonly SceneItem[]): string {
	return (
		joinList(list.slice(0, 6).map((i) => `"${i.name}"`)) +
		(list.length > 6 ? `, and ${list.length - 6} more` : "")
	);
}

/**
 * The selected elements nobody promoted, named where they carry words.
 * @param plain The elements.
 * @returns The clause.
 */
function plainClause(plain: readonly SceneItem[]): string {
	const withLabel = plain.filter((p) => p.labelText);
	const detail = withLabel.length > 0 ? ` — ${namedList(withLabel)}` : "";
	const plainTypes = counts(plain.map((p) => p.el.type));
	return `${plural(plain.length, "plain element")} (${renderCounts(plainTypes)})${detail}`;
}

export {
	appendStats,
	appendGraphNotes,
	appendClusters,
	nodeLine,
	nodeExtras,
	plainLine,
	summarise,
	selectionSummary,
};
