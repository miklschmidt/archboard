// Pure layout shared by the Bun and browser workers. Hosts initialize
// Graphviz through `loadLayoutEngine`, which puts back what it held as loaded
// before every solve.
import type { ElkNode, LayoutOptions } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { placeBlocks } from "#shared/rules/blocks/tree/place.ts";
import { SOLVE_STAGE } from "#shared/rules/render/host.ts";

/**
 * Bind an initialized Graphviz without I/O or environment-specific loading.
 * A solve's answer can depend on what Graphviz solved before it; an engine
 * that must answer the same graph the same way every time is loaded with
 * {@link loadLayoutEngine}.
 * @param viz The initialized Graphviz instance.
 * @returns A complete layout operation.
 */
export function createLayoutEngine(viz: Viz) {
	return (graph: ElkNode, options: LayoutOptions): ElkNode => {
		const stage = options[SOLVE_STAGE];
		if (stage === "track") return placeBlocks(viz, graph, true);
		if (stage === "blocks") return placeBlocks(viz, graph);
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

/**
 * The same instantiation, which keeps each memory a module exports.
 * @param instantiate `WebAssembly.instantiate`.
 * @param memories Where each memory is kept.
 * @returns The instantiation, of the same type.
 */
function instantiating(
	instantiate: typeof WebAssembly.instantiate,
	memories: WebAssembly.Memory[],
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
			const answered: unknown = await Reflect.apply(target, self, args);
			memories.push(...exportedMemories(answered));
			return answered;
		},
	});
}

/**
 * A streaming instantiation that reads the module's bytes whole and hands
 * them to an instantiation, so that one sees every module's memory too.
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
 * Load Graphviz and bind the layout, every solve starting from what Graphviz
 * held when it was loaded.
 *
 * Putting back what Graphviz held as loaded, its allocator included, hands
 * every solve's objects the same places, so a solve's answer is decided by
 * its graph and options alone, not by which worker answered it or what that
 * worker solved before. What is put back is a few hundred kilobytes, which
 * costs microseconds. The renderer core, which routes the trunks, holds no
 * state between calls, and a host loads it before this (ADR 0057).
 * @param load Instantiates Graphviz, answering its instance. It must
 * instantiate it itself: an engine loaded earlier has nothing as loaded to
 * go back to.
 * @returns The layout engine.
 * @throws {Error} When the load did not instantiate one WebAssembly memory.
 */
export async function loadLayoutEngine(load: () => Promise<Viz>): Promise<LayoutEngine> {
	const memories: WebAssembly.Memory[] = [];
	const { instantiate, instantiateStreaming } = WebAssembly;
	WebAssembly.instantiate = instantiating(instantiate, memories);
	WebAssembly.instantiateStreaming = streaming(WebAssembly.instantiate);
	let viz: Viz;
	try {
		viz = await load();
	} finally {
		WebAssembly.instantiate = instantiate;
		WebAssembly.instantiateStreaming = instantiateStreaming;
	}
	if (memories.length !== 1) {
		throw new Error(
			`Loading the layout engine instantiated ${memories.length} WebAssembly memories where Graphviz makes one: load Graphviz in the call, and the renderer core before it.`,
		);
	}
	const solve = createLayoutEngine(viz);
	const asLoaded = memories.map((memory) => ({ memory, held: heldBytes(memory) }));
	return (graph, options) => {
		for (const { memory, held } of asLoaded) new Uint8Array(memory.buffer).set(held);
		return solve(graph, options);
	};
}
