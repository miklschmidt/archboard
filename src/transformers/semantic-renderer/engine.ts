// Pure layout shared by the Bun and browser workers. Hosts initialize WASM
// through `loadLayoutEngine`, which puts back what each engine held as loaded
// before every solve.
import type { ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { z } from "zod";
import { placeGraph } from "@/transformers/semantic-renderer/lib/layout/graphviz-placement";
import { routeGraph } from "@/transformers/semantic-renderer/lib/layout/route-graph";
import { foldColumns } from "@/transformers/semantic-renderer/lib/layout/fold-columns";
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
	) => { setExclusive(exclusive: boolean): void; setConnectionCost(cost: number): void };
	ConnEnd: { new (point: AvoidPoint): Owned; new (shape: object, pin: number): Owned };
	ConnRef: new (router: AvoidRouter, from: Owned, to: Owned) => AvoidConnection;
	Checkpoint: new (point: AvoidPoint) => Owned;
	CheckpointVector: new () => AvoidCheckpointVector;
	RouterFlag: { OrthogonalRouting: AvoidEnum };
	ConnType: { ConnType_Orthogonal: AvoidEnum };
	RoutingParameter: Record<
		"shapeBufferDistance" | "idealNudgingDistance" | "segmentPenalty" | "crossingPenalty",
		AvoidEnum
	>;
	RoutingOption: Record<"nudgeOrthogonalSegmentsConnectedToShapes", AvoidEnum>;
}

/**
 * Bind initialized vendor engines without I/O or environment-specific loading.
 * A solve's answer can depend on what the engines solved before it; an engine
 * that must answer the same graph the same way every time is loaded with
 * {@link loadLayoutEngine}.
 * @param viz The initialized Graphviz instance.
 * @param instance The initialized libavoid Embind module.
 * @returns A complete layout operation.
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
		if (stage === "track") return placeBlocks(viz, avoid, graph, true);
		if (stage === "blocks") return placeBlocks(viz, avoid, graph);
		const reading = placeReading(viz, graph, options);
		return stage === "place" ? reading : routeGraph(avoid, reading);
	};
}

/** One solve: a measured graph and its options in, its geometry out. */
type LayoutEngine = ReturnType<typeof createLayoutEngine>;

/**
 * Every memory a WebAssembly instantiation exports.
 * @param answered What `WebAssembly.instantiate` or `instantiateStreaming` resolved to.
 * @returns The memories, none when it answered something else.
 */
function exportedMemories(answered: unknown): WebAssembly.Memory[] {
	const instance =
		typeof answered === "object" && answered !== null && "instance" in answered
			? answered.instance
			: answered;
	if (!(instance instanceof WebAssembly.Instance)) return [];
	return Object.values(instance.exports).filter(
		(value): value is WebAssembly.Memory => value instanceof WebAssembly.Memory,
	);
}

/**
 * The same instantiation, which also keeps each memory it exports.
 * @param instantiate `WebAssembly.instantiate` or `instantiateStreaming`.
 * @param memories Where each memory is kept.
 * @returns The instantiation, of the same type.
 */
function keepingMemories<Instantiate extends (...args: never[]) => Promise<unknown>>(
	instantiate: Instantiate,
	memories: WebAssembly.Memory[],
): Instantiate {
	return new Proxy(instantiate, {
		/**
		 * Instantiate, and keep what it exports of memory.
		 * @param target The instantiation.
		 * @param self Its receiver.
		 * @param args Its arguments.
		 * @returns What it answered.
		 */
		async apply(target, self, args) {
			const answered: unknown = await Reflect.apply(target, self, args);
			memories.push(...exportedMemories(answered));
			return answered;
		},
	});
}

/**
 * What a memory holds: everything below its last byte that is not zero. The
 * allocator heads the memory it has not handed out with a size, which is never
 * zero, so static data, the stack, every allocation and the allocator's own
 * bookkeeping lie below that byte; above it is only memory not handed out,
 * which an engine writes before it reads.
 * @param memory The memory.
 * @returns A copy of what it holds.
 */
function heldBytes(memory: WebAssembly.Memory): Uint8Array {
	const words = new Uint32Array(memory.buffer);
	let end = words.length;
	while (end > 0 && words[end - 1] === 0) end -= 1;
	return new Uint8Array(memory.buffer, 0, end * Uint32Array.BYTES_PER_ELEMENT).slice();
}

/**
 * Load Graphviz and libavoid and bind the layout, every solve starting from
 * what both engines held when they were loaded.
 *
 * libavoid breaks some ties by where its objects lie in memory, so a graph
 * routed after other solves could be drawn differently from the same graph
 * routed first: which worker answered a solve, and what that worker had solved
 * before, decided the picture. Putting back what each engine held as loaded,
 * its allocator included, hands every solve's objects the same places, so a
 * solve's answer is decided by its graph and options alone. What is put back
 * is a few hundred kilobytes, which costs microseconds.
 * @param load Instantiates both engines, answering the Graphviz instance and
 * the initialized libavoid module. It must instantiate them itself: an engine
 * loaded earlier has nothing as loaded to go back to.
 * @returns The layout engine.
 * @throws {Error} When the load did not instantiate both engines.
 */
export async function loadLayoutEngine(
	load: () => Promise<readonly [Viz, unknown]>,
): Promise<LayoutEngine> {
	const memories: WebAssembly.Memory[] = [];
	const { instantiate, instantiateStreaming } = WebAssembly;
	WebAssembly.instantiate = keepingMemories(instantiate, memories);
	WebAssembly.instantiateStreaming = keepingMemories(instantiateStreaming, memories);
	let loaded: readonly [Viz, unknown];
	try {
		loaded = await load();
	} finally {
		WebAssembly.instantiate = instantiate;
		WebAssembly.instantiateStreaming = instantiateStreaming;
	}
	if (memories.length !== 2) {
		throw new Error(
			`Loading the layout engine instantiated ${memories.length} WebAssembly memories where Graphviz and libavoid make two: load both engines in the call, not before it.`,
		);
	}
	const solve = createLayoutEngine(...loaded);
	const asLoaded = memories.map((memory) => ({ memory, held: heldBytes(memory) }));
	return (graph, options) => {
		for (const { memory, held } of asLoaded) new Uint8Array(memory.buffer).set(held);
		return solve(graph, options);
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
