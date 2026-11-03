import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { projectModel, type Model } from "@archboard/model/content";
import { SHOP } from "#tests/ui/support/architecture-model/scene.ts";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
await mock.module("virtual:archboard-renderer", () => ({ rendererBuild: "test" }));
let drawing = Promise.withResolvers<unknown>();
await mock.module("@archboard/renderer/browser", () => ({
	/**
	 * Hold both drawings until the test releases them.
	 * @returns A drawing step.
	 */
	prepareContentHere: () => ({
		/**
		 * Wait for the drawing to arrive.
		 * @returns The controlled drawing.
		 */
		draw: () => drawing.promise,
	}),
}));
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useFlowReadings } = await import("#ui/hooks/architecture-model/use-flow-readings.ts");
const { EMPTY_DRAWING } = await import("#ui/rules/architecture-model/scene.ts");

afterEach(() => {
	cleanup();
	drawing = Promise.withResolvers<unknown>();
});
afterAll(() => GlobalRegistrator.unregister());

const MODEL: Model = {
	...SHOP,
	collections: [
		{
			schemaVersion: 1,
			id: "Behavior",
			name: "Behavior",
			file: "behavior.flows.json",
			flows: [
				{
					id: "Shop#Parse",
					name: "Parse",
					participants: ["Shop#Gateway", "Shop#Worker"],
					steps: [
						{
							id: "Shop#Send",
							from: "Shop#Gateway",
							to: "Shop#Worker",
							label: "send",
							kind: "sync",
						},
					],
				},
			],
		},
	],
};

test.each(["scope", "history entry", "unmount"])(
	"a pending flow open is canceled by a change of %s",
	async (change) => {
		const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
		const showFlow = mock(() => undefined);
		const camera = {
			/**
			 * Read the pane size.
			 * @returns The pane size.
			 */
			measure: () => ({ width: 1048, height: 748 }),
		};
		/**
		 * Supply the drawing cache.
		 * @param props The hook host.
		 * @param props.children The hook.
		 * @returns The provider.
		 */
		const wrapper = ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client }, children);
		const initialProps = { structure: projectModel(MODEL), entry: "first" };
		const pane = renderHook(
			({ structure, entry }) =>
				useFlowReadings({ model: MODEL, entry, structure, camera, showFlow }),
			{
				initialProps,
				wrapper,
			},
		);
		act(() => pane.result.current.openFlow("Shop#Parse"));
		if (change === "scope")
			pane.rerender({ ...initialProps, structure: projectModel(MODEL, "Shop#Worker") });
		else if (change === "history entry") pane.rerender({ ...initialProps, entry: "second" });
		else pane.unmount();
		await act(async () => {
			drawing.resolve({ ...EMPTY_DRAWING, width: 600, height: 400 });
			await Promise.all(
				client
					.getQueryCache()
					.getAll()
					.map((query) => query.promise)
					.filter((promise) => promise !== undefined),
			);
		});
		expect(showFlow).not.toHaveBeenCalled();
		if (change !== "unmount") {
			// The next flow request still opens, even when its drawings are already cached.
			await act(async () => {
				pane.result.current.openFlow("Shop#Parse");
			});
			expect(showFlow).toHaveBeenCalledWith("Shop#Parse", "sequence");
		}
		client.clear();
	},
);
