import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { createElement, type JSX, type ReactNode } from "react";
import type { SceneRequest } from "#ui/rules/architecture-model/scene.ts";
import { SHOP, shopRequest } from "#tests/ui/support/architecture-model/scene.ts";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
// Vite provides this module. The drawing query only needs a build to key its answers by.
await mock.module("virtual:archboard-renderer", () => ({ rendererBuild: "test" }));
// Each drawing here arrives when the test says so.
await mock.module("@archboard/renderer/browser", () => ({
	/**
	 * A renderer that never finishes.
	 * @returns A drawing step that stays pending.
	 */
	prepareContentHere: () => ({
		/**
		 * Stay pending.
		 * @returns A promise that never settles.
		 */
		draw: () => new Promise(() => undefined),
	}),
}));
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, renderHook, waitFor } = await import("@testing-library/react");
const { useAcceptedScene } = await import("#ui/hooks/architecture-model/use-accepted-scene.ts");
const { modelDrawingQuery } = await import("#ui/clients/architecture-model/drawing.ts");
const { EMPTY_DRAWING } = await import("#ui/rules/architecture-model/scene.ts");

const NOTHING: ReadonlySet<string> = new Set();

/**
 * Give a hook its query client.
 * @param client The query client.
 * @returns The wrapper.
 */
function withClient(client: InstanceType<typeof QueryClient>) {
	/**
	 * Provide the client.
	 * @param props The children.
	 * @param props.children The hook's host.
	 * @returns The provider.
	 */
	return function Wrapper({ children }: { children: ReactNode }): JSX.Element {
		return createElement(QueryClientProvider, { client }, children);
	};
}

/**
 * Let the drawing of a destination arrive.
 * @param client The query client.
 * @param asked The destination.
 * @param svg Its picture.
 */
async function draw(
	client: InstanceType<typeof QueryClient>,
	asked: SceneRequest,
	svg: string,
): Promise<void> {
	const { queryKey } = modelDrawingQuery(SHOP, asked.projection, "architecture");
	await act(async () => {
		client.setQueryData(queryKey, { ...EMPTY_DRAWING, svg });
		await new Promise((settled) => setTimeout(settled));
	});
}

afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

test("a drawing that arrives late never replaces a newer destination", async () => {
	const client = new QueryClient();
	const gateway = shopRequest({ scope: "Shop#Gateway" });
	const worker = shopRequest({ scope: "Shop#Worker" });
	await draw(client, gateway, "<svg>gateway</svg>");
	const pane = renderHook(({ asked }) => useAcceptedScene(asked, NOTHING), {
		initialProps: { asked: gateway },
		wrapper: withClient(client),
	});
	await waitFor(() => expect(pane.result.current.scene?.picture.svg).toBe("<svg>gateway</svg>"));
	const third = shopRequest();
	pane.rerender({ asked: worker });
	pane.rerender({ asked: third });
	expect(pane.result.current.pending).toBe(true);
	await draw(client, worker, "<svg>worker</svg>");
	expect(pane.result.current.scene?.picture.svg).toBe("<svg>gateway</svg>");
	await draw(client, third, "<svg>handler</svg>");
	expect(pane.result.current.scene?.picture.svg).toBe("<svg>handler</svg>");
	expect(pane.result.current.pending).toBe(false);
});

test("a pane is ready only once a picture stands for its destination", async () => {
	const client = new QueryClient();
	const gateway = shopRequest({ scope: "Shop#Gateway" });
	const pane = renderHook(() => useAcceptedScene(gateway, NOTHING), {
		wrapper: withClient(client),
	});
	expect(pane.result.current.ready).toBe(false);
	await draw(client, gateway, "<svg>gateway</svg>");
	expect(pane.result.current.ready).toBe(true);
});
