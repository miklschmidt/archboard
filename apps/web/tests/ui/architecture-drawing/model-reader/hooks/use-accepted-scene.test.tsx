import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { createElement, type JSX, type ReactNode } from "react";
import type { LayoutEngineName } from "@archboard/model/render-reply";
import type { SceneRequest } from "#ui/architecture-drawing/model-reader/rules/scene.ts";
import { SHOP, shopRequest } from "#tests/ui/support/model-reader/scene.ts";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
// Vite provides this module. The drawing query only needs a build to key its answers by.
await mock.module("virtual:archboard-renderer", () => ({ rendererBuild: "test" }));
/**
 * A renderer that never finishes.
 * @returns A drawing that stays pending.
 */
function neverDrawn(): Promise<unknown> {
	return new Promise(() => undefined);
}

/**
 * A renderer that fails.
 * @returns A failed drawing.
 */
function noRoute(): Promise<unknown> {
	return Promise.reject(new Error("no route"));
}

/**
 * A renderer that draws the worker.
 * @returns The drawing.
 */
function workerDrawn(): Promise<unknown> {
	return Promise.resolve({ ...EMPTY_DRAWING, svg: "<svg>worker</svg>" });
}

let renderer = neverDrawn;
// Each drawing here arrives when the test says so.
await mock.module("@archboard/renderer/browser", () => ({
	/**
	 * Nothing paints here.
	 * @returns Nothing.
	 */
	/**
	 * A renderer that does what the test asks.
	 * @returns A drawing step.
	 */
	prepareContentHere: () => ({
		/**
		 * Do what the test asks.
		 * @returns The test's answer.
		 */
		draw: () => renderer(),
	}),
}));
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, renderHook, waitFor } = await import("@testing-library/react");
const { useAcceptedScene } =
	await import("#ui/architecture-drawing/model-reader/hooks/use-accepted-scene.ts");
const { modelDrawingQuery } =
	await import("#ui/architecture-drawing/model-reader/access/clients/drawing.ts");
const { chooseLayoutEngine } =
	await import("#ui/architecture-drawing/canvas/picture/clients/layout-engine.ts");
const { EMPTY_DRAWING } = await import("#ui/architecture-drawing/model-reader/rules/scene.ts");

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
 * @param layout The engine that drew it.
 */
async function draw(
	client: InstanceType<typeof QueryClient>,
	asked: SceneRequest,
	svg: string,
	layout: LayoutEngineName = "blocks",
): Promise<void> {
	const { queryKey } = modelDrawingQuery(SHOP, asked.projection, "architecture", layout);
	await act(async () => {
		client.setQueryData(queryKey, { ...EMPTY_DRAWING, svg });
		await new Promise((settled) => setTimeout(settled));
	});
}

afterEach(() => {
	cleanup();
	renderer = neverDrawn;
	chooseLayoutEngine("blocks");
});
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

test("a drawing of one engine never answers for the other", async () => {
	const client = new QueryClient();
	const gateway = shopRequest({ scope: "Shop#Gateway" });
	await draw(client, gateway, "<svg>blocks</svg>");
	const pane = renderHook(() => useAcceptedScene(gateway, NOTHING), {
		wrapper: withClient(client),
	});
	await waitFor(() => expect(pane.result.current.scene?.picture.svg).toBe("<svg>blocks</svg>"));
	act(() => chooseLayoutEngine("track"));
	expect(pane.result.current.pending).toBe(true);
	expect(pane.result.current.scene?.picture.svg).toBe("<svg>blocks</svg>");
	await draw(client, gateway, "<svg>tracks</svg>", "track");
	expect(pane.result.current.scene?.picture.svg).toBe("<svg>tracks</svg>");
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

test("a failed drawing keeps the last picture, stops waiting, and draws on retry", async () => {
	const client = new QueryClient();
	const gateway = shopRequest({ scope: "Shop#Gateway" });
	const worker = shopRequest({ scope: "Shop#Worker" });
	await draw(client, gateway, "<svg>gateway</svg>");
	const pane = renderHook(({ asked }) => useAcceptedScene(asked, NOTHING), {
		initialProps: { asked: gateway },
		wrapper: withClient(client),
	});
	await waitFor(() => expect(pane.result.current.scene?.picture.svg).toBe("<svg>gateway</svg>"));
	renderer = noRoute;
	pane.rerender({ asked: worker });
	await waitFor(() => expect(pane.result.current.failure?.message).toBe("no route"));
	expect(pane.result.current).toMatchObject({ pending: false, leaving: null });
	expect(pane.result.current.scene?.picture.svg).toBe("<svg>gateway</svg>");
	renderer = workerDrawn;
	await act(async () => {
		await pane.result.current.retry();
	});
	await waitFor(() => expect(pane.result.current.scene?.picture.svg).toBe("<svg>worker</svg>"));
	expect(pane.result.current.failure).toBeNull();
});

test("a destination whose read failed leaves the picture where it is", async () => {
	const client = new QueryClient();
	const gateway = shopRequest({ scope: "Shop#Gateway" });
	await draw(client, gateway, "<svg>gateway</svg>");
	const pane = renderHook(({ asked }) => useAcceptedScene(asked, NOTHING), {
		initialProps: { asked: gateway },
		wrapper: withClient(client),
	});
	await waitFor(() => expect(pane.result.current.scene?.picture.svg).toBe("<svg>gateway</svg>"));
	const unread = { ...shopRequest({ scope: "Shop#Worker" }, false), failed: true };
	pane.rerender({ asked: unread });
	expect(pane.result.current).toMatchObject({ pending: false, leaving: null });
	expect(pane.result.current.scene?.picture.svg).toBe("<svg>gateway</svg>");
});
