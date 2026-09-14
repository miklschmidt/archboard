// What the viewer needs from a board that the picture does not carry.
//
// A drawing says what an architecture looks like. It deliberately does not say
// everything an architecture means: a node's description is not on its card,
// its code binding is not on its card, and the board one level down from it is
// not on its card either. All three are reached by inspecting, and all three
// come from the board itself.
//
// So this file reads the board document through the same contract the server
// and the CLI read it through (`@/shared/semantic-board`) and answers the three
// questions inspection asks. Nothing here writes: the browser never states
// anything about a semantic board (ADR 0023).

import {
	compareVariants,
	parseSemanticBoard,
	resolveVariant,
	standingOf,
	type ChangeKind,
	type FieldChange,
	type FlowStep,
	type SemanticBoard,
	type SemanticEdge,
	type SemanticFlow,
	type SemanticNode,
	type SemanticVariant,
	type SemanticWalkthrough,
	type VariantComparison,
	type VariantLifecycle,
} from "@/shared/semantic-board/index";

/** One node, with the containment around it. */
interface NodeSubject {
	/** Which sort of subject this is. */
	readonly kind: "node";
	/** The node. */
	readonly node: SemanticNode;
	/** The containers above it, outermost first. */
	readonly ancestry: readonly SemanticNode[];
	/** What it contains, in document order; empty for a node that contains nothing. */
	readonly holds: readonly SemanticNode[];
}

/** One relationship, with the nodes at its ends. */
interface EdgeSubject {
	/** Which sort of subject this is. */
	readonly kind: "edge";
	/** The relationship. */
	readonly edge: SemanticEdge;
	/** Where it starts, when the variant still holds that node. */
	readonly from: SemanticNode | undefined;
	/** Where it ends, when the variant still holds that node. */
	readonly to: SemanticNode | undefined;
}

/** One exchange, with the cast it is told through. */
interface FlowSubject {
	/** Which sort of subject this is. */
	readonly kind: "flow";
	/** The flow. */
	readonly flow: SemanticFlow;
	/**
	 * Who takes part, in the order the flow states them, named for reading.
	 *
	 * Names rather than nodes, because a participant the content no longer holds
	 * still has to appear: the cast is what the flow says it is, and dropping the
	 * ones that cannot be resolved would quietly shorten it.
	 */
	readonly participants: readonly string[];
}

/** One message of an exchange, with its ends and where it comes. */
interface StepSubject {
	/** Which sort of subject this is. */
	readonly kind: "step";
	/** The message. */
	readonly step: FlowStep;
	/** The exchange it is told in. */
	readonly flow: SemanticFlow;
	/** How far into that exchange it comes, counting from one. */
	readonly position: number;
	/** Who sent it, when the content still holds that node. */
	readonly from: SemanticNode | undefined;
	/** Who received it, when the content still holds that node. */
	readonly to: SemanticNode | undefined;
}

/** Whatever the person picked out, as far as the board knows it. */
type Subject = NodeSubject | EdgeSubject | FlowSubject | StepSubject;

/**
 * The containers above a node, outermost first.
 *
 * Containment is validated acyclic before a board is ever read, so this walk
 * terminates; the visited set is a floor under a document that arrived some
 * other way, not a second check.
 * @param node The node.
 * @param byId Every node of the variant, by id.
 * @returns Its ancestry, outermost first.
 */
function ancestryOf(node: SemanticNode, byId: ReadonlyMap<string, SemanticNode>): SemanticNode[] {
	const chain: SemanticNode[] = [];
	const seen = new Set<string>([node.id]);
	let at = node.parent === undefined ? undefined : byId.get(node.parent);
	while (at !== undefined && !seen.has(at.id)) {
		chain.unshift(at);
		seen.add(at.id);
		at = at.parent === undefined ? undefined : byId.get(at.parent);
	}
	return chain;
}

/**
 * The exchange or the message one id names, when a flow holds it.
 *
 * Both live in the same list and neither can be found without walking it, so
 * they are found together. A flow and a step are subjects a person selects in
 * the sequence grammar exactly as a card and a line are in the architecture
 * one, and the panel owes them the same answer.
 * @param flows Every flow of the content.
 * @param byId Every node of the content, by id.
 * @param id The id a click produced.
 * @returns The subject, or undefined when no flow holds that id.
 */
function flowSubjectOf(
	flows: readonly SemanticFlow[],
	byId: ReadonlyMap<string, SemanticNode>,
	id: string,
): Subject | undefined {
	for (const flow of flows) {
		if (flow.id === id) {
			return {
				kind: "flow",
				flow,
				participants: flow.participants.map((one) => byId.get(one)?.name ?? one),
			};
		}
		const at = flow.steps.findIndex((step) => step.id === id);
		const step = flow.steps[at];
		if (step !== undefined) {
			return {
				kind: "step",
				step,
				flow,
				position: at + 1,
				from: byId.get(step.from),
				to: byId.get(step.to),
			};
		}
	}
	return undefined;
}

/**
 * The subject one semantic id names on one variant.
 * @param variant The variant being shown.
 * @param id The id a click produced.
 * @returns The subject, or undefined when the variant no longer holds it.
 */
function subjectOf(variant: SemanticVariant, id: string): Subject | undefined {
	const byId = new Map(variant.content.nodes.map((node) => [node.id, node]));
	const node = byId.get(id);
	if (node !== undefined) {
		return {
			kind: "node",
			node,
			ancestry: ancestryOf(node, byId),
			holds: variant.content.nodes.filter((other) => other.parent === node.id),
		};
	}
	const edge = variant.content.edges.find((one) => one.id === id);
	if (edge !== undefined) {
		return { kind: "edge", edge, from: byId.get(edge.from), to: byId.get(edge.to) };
	}
	return flowSubjectOf(variant.content.flows, byId, id);
}

// What a proposal changed, in the panel as in the picture.
//
// The server draws a proposal from its own content *plus what its change took
// away*, so a removed node is really in the picture and really selectable. The
// panel therefore has to answer for a subject the proposal itself no longer
// holds, and it does that by reading the predecessor — which is in the same
// document — rather than by reading the composed picture.
//
// That distinction is the whole of this file's care. `withRemoved` composes one
// content out of two states so that a *drawing* can show both at once, and no
// number may be read off the result: a proposal whose flow has one message, laid
// over a baseline that had two, composes to three, and three is what neither
// state says. So the depiction is never reconstructed here. What is derived is
// only what the two states say about each other.
//
// Two things make that the same answer as the server's rather than a second
// opinion:
//
//   The baseline is the same. `src/server/canvas/lib/semantic-board-changes.ts`
//   takes the predecessor to be `variant.parent` looked up in this board, and
//   reports no changes at all exactly when there is no parent. That field is in
//   the document, so this reads it rather than being told it.
//
//   The comparison is the same. `compareVariants` is the one implementation of
//   what counts as a change (ADR 0023), shared by the server, the CLI and this;
//   a second one here would drift the first time a field was added.
//
// Nothing is fetched for it. Every variant of a board lives in the one document
// the panel already has, so the predecessor is a lookup rather than a read.

/** What a proposal changed, as the panel needs to explain it. */
interface Depiction {
	/** The variant it came from, or undefined when it came from nothing. */
	readonly predecessor: SemanticVariant | undefined;
	/**
	 * How one subject stands against that predecessor.
	 * @param id The semantic id.
	 * @returns Its standing; unchanged for anything the comparison never saw.
	 */
	readonly standing: (id: string) => ChangeKind;
	/**
	 * What moved on one subject.
	 * @param id The semantic id.
	 * @returns The fields that moved; empty for anything but a change.
	 */
	readonly moved: (id: string) => readonly FieldChange[];
}

/**
 * The fields that moved on one subject, whichever sort of subject it is.
 * @param comparison What the proposal changed.
 * @param id The semantic id.
 * @returns The fields that moved, or none.
 */
function movedOn(comparison: VariantComparison, id: string): readonly FieldChange[] {
	const found =
		comparison.nodes.get(id) ??
		comparison.edges.get(id) ??
		comparison.flows.get(id) ??
		comparison.steps.get(id);
	return found?.fields ?? [];
}

/**
 * What the picture of one variant is of, and what its change did to each
 * subject of it.
 * @param board The board the variant belongs to.
 * @param variant The variant being shown.
 * @returns The depiction.
 */
function depictionOf(board: SemanticBoard, variant: SemanticVariant): Depiction {
	const parent =
		variant.parent === undefined
			? undefined
			: board.variants.find((one) => one.id === variant.parent);
	// Compared whole, before any view narrowed it, exactly as the server compares
	// it: a view that hides a node is a narrower reading of the variant, never a
	// variant that lost one.
	const comparison =
		parent === undefined ? undefined : compareVariants(parent.content, variant.content);

	/**
	 * How one subject stands against the predecessor.
	 * @param id The semantic id.
	 * @returns Its standing.
	 */
	function standing(id: string): ChangeKind {
		return comparison === undefined ? "unchanged" : standingOf(comparison, id);
	}

	/**
	 * What moved on one subject.
	 * @param id The semantic id.
	 * @returns The fields that moved.
	 */
	function moved(id: string): readonly FieldChange[] {
		return comparison === undefined ? [] : movedOn(comparison, id);
	}

	return { predecessor: parent, standing, moved };
}

type BoardReading =
	| { readonly ok: true; readonly board: SemanticBoard }
	| { readonly ok: false; readonly problem: string };

/**
 * One board document, as the contract reads it.
 * @param document Whatever the board route answered with.
 * @returns The board, or why it is not one.
 */
function readBoard(document: unknown): BoardReading {
	return parseSemanticBoard(document);
}

/** One of a board's variants, as a picker needs to know it. */
interface OfferedVariant {
	/** Its lasting id. */
	readonly id: string;
	/** Its lasting name. */
	readonly name: string;
	/** Where it stands: the current architecture, a draft, or history. */
	readonly lifecycle: VariantLifecycle;
	/** The variant it came from, when it came from one. */
	readonly parent: string | undefined;
}

/** What one variant says about itself beyond the picture drawn of it. */
interface VariantReading {
	/** Every variant of the board, in the order the board states them. */
	readonly variants: readonly OfferedVariant[];
	/** The one this pane is showing, or null when the board has no such variant. */
	readonly showing: OfferedVariant | null;
	/** That variant whole, or null when the board has no such variant. */
	readonly variant: SemanticVariant | null;
	/** Every explanation the variant states, in the order it states them. */
	readonly walkthroughs: readonly SemanticWalkthrough[];
	/**
	 * What to call one of the variant's subjects in a sentence a person reads.
	 * @param id The semantic id.
	 * @returns Its name, or the id itself when the variant does not hold it.
	 */
	readonly nameOf: (id: string) => string;
	/**
	 * What one of the variant's subjects is, for whoever has to report a
	 * selection rather than draw it.
	 * @param id The semantic id.
	 * @returns Its kind and name, or undefined when the variant does not hold it.
	 */
	readonly subject: (id: string) => SelectedSubject | undefined;
}

/**
 * What one node is called.
 *
 * An id is the wrong thing to put in a sentence a person reads. A node has a
 * name, a relationship carries a label or is known by its ends, a flow and a
 * step have their own words — and anything the variant has stopped holding is
 * named by the only thing left of it, which is its id.
 * @param nodes Every node of the variant.
 * @param id The semantic id.
 * @returns The words to use.
 */
function nodeName(nodes: readonly SemanticNode[], id: string): string {
	return nodes.find((one) => one.id === id)?.name ?? id;
}

/**
 * What one relationship is called: what it carries, or the two ends it joins.
 * @param edge The relationship.
 * @param nodes Every node of the variant.
 * @returns The words to use.
 */
function edgeName(edge: SemanticEdge, nodes: readonly SemanticNode[]): string {
	return edge.label ?? `${nodeName(nodes, edge.from)} → ${nodeName(nodes, edge.to)}`;
}

/**
 * What one exchange or one of its steps is called.
 * @param flows Every flow of the variant.
 * @param id The semantic id.
 * @returns The words to use, or the id when no flow holds it.
 */
function flowName(flows: readonly SemanticFlow[], id: string): string {
	const flow = flows.find((one) => one.id === id);
	if (flow !== undefined) {
		return flow.name;
	}
	return flows.flatMap((one) => one.steps).find((step) => step.id === id)?.label ?? id;
}

/**
 * What one of a variant's subjects is called.
 * @param variant The variant being read.
 * @param id The semantic id.
 * @returns The words to use.
 */
function subjectName(variant: SemanticVariant, id: string): string {
	const { nodes, edges, flows } = variant.content;
	const node = nodes.find((one) => one.id === id);
	if (node !== undefined) {
		return node.name;
	}
	const edge = edges.find((one) => one.id === id);
	return edge === undefined ? flowName(flows, id) : edgeName(edge, nodes);
}

/**
 * One variant, as the bar that offers a choice between them knows it.
 * @param variant The variant.
 * @returns What a picker shows of it.
 */
function offeredVariant(variant: SemanticVariant): OfferedVariant {
	return {
		id: variant.id,
		name: variant.name,
		lifecycle: variant.lifecycle,
		parent: variant.parent,
	};
}

/**
 * The id a subject keeps when no variant is there to name it.
 * @param id The semantic id.
 * @returns The id itself.
 */
function idItself(id: string): string {
	return id;
}

/**
 * What one variant says beyond its picture.
 * @param variants Every variant of the board it belongs to.
 * @param variant The variant the pane is showing.
 * @returns Its explanations, and how to name what they are about.
 */
function readingOf(variants: readonly OfferedVariant[], variant: SemanticVariant): VariantReading {
	/**
	 * What one of this variant's subjects is called.
	 * @param id The semantic id.
	 * @returns The words to use.
	 */
	function nameOf(id: string): string {
		return subjectName(variant, id);
	}
	/**
	 * What one of this variant's subjects is.
	 * @param id The semantic id.
	 * @returns Its kind and name, or undefined when this variant has no such subject.
	 */
	function subject(id: string): SelectedSubject | undefined {
		return selectedSubject(variant, id);
	}
	return {
		variants,
		showing: offeredVariant(variant),
		variant,
		walkthroughs: variant.content.walkthroughs,
		nameOf,
		subject,
	};
}

/**
 * What one variant of one board says beyond its picture.
 *
 * Read from the board document rather than from the render, for the reason the
 * inspector reads from it: a picture is a reading of a board and not the board.
 * A narrative belongs to the variant whichever view is on screen, and a view
 * that narrows what is drawn must not narrow what can be explained.
 *
 * The variant is resolved the way the render route resolves it — the same
 * function over the same document — rather than taken from the picture. A
 * narrative that depended on the picture would go out whenever a render failed,
 * which is precisely when somebody wants to read what the board says.
 * @param document Whatever the board route answered with.
 * @param asked The variant id or name the pane is showing; the current one
 *   when it names none.
 * @returns The reading, or null when the board or that variant cannot be read.
 */
function readVariant(document: unknown, asked: string | undefined): VariantReading | null {
	const reading = readBoard(document);
	if (!reading.ok) {
		return null;
	}
	const variants = reading.board.variants.map(offeredVariant);
	const variant = resolveVariant(reading.board, asked);
	// The board reads even when the variant asked for is not one of its own: the
	// picker is how somebody recovers from an address naming a variant that has
	// been renamed, so the choice has to be on screen for them to make it.
	return variant === undefined ? { variants, ...NOTHING_SHOWN } : readingOf(variants, variant);
}

/** What a selected subject is, for whoever reports it rather than draws it. */
interface SelectedSubject {
	readonly kind: Subject["kind"];
	readonly name?: string;
}

/**
 * What a variant nobody could read holds: nothing.
 * @returns Undefined, always.
 */
function nothingHeld(): SelectedSubject | undefined {
	return undefined;
}

/** A reading of a board whose asked-for variant is not one of its own. */
const NOTHING_SHOWN: Omit<VariantReading, "variants"> = Object.freeze({
	showing: null,
	variant: null,
	walkthroughs: [],
	nameOf: idItself,
	subject: nothingHeld,
});

/**
 * What a selected subject is, for whoever has to report it rather than draw it.
 *
 * The kind travels with the id because the id alone does not say what it is,
 * and the name because it is what the person said out loud: a shell reporting a
 * selection to an agent would otherwise need a second read of the board to turn
 * an id back into the words somebody used.
 * @param variant The variant the selection was made on.
 * @param id The subject's id.
 * @returns What it is, or undefined when this variant does not hold it.
 */
function selectedSubject(variant: SemanticVariant, id: string): SelectedSubject | undefined {
	const subject = subjectOf(variant, id);
	if (subject === undefined) {
		return undefined;
	}
	const named = nameOfSubject(subject);
	return named === undefined ? { kind: subject.kind } : { kind: subject.kind, name: named };
}

/**
 * What one subject is called, for the kinds of subject that have a name.
 * @param subject The subject.
 * @returns Its name, or undefined for a subject nobody names.
 */
function nameOfSubject(subject: Subject): string | undefined {
	if (subject.kind === "node") {
		return subject.node.name;
	}
	if (subject.kind === "flow") {
		return subject.flow.name;
	}
	if (subject.kind === "step") {
		return subject.step.label;
	}
	return subject.edge.label;
}

export {
	type BoardReading,
	type SelectedSubject,
	type Depiction,
	type EdgeSubject,
	type FlowSubject,
	type NodeSubject,
	type OfferedVariant,
	type StepSubject,
	type Subject,
	type VariantReading,
	ancestryOf,
	depictionOf,
	readBoard,
	readVariant,
	selectedSubject,
	subjectOf,
};
