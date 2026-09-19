// Pure layout shared by the Bun and browser workers. Hosts initialize WASM.
import type { ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { z } from "zod";
import { placeGraph } from "@/transformers/semantic-renderer/lib/layout/graphviz-placement";
import { routeGraph } from "@/transformers/semantic-renderer/lib/layout/avoid-routing";
import { foldColumns } from "@/transformers/semantic-renderer/lib/layout/fold-columns";

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
	displayRoute(): { size(): number; at(index: number): AvoidPoint };
	hasValidRoute(): boolean;
	hasCrossingObstacles(): boolean;
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
		const placed = placeGraph(viz, graph, options);
		const columns = Number(options["archboard.fold.columns"] ?? 1);
		const folded = columns === 1 ? undefined : foldColumns(placed, columns);
		const reading = folded ?? placed;
		reading.layoutOptions = {
			...reading.layoutOptions,
			"archboard.fold.columns": String(folded === undefined ? 1 : columns),
		};
		return routeGraph(avoid, reading);
	};
}
