// The hand-off of a board's flows to the renderer core (ADR 0057): the core
// lays a sequence or a flowchart out and paints it in one call, and answers
// the picture as one SVG document with its atlas.
//
// The core asks this host for what it does not hold yet: for a flowchart the
// track engine (TASK-520.04). What crosses to the core and back crosses as
// JSON.

import type { SemanticFlow } from "@archboard/board/flow";
import type { SemanticNode, VariantContent } from "@archboard/board/content";
import type { SemanticPolicy } from "@archboard/board/policy";
import type { FlowchartHost } from "#shared/protocol/generated/core/archboard_renderer_wasm.js";
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

/** What the core's flowchart layout asks of this host: the track engine. */
const FLOWCHART: FlowchartHost = { track };

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
	const painted = rendererHost().core().drawSequence(JSON.stringify(request));
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
