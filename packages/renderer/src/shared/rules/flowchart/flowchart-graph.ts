// A flow read as a flowchart (ADR 0053): the graph the track engine lays out.
//
// Each flow becomes a frame that holds its steps, from a start terminal to an
// end terminal. A message is a box: what happens, done by the part that
// receives it, and who sends it to whom under its words. A decision is a
// diamond with one line out for each alternative, labelled with the answer; the
// steps of each alternative run below it, and the last of every alternative
// joins the step after the decision, which is how a flowchart says that the
// alternatives rejoin. An alternative with no step joins it straight from the
// diamond. A loop is a hexagon holding its condition: a line labelled
// "repeat" runs into the steps it repeats, the last of them runs back up to
// it, and a line labelled "done" leaves it for the step after.
//
// Nothing here is written anywhere: the graph is built for one picture, from
// the flow as the board holds it. Its boxes carry the steps' own ids, so a
// reader who picks one has picked the step; its lines and terminals carry ids
// of the picture's own, which name no subject.

import type { FlowMessage, FlowStep, SemanticFlow } from "@archboard/board/flow";
import type { SemanticEdge, SemanticNode, VariantContent } from "@archboard/board/content";
import type * as Core from "#shared/protocol/generated/core/types.ts";

/** What a node of the graph is drawn as when it is not a box: the core paints it so. */
type FlowchartShape = Core.FlowchartShape;

/** A flow's flowchart, as an architecture the track engine lays out. */
interface FlowchartGraph {
	/** The flows as frames, their steps and terminals as nodes, and every line between. */
	readonly content: VariantContent;
	/** The nodes drawn as shapes of their own, by id. */
	readonly shapes: ReadonlyMap<string, FlowchartShape>;
	/** The ids a reader can pick: every flow and every step drawn. */
	readonly subjects: ReadonlySet<string>;
}

/** The kind of a flow's frame. */
const FLOW_KIND = "flow";
/** The kind of a decision, a loop or a terminal, which is drawn by its shape and never by its kind. */
const SHAPE_KIND = "flowchart-shape";
/** The kind of every line: one step leads to the next. */
const NEXT_KIND = "next";
/** The line into the steps a loop repeats. */
const REPEAT = "repeat";
/** The line out of a loop once it is done. */
const DONE = "done";

/** A loose end the next step joins: the node it leaves, and what its line says. */
interface Exit {
	readonly from: string;
	readonly label?: string | undefined;
}

/** The graph as it is built. */
interface Building {
	readonly nodes: SemanticNode[];
	readonly edges: SemanticEdge[];
	readonly shapes: Map<string, FlowchartShape>;
	readonly subjects: Set<string>;
	/** The variant's nodes, by id, for the parts a message runs between. */
	readonly parts: ReadonlyMap<string, SemanticNode>;
	/** The frame the steps being built stand in. */
	readonly flow: string;
}

/**
 * Add one node to the frame being built.
 * @param building The graph.
 * @param node The node, without its order or frame.
 * @returns Its id.
 */
function addNode(building: Building, node: Omit<SemanticNode, "order" | "parent">): string {
	building.nodes.push({ ...node, order: building.nodes.length, parent: building.flow });
	return node.id;
}

/**
 * Join every loose end to one node.
 * @param building The graph.
 * @param exits The loose ends.
 * @param to The node they join.
 */
function link(building: Building, exits: readonly Exit[], to: string): void {
	for (const exit of exits) {
		building.edges.push({
			id: `${exit.from}>${to}#${building.edges.length}`,
			order: building.edges.length,
			from: exit.from,
			to,
			kind: NEXT_KIND,
			emphasis: "normal",
			...(exit.label === undefined ? {} : { label: exit.label }),
		});
	}
}

/**
 * What one part is called in a message box's line of who sends to whom.
 * @param building The graph.
 * @param id The part.
 * @returns Its name.
 */
function partName(building: Building, id: string): string {
	return building.parts.get(id)?.name ?? id;
}

/**
 * Add one step's node: a box for a message, a diamond for a decision, a
 * hexagon for a loop.
 * @param building The graph.
 * @param step The step.
 */
function addStep(building: Building, step: FlowStep): void {
	building.subjects.add(step.id);
	if (step.kind === "decision" || step.kind === "loop") {
		building.shapes.set(step.id, step.kind);
		const name = step.kind === "decision" ? step.question : step.condition;
		addNode(building, { id: step.id, name, kind: SHAPE_KIND });
		return;
	}
	addNode(building, messageBox(building, step));
}

/**
 * A message's box: what happens, set as a card of the part that receives the
 * message, which is the part that does what it asks, with who sends it to whom
 * under its words.
 * @param building The graph.
 * @param step The message.
 * @returns The box's node.
 */
function messageBox(building: Building, step: FlowMessage): Omit<SemanticNode, "order" | "parent"> {
	const from = partName(building, step.from);
	return {
		id: step.id,
		name: step.repeat === undefined ? step.label : `${step.label} ×${step.repeat}`,
		kind: building.parts.get(step.to)?.kind ?? "other",
		responsibility: step.from === step.to ? from : `${from} → ${partName(building, step.to)}`,
	};
}

/**
 * Chain a run of steps after some loose ends.
 * @param building The graph.
 * @param steps The steps, in order.
 * @param exits The loose ends the first step joins.
 * @returns The loose ends the step after the run joins.
 */
function chain(building: Building, steps: readonly FlowStep[], exits: readonly Exit[]): Exit[] {
	let open = [...exits];
	for (const step of steps) {
		addStep(building, step);
		link(building, open, step.id);
		open = exitsOf(building, step);
	}
	return open;
}

/**
 * The loose ends one step leaves, its own steps chained in first.
 * @param building The graph.
 * @param step The step.
 * @returns What the step after it joins.
 */
function exitsOf(building: Building, step: FlowStep): Exit[] {
	if (step.kind === "decision") {
		return step.alternatives.flatMap((alternative) =>
			chain(building, alternative.steps, [{ from: step.id, label: alternative.label }]),
		);
	}
	if (step.kind === "loop") {
		link(building, chain(building, step.steps, [{ from: step.id, label: REPEAT }]), step.id);
		return [{ from: step.id, label: DONE }];
	}
	return [{ from: step.id }];
}

/**
 * Add one flow: its frame, its terminals and its steps.
 * @param building The graph, its frame not yet set.
 * @param flow The flow.
 */
function addFlow(building: Omit<Building, "flow">, flow: SemanticFlow): void {
	building.nodes.push({
		id: flow.id,
		order: building.nodes.length,
		name: flow.name,
		kind: FLOW_KIND,
		...(flow.summary === undefined ? {} : { responsibility: flow.summary }),
	});
	building.subjects.add(flow.id);
	const inside: Building = { ...building, flow: flow.id };
	const start = addNode(inside, { id: `${flow.id}~start`, name: "Start", kind: SHAPE_KIND });
	inside.shapes.set(start, "start");
	const exits = chain(inside, flow.steps, [{ from: start }]);
	const end = addNode(inside, { id: `${flow.id}~end`, name: "End", kind: SHAPE_KIND });
	inside.shapes.set(end, "end");
	link(inside, exits, end);
}

/**
 * Every flow of a reading as one flowchart graph.
 * @param flows The flows, in document order.
 * @param parts The variant's nodes, for the parts a message runs between.
 * @returns The graph.
 */
function flowchartOf(
	flows: readonly SemanticFlow[],
	parts: readonly SemanticNode[],
): FlowchartGraph {
	const building = {
		nodes: [],
		edges: [],
		shapes: new Map<string, FlowchartShape>(),
		subjects: new Set<string>(),
		parts: new Map(parts.map((part) => [part.id, part])),
	};
	for (const flow of flows) {
		addFlow(building, flow);
	}
	return {
		content: { nodes: building.nodes, edges: building.edges, flows: [], walkthroughs: [] },
		shapes: building.shapes,
		subjects: building.subjects,
	};
}

export { type FlowchartGraph, type FlowchartShape, FLOW_KIND, NEXT_KIND, SHAPE_KIND, flowchartOf };
