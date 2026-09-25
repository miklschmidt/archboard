// Pure layout shared by the Bun and browser workers. Hosts initialize WASM.
import type { ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { z } from "zod";
import { placeGraph } from "@/transformers/semantic-renderer/lib/layout/graphviz-placement";
import { routeGraph } from "@/transformers/semantic-renderer/lib/layout/route-graph";
import { foldColumns } from "@/transformers/semantic-renderer/lib/layout/fold-columns";
import { placeTracks } from "@/transformers/semantic-renderer/lib/track/placement";
import { placeBlocks } from "@/transformers/semantic-renderer/lib/blocks/place";
import { SOLVE_STAGE } from "@/transformers/semantic-renderer/lib/host";

/** A value owned by the WASM heap. */
interface Owned {
	delete(): void;
}
/** A point copied from the WASM heap. */
interface AvoidPoint extends Owned {
	x: number;
	y: number;
}
/** An Embind enum value. */
interface AvoidEnum {
	readonly value: number;
}
/** One connector owned by its router. */
interface AvoidConnection {
	setRoutingType(type: AvoidEnum): void;
	setRoutingCheckpoints(checkpoints: AvoidCheckpointVector): void;
	displayRoute(): { size(): number; at(index: number): AvoidPoint };
	hasValidRoute(): boolean;
	hasCrossingObstacles(): boolean;
}
interface AvoidCheckpointVector extends Owned {
	push_back(checkpoint: Owned): void;
}
/** The router owns its shapes, pins and connectors until deletion. */
interface AvoidRouter extends Owned {
	setRoutingParameter(parameter: AvoidEnum, value: number): void;
	setRoutingOption(option: AvoidEnum, value: boolean): void;
	processTransaction(): void;
}

/**
 * Pinned libavoid-js 0.5.0-beta.5 Embind ABI. This release's exported types
 * target a missing file; its fallback declarations describe the previous
 * WebIDL API (numeric enums, different constructors). Keep the narrow actual
 * ABI here until upstream publishes usable types. Engine contract tests run
 * these constructors and routing methods against the installed WASM.
 */
export interface AvoidEngine {
	Point: new (x: number, y: number) => AvoidPoint;
	Rectangle: new (from: AvoidPoint, to: AvoidPoint) => Owned;
	Router: new (flags: number) => AvoidRouter;
	ShapeRef: new (router: AvoidRouter, polygon: Owned) => object;
	ShapeConnectionPin: new (
		shape: object,
		id: number,
		x: number,
		y: number,
		proportional: boolean,
		offset: number,
		direction: number,
	) => { setExclusive(exclusive: boolean): void };
	ConnEnd: { new (point: AvoidPoint): Owned; new (shape: object, pin: number): Owned };
	ConnRef: new (router: AvoidRouter, from: Owned, to: Owned) => AvoidConnection;
	Checkpoint: new (point: AvoidPoint) => Owned;
	CheckpointVector: new () => AvoidCheckpointVector;
	RouterFlag: { OrthogonalRouting: AvoidEnum };
	ConnType: { ConnType_Orthogonal: AvoidEnum };
	RoutingParameter: Record<
		"shapeBufferDistance" | "idealNudgingDistance" | "segmentPenalty",
		AvoidEnum
	>;
	RoutingOption: Record<"nudgeOrthogonalSegmentsConnectedToShapes", AvoidEnum>;
}

/**
 * Bind initialized vendor engines without I/O or environment-specific loading.
 * @param viz The initialized Graphviz instance.
 * @param instance The initialized libavoid Embind module.
 * @returns A deterministic complete layout operation.
 */
export function createLayoutEngine(viz: Viz, instance: unknown) {
	const avoid = z
		.custom<AvoidEngine>(
			(value) =>
				typeof value === "object" &&
				value !== null &&
				"Router" in value &&
				typeof value.Router === "function" &&
				"RouterFlag" in value,
		)
		.parse(instance);
	return (graph: ElkNode, options: LayoutOptions): ElkNode => {
		const stage = options[SOLVE_STAGE];
		if (stage === "route") return routeGraph(avoid, graph);
		if (stage === "track") return placeTracks(viz, graph);
		if (stage === "blocks") return placeBlocks(viz, avoid, graph);
		const reading = placeReading(viz, graph, options);
		return stage === "place" ? reading : routeGraph(avoid, reading);
	};
}

/**
 * Place a graph and fold it into the columns its options ask for.
 * @param viz The initialized Graphviz instance.
 * @param graph The measured graph.
 * @param options The options for this solve.
 * @returns The placed reading, naming the column count it was folded into.
 */
function placeReading(viz: Viz, graph: ElkNode, options: LayoutOptions): ElkNode {
	const placed = placeGraph(viz, graph, options);
	const columns = Number(options["archboard.fold.columns"] ?? 1);
	const folded = columns === 1 ? undefined : foldColumns(placed, columns);
	const reading = folded ?? placed;
	reading.layoutOptions = {
		...reading.layoutOptions,
		"archboard.fold.columns": String(folded === undefined ? 1 : columns),
	};
	return reading;
}
