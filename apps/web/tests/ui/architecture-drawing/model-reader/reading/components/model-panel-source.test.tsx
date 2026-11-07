import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import { projectModel, type Model } from "@archboard/model/content";
import { SHOP } from "#tests/ui/support/model-reader/scene.ts";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

/**
 * This owner reads references without following them.
 * @returns No navigation actions.
 */
function locationDouble() {
	return {};
}
await mock.module("#ui/panes/reading-routing/hooks/use-model-location.ts", () => ({
	useModelLocation: locationDouble,
}));
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, render, waitFor } = await import("@testing-library/react");
const { ModelPanelSubject } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelPanelSubject.tsx");

type Props = ComponentProps<typeof ModelPanelSubject>;
const realFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];
const CHECKPOINT = "b".repeat(40);

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	globalThis.fetch = realFetch;
});
afterAll(async () => {
	await Bun.sleep(1);
	await GlobalRegistrator.unregister();
});

/** No action in this owner moves the reader. */
function nothing(): void {}

/**
 * Expansion is unavailable for a removed module.
 * @returns False.
 */
function noToggle(): boolean {
	return false;
}

/**
 * This owner does not draw code paths.
 * @returns No path.
 */
function noPath(): undefined {
	return undefined;
}

test("a removed module reads its change partners and references from its retained source", async () => {
	const source: Model = {
		...SHOP,
		checkpoint: {
			id: CHECKPOINT,
			model: "Shop",
			state: SHOP.selectedState,
			revision: SHOP.revision,
			createdAt: "2026-11-01T12:00:00.000Z",
			request: {
				target: "current",
				operationId: "retain-source",
				writer: "fixture-agent",
				doing: "Retain the source of a removed module",
				expectedRevision: SHOP.revision.digest,
				dependencies: [],
			},
			sources: [],
			publication: "saved-locally",
		},
		modules: SHOP.modules.map((module) => ({
			...module,
			binding: { repo: "example/shop", path: "src/worker.ts" },
			references: [
				{ repo: "example/ledger", model: "Ledger", state: "Current", subject: "Ledger#API" },
			],
		})),
	};
	const model: Model = {
		...SHOP,
		modules: SHOP.modules.filter(({ id }) => id !== "Shop#Queue" && id !== "Shop#Worker"),
	};
	const requested: URL[] = [];
	globalThis.fetch = Object.assign(
		async (input: Parameters<typeof fetch>[0]) => {
			requested.push(new URL(input instanceof Request ? input.url : input, "http://localhost"));
			return Response.json({ success: false, error: "Source unavailable" }, { status: 503 });
		},
		{ preconnect: realFetch.preconnect },
	);
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	const ids = new Set(["Shop#Worker"]);
	const selection: Props["selection"] = {
		ids,
		select: nothing,
		selectMany: nothing,
		clear: nothing,
		seed: nothing,
	};
	render(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ModelPanelSubject, {
				vault: "/work/shop/.archboard/vault",
				paneId: "A",
				model,
				projection: projectModel(model, null, null, {}, source),
				scope: null,
				selection,
				code: null,
				pathOf: noPath,
				onCodeTargetNotice: nothing,
				onOpen: nothing,
				onReveal: nothing,
				onRevealFlow: nothing,
				onToggle: noToggle,
				context: null,
				flowHead: null,
				line: { onShow: nothing, onAbout: nothing },
			}),
		),
	);
	await waitFor(() => expect(requested).toHaveLength(2));
	expect(requested.map((url) => url.pathname).toSorted()).toEqual([
		"/api/architecture/locality",
		"/api/architecture/module",
	]);
	for (const url of requested) {
		expect(url.searchParams.get("checkpoint")).toBe(CHECKPOINT);
		expect(url.searchParams.has("state")).toBe(false);
	}
});
