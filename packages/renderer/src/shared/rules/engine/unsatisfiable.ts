// libavoid's nudging (orthogonal.cpp, `nudgeOrthogonalRoutes`) tries every
// pair of free segments in a region as an equality, and solves the region
// again with vpsc for each. Where the pair cannot be met, vpsc's
// `Block::findMinLMBetween` finds no constraint to split the block on and
// throws `UnsatisfiableException`, and `IncSolver::satisfy` catches it, marks
// the constraint unsatisfiable and goes on to the next (vpsc.cpp). One Blocks
// render threw hundreds of thousands of them, and each throw leaves the
// WebAssembly through the engine's JavaScript, where Bun's JavaScriptCore
// records a stack trace for it: more than half of a Blocks render's time on
// the boards that route most trunks (TASK-377).
//
// This takes the throw out of the pinned libavoid-js release's WebAssembly.
// `satisfy` is compiled with `findMinLMBetween` inlined into it; the branch
// that builds and throws the exception becomes what the catch does with it,
// `v->unsatisfiable = true` and on to the loop's next constraint, and the rest
// of the branch, never reached now, becomes no-ops. The exception's own path
// of constraints, which the catch lengthens by one and then frees, was read
// by nothing. Every drawing of both vaults on both engines is the same byte
// for byte with and without it.
//
// The edit is made to the exact bytes it was read from: any other module,
// Graphviz's or another libavoid build's, is instantiated as it is.

/**
 * libavoid-js 0.5.0-beta.5's `dist/libavoid.wasm`, by its length and its
 * 32-bit FNV-1a: a browser page served from another host than localhost has
 * no `crypto.subtle`, and this only tells that build from any other.
 */
const LIBAVOID = { length: 492_029, fnv1a: 0xb4_fe_fb_c6 } as const;

/**
 * Where the branch that throws stands in that module: from the first byte of
 * the `if (min_lm == nullptr)` body to the `end` that closes it.
 */
const THROWING_BRANCH = { start: 272_151, end: 272_289 } as const;

/**
 * What the catch does, in its place: `local.get 6` (the constraint `v`),
 * `i32.const 1`, `i32.store8 offset=30` (`v->unsatisfiable`), and `br 9`, out
 * to the end of the loop's body, where the catch goes too.
 */
const MARKED = [0x20, 0x06, 0x41, 0x01, 0x3a, 0x00, 0x1e, 0x0c, 0x09] as const;

/** WebAssembly's `nop`. */
const NOP = 0x01;

/**
 * Some bytes' 32-bit FNV-1a.
 * @param bytes The bytes.
 * @returns The hash.
 */
function fnv1a(bytes: Uint8Array): number {
	let hash = 0x81_1c_9d_c5;
	for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01_00_01_93) >>> 0;
	return hash;
}

/**
 * A module's bytes with libavoid's unsatisfiable constraints marked where vpsc
 * meets them instead of thrown, when the module is the libavoid this was read
 * from; any other module's bytes as they are.
 * @param source The module's bytes; they are not changed.
 * @returns The bytes to instantiate.
 */
function markingUnsatisfiable(
	source: ArrayBuffer | ArrayBufferView,
): ArrayBuffer | ArrayBufferView {
	if (source.byteLength !== LIBAVOID.length) return source;
	const bytes = ArrayBuffer.isView(source)
		? new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice()
		: new Uint8Array(source).slice();
	if (fnv1a(bytes) !== LIBAVOID.fnv1a) return source;
	bytes.fill(NOP, THROWING_BRANCH.start, THROWING_BRANCH.end);
	bytes.set(MARKED, THROWING_BRANCH.start);
	return bytes;
}

export { markingUnsatisfiable };
