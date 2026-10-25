// The block chooser's cancellation must reach the installed host. A failed
// required solve releases its speculative candidates through that same signal.
import { expect, test } from "bun:test";
import { diagramTextWidth, renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { installRendererHost, rendererHost } from "#shared/rules/render/host.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

test("a failed required block solve cancels the speculative solves through the host", async () => {
	diagramTextWidth("Warm", { family: "Inter", weight: 400 }, 12);
	const host = rendererHost();
	const signals: (AbortSignal | undefined)[] = [];
	const failure = new Error("The required candidate failed");
	const content = orderedFixture({
		nodes: [
			{ id: "one", name: "One source", kind: "service" },
			{ id: "two", name: "Another source", kind: "service" },
			{ id: "target", name: "Target", kind: "service" },
			{ id: "dest", name: "Destination", kind: "module", parent: "target" },
			...(["one", "two"] as const).flatMap((parent) =>
				[1, 2].map((index) => ({
					id: `${parent}${index}`,
					name: `Source ${parent} ${index}`,
					kind: "module",
					parent,
				})),
			),
		],
		edges: ["one1", "one2", "two1", "two2"].map((from, index) => ({
			id: `edge${index}`,
			from,
			to: "dest",
			kind: "call",
			label: "Call destination",
		})),
	});
	installRendererHost({
		...host,
		solve: (_graph, signal) => {
			signals.push(signal);
			if (signals.length === 1) return Promise.reject(failure);
			return new Promise((_resolve, reject) => {
				signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
			});
		},
	});
	try {
		const outcome = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			layout: "blocks",
			theme: "light",
		}).catch((error: unknown) => error);
		expect(outcome).toBe(failure);
		// Two joining source blocks produce several candidates before the first
		// failure is observed. Passing no signal would leave these jobs queued.
		expect(signals.length).toBeGreaterThan(2);
		expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
		expect(signals.slice(1).every((signal) => signal?.aborted === true)).toBe(true);
	} finally {
		installRendererHost(host);
	}
});
