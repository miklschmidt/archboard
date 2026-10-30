import { loadCore } from "#runtime/services/core.ts";

// (module (func (export "trap") unreachable)). A real WASM trap, with no
// extra Rust build or test-only panic entry in the shipped core.
const trapModule = new WebAssembly.Module(
	new Uint8Array([
		0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 7, 8, 1, 4, 116, 114, 97, 112, 0, 0,
		10, 5, 1, 3, 0, 0, 11,
	]),
);
const trap = new WebAssembly.Instance(trapModule).exports["trap"] as () => never;
const phase = process.argv[2];
let armed = false;
let trapped = false;
let entriesAfterTrap = 0;
let solves = 0;
const uncaught: unknown[] = [];
process.on("uncaughtException", (error) => uncaught.push(error));

// Inject below the generated glue's guard. Everything else, including the
// future scheduler and its closures, is the real core built for this checkout.
WebAssembly.Instance = new Proxy(WebAssembly.Instance, {
	construct(target, args: ConstructorParameters<typeof WebAssembly.Instance>) {
		const instance = new target(...args);
		const exports = Object.fromEntries(
			Object.entries(instance.exports).map(([name, value]) => [
				name,
				typeof value !== "function"
					? value
					: new Proxy(value, {
							apply(fn, receiver, values: unknown[]) {
								if (trapped) entriesAfterTrap++;
								const selected =
									phase === "resume"
										? name.includes("__invoke_")
										: name === (phase === "layout" ? "layOutBoard" : "render");
								if (armed && selected) {
									trapped = true;
									trap();
								}
								return Reflect.apply(fn, receiver, values);
							},
						}),
			]),
		);
		return new Proxy(instance, {
			get(value, key) {
				return key === "exports" ? exports : Reflect.get(value, key, value);
			},
		});
	},
});

const core = loadCore();
const request = JSON.stringify({
	grammar: "architecture",
	// Track asks the host to solve even this one-card fixture, so the resume trap runs.
	layout: "track",
	content: { nodes: [{ id: "a", name: "A", kind: "service" }] },
	policy: { levels: [], nodeKinds: {}, relationshipKinds: {} },
	clock: { farViewSwapMs: 100, trafficSpeed: 100, cycleCapMs: 1000 },
});
const host = {
	solve: async () => {
		solves++;
		armed = true;
		return "{}";
	},
	icons: () => ({}),
};

/** Capture the caller's named refusal, including a synchronous layout failure. */
async function refusal(call: () => unknown): Promise<unknown> {
	try {
		await call();
		return { resolved: true };
	} catch (error) {
		return error instanceof Error && "code" in error
			? { name: error.name, code: error.code }
			: { unnamed: String(error) };
	}
}

armed = phase !== "resume";
const first =
	phase === "layout"
		? refusal(() => core.layOutBoard("{}"))
		: refusal(() => core.render(request, host));
const pending = refusal(() => core.render(request, host));
const failures = await Promise.all([first, pending]);
failures.push(await refusal(() => core.render(request, host)));
// A late solve callback or finalizer must not enter the instance either.
await new Promise<void>((resolve) => setImmediate(resolve));
Bun.gc(true);
console.log(JSON.stringify({ failures, trapped, entriesAfterTrap, solves, uncaught }));
