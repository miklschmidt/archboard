// The hand-off of a board's flows to the renderer core (ADR 0057): the core
// lays a sequence or a flowchart out and paints it in one call, and answers
// the picture as one SVG document with its atlas.
//
// The core asks this host for what it does not hold yet: the widths and line
// breaks of text, as the canvas of the place that draws measures them
// (TASK-520.07), and for a flowchart the track engine (TASK-520.04). What
// crosses to the core and back crosses as JSON.

import type { SemanticFlow } from "@archboard/board/flow";
import type { SemanticNode, VariantContent } from "@archboard/board/content";
import type { SemanticPolicy } from "@archboard/board/policy";
import type {
	FlowchartHost,
	LayoutText,
} from "#shared/protocol/generated/core/archboard_renderer_wasm.js";
import type {
	ArchitecturePicture,
	PaintRequest,
	PaintedDocument,
	SequencePicture,
} from "#shared/protocol/generated/core/types.ts";
import { layoutEngine } from "#shared/rules/layout/engines.ts";
import type {
	LineLook,
	MeasuredArchitecture,
	MeasuredLabel,
	MeasuredNode,
} from "#shared/rules/render/drawing.ts";
import { rendererHost } from "#shared/rules/render/host.ts";
import { TEXT_MEASURE } from "#shared/rules/render/paint.ts";
import {
	farSizeFor,
	measureLabel,
	measureMessageLines,
	measureNode,
	measureNoteLines,
} from "#shared/rules/text/measurement.ts";

/** Everything a sequence is laid out and painted from. */
type SequenceRequest = Omit<PaintRequest, "picture"> &
	Pick<SequencePicture, "appearances" | "clock"> & {
		/** Every flow the content holds, in document order. */
		readonly flows: readonly SemanticFlow[];
		/** The content's nodes, which the participants are. */
		readonly nodes: readonly SemanticNode[];
		/** The flows of the variant's own reading, when the picture is without its comparison. */
		readonly held?: readonly SemanticFlow[] | undefined;
	};

/** Everything a flowchart is laid out and painted from. */
type FlowchartRequest = Omit<PaintRequest, "picture"> &
	Pick<ArchitecturePicture, "groups"> & {
		/** The flows the picture draws, in document order. */
		readonly flows: readonly SemanticFlow[];
		/** The nodes of the same reading, for the parts a message runs between. */
		readonly parts: readonly SemanticNode[];
		/** The vault policy's node kinds, which a message box is drawn as. */
		readonly nodeKinds: SemanticPolicy["nodeKinds"];
	};

/** The graph measured, as the core hands it over: each entry by id, in the graph's order. */
interface MeasuredEntries {
	readonly nodes: readonly (readonly [string, MeasuredNode])[];
	readonly labels: readonly (readonly [string, MeasuredLabel])[];
	readonly lines: readonly (readonly [string, LineLook])[];
}

/** The host's text, as the core's layout asks for it. */
const TEXT: LayoutText = { ...TEXT_MEASURE, noteLines, messageLines };

/** What the core's flowchart layout asks of this host: its text, and the track engine. */
const FLOWCHART: FlowchartHost = {
	...TEXT,
	measureNode: nodeMeasured,
	measureLabel: labelMeasured,
	farSize,
	track,
};

/**
 * A step note's lines, as the host breaks them.
 * @param text The note.
 * @param width The widest a line may be.
 * @param size Its font size.
 * @param lineHeight Its line height.
 * @returns The JSON of its runs.
 */
function noteLines(text: string, width: number, size: number, lineHeight: number): string {
	return JSON.stringify(measureNoteLines(text, width, size, lineHeight));
}

/**
 * A message's lines, as the host breaks them.
 * @param text The message's words.
 * @param width The widest a line may be.
 * @param size Its font size.
 * @param lineHeight Its line height.
 * @returns The JSON of its lines.
 */
function messageLines(text: string, width: number, size: number, lineHeight: number): string {
	return JSON.stringify(measureMessageLines(text, width, size, lineHeight));
}

/**
 * A graph node's box and words, as the host measures them.
 * @param node The JSON of the node.
 * @param container Whether it holds other nodes.
 * @returns The JSON of its measurement.
 */
function nodeMeasured(node: string, container: boolean): string {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's own output, typed from its Rust source
	return JSON.stringify(measureNode(JSON.parse(node) as SemanticNode, container));
}

/**
 * A line's words on their plate, as the host measures them.
 * @param words The words.
 * @returns The JSON of their measurement.
 */
function labelMeasured(words: string): string {
	return JSON.stringify(measureLabel(words));
}

/**
 * The size every card's name is set at from far away.
 * @param subjects The JSON of the cards whose names are drawn.
 * @returns The size.
 */
function farSize(subjects: string): number {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's own output, typed from its Rust source
	return farSizeFor(JSON.parse(subjects) as Parameters<typeof farSizeFor>[0]);
}

/**
 * The flowchart's graph laid out by the track engine.
 * @param content The JSON of the graph.
 * @param measured The JSON of its measurement, each entry by id.
 * @returns The JSON of the drawing.
 */
async function track(content: string, measured: string): Promise<string> {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's own output, typed from its Rust source
	const entries = JSON.parse(measured) as MeasuredEntries;
	const measure: MeasuredArchitecture = {
		nodes: new Map(entries.nodes),
		labels: new Map(entries.labels),
		lines: new Map(entries.lines),
	};
	const drawing = await layoutEngine("track")(
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's own output, typed from its Rust source
		JSON.parse(content) as VariantContent,
		measure,
		undefined,
		new Map(),
	);
	return JSON.stringify(drawing);
}

/**
 * A variant's flows laid out by the core as a stack of message sequences, and painted.
 * @param request Everything the sequence is laid out and painted from.
 * @returns The document, its size, its atlas and what it placed.
 */
function drawSequence(request: SequenceRequest): PaintedDocument {
	const painted = rendererHost().core().drawSequence(JSON.stringify(request), TEXT);
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's own output, typed from its Rust source
	return JSON.parse(painted) as PaintedDocument;
}

/**
 * A reading's flows laid out by the core as a flowchart, and painted.
 * @param request Everything the flowchart is laid out and painted from.
 * @returns The document, its size, its atlas and what it placed.
 */
async function drawFlowchart(request: FlowchartRequest): Promise<PaintedDocument> {
	const painted = await rendererHost().core().drawFlowchart(JSON.stringify(request), FLOWCHART);
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's own output, typed from its Rust source
	return JSON.parse(painted) as PaintedDocument;
}

export { drawFlowchart, drawSequence };
