// Pure layout shared by the Bun and browser workers. Hosts initialize WASM
// through `loadLayoutEngine`, which puts back what each engine held as loaded
// before every solve.
import type { ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { z } from "zod";
import { placeBlocks } from "#shared/rules/blocks/tree/place.ts";
import { SOLVE_STAGE } from "#shared/rules/render/host.ts";
import { markingUnsatisfiable } from "#shared/rules/engine/unsatisfiable.ts";

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
	RoutingOption: Record<
		"nudgeOrthogonalSegmentsConnectedToShapes" | "performUnifyingNudgingPreprocessingStep",
		AvoidEnum
	>;
}

/**
 * Bind initialized vendor engines without I/O or environment-specific loading.
 * A solve's answer can depend on what the engines solved before it; an engine
 * that must answer the same graph the same way every time is loaded with
 * {@link loadLayoutEngine}.
 * @param viz The initialized Graphviz instance.
 * @param instance The initialized libavoid Embind module.
 * @returns A complete layout operation: a graph and its options in, and what
 * the solve tells before it answers, as root options, to `tell`.
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
	return (
		graph: ElkNode,
		options: LayoutOptions,
		tell?: (told: LayoutOptions) => void,
	): ElkNode => {
		const stage = options[SOLVE_STAGE];
		if (stage === "track") return placeBlocks(viz, avoid, graph, true, tell);
		if (stage === "blocks") return placeBlocks(viz, avoid, graph, false, tell);
		throw new Error(
			`A solve names its stage in ${SOLVE_STAGE}, "track" or "blocks"; this one said ${String(stage)}.`,
		);
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

/** What loading the engines instantiated: each memory a module exports, and whether libavoid was marked. */
interface Loading {
	readonly memories: WebAssembly.Memory[];
	marked: boolean;
}

/**
 * The same instantiation, which instantiates libavoid with its unsatisfiable
 * constraints marked rather than thrown (`shared/rules/engine/unsatisfiable.ts`) and keeps
 * each memory a module exports.
 * @param instantiate `WebAssembly.instantiate`.
 * @param loading Where each memory is kept, and whether libavoid was marked.
 * @returns The instantiation, of the same type.
 */
function instantiating(
	instantiate: typeof WebAssembly.instantiate,
	loading: Loading,
): typeof WebAssembly.instantiate {
	return new Proxy(instantiate, {
		/**
		 * Instantiate, and keep what it exports of memory.
		 * @param target The instantiation.
		 * @param self Its receiver.
		 * @param args Its arguments: the module or its bytes, and the imports.
		 * @returns What it answered.
		 */
		async apply(target, self, args: unknown[]) {
			const [source, ...rest] = args;
			const bytes =
				source instanceof ArrayBuffer || ArrayBuffer.isView(source)
					? markingUnsatisfiable(source)
					: source;
			loading.marked ||= bytes !== source;
			const answered: unknown = await Reflect.apply(target, self, [bytes, ...rest]);
			loading.memories.push(...exportedMemories(answered));
			return answered;
		},
	});
}

/**
 * A streaming instantiation that reads the module's bytes whole and hands
 * them to an instantiation, so that one sees libavoid's bytes too.
 * @param instantiate The instantiation.
 * @returns The streaming instantiation.
 */
function streaming(
	instantiate: typeof WebAssembly.instantiate,
): typeof WebAssembly.instantiateStreaming {
	return async (source, imports) => {
		const response = await source;
		return instantiate(await response.arrayBuffer(), imports);
	};
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
 * is a few hundred kilobytes, which costs microseconds. libavoid is
 * instantiated with the constraints vpsc cannot satisfy marked where it meets
 * them, not thrown, which draws the same (`shared/rules/engine/unsatisfiable.ts`).
 * @param load Instantiates both engines, answering the Graphviz instance and
 * the initialized libavoid module. It must instantiate them itself: an engine
 * loaded earlier has nothing as loaded to go back to.
 * @returns The layout engine.
 * @throws {Error} When the load did not instantiate both engines, or the
 * libavoid it instantiated is not the build `shared/rules/engine/unsatisfiable.ts` edits.
 */
export async function loadLayoutEngine(
	load: () => Promise<readonly [Viz, unknown]>,
): Promise<LayoutEngine> {
	const loading: Loading = { memories: [], marked: false };
	const { memories } = loading;
	const { instantiate, instantiateStreaming } = WebAssembly;
	WebAssembly.instantiate = instantiating(instantiate, loading);
	WebAssembly.instantiateStreaming = streaming(WebAssembly.instantiate);
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
	if (!loading.marked) {
		throw new Error(
			"The libavoid it loaded is not the libavoid-js 0.5.0-beta.5 build whose unsatisfiable constraints shared/rules/engine/unsatisfiable.ts marks: read that edit again against the new build, or take it out.",
		);
	}
	const solve = createLayoutEngine(...loaded);
	const asLoaded = memories.map((memory) => ({ memory, held: heldBytes(memory) }));
	return (graph, options, tell) => {
		for (const { memory, held } of asLoaded) new Uint8Array(memory.buffer).set(held);
		return solve(graph, options, tell);
	};
}
