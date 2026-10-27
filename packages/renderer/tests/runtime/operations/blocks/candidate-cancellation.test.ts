// Blocks asks one required solve. Its host failures reach the render caller.
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { installBunHost } from "#runtime/services/bun-host.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { installRendererHost, rendererHost } from "#shared/rules/render/host.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

test.each(["rejected", "thrown"] as const)(
	"a %s block solve fails the render without speculative work",
	async (failureMode) => {
		installBunHost();
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
				if (failureMode === "thrown") throw failure;
				return Promise.reject(failure);
			},
		});
		try {
			const outcome = await renderArchitecture({
				policy: DEFAULT_SEMANTIC_POLICY,
				content,
				layout: "blocks",
				theme: "light",
			}).catch((error: unknown) => error);
			// The core carries the host's failure out by its words.
			expect(outcome).toHaveProperty("message", failure.message);
			expect(signals).toHaveLength(1);
			expect(signals[0]).toBeInstanceOf(AbortSignal);
		} finally {
			installRendererHost(host);
		}
	},
);
