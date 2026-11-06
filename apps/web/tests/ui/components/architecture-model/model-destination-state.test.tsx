import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import type { Model } from "@archboard/model/content";
import { SHOP, shopRequest } from "#tests/ui/support/architecture-model/scene.ts";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

let canGoBack = true;
const went: string[] = [];
const compared: string[] = [];
const retained: string[][] = [];

/** Go back, on the record. */
function goBack(): void {
	went.push("back");
}

/** Open the roots, on the record. */
function openRoot(): void {
	went.push("root");
}

/**
 * Change the comparison, on the record.
 * @param against The comparison.
 */
function compareAgainst(against: string): void {
	compared.push(against);
}

/**
 * Open a retained reading, on the record.
 * @param checkpoint The reading.
 * @param module The module.
 */
function openRetained(checkpoint: string, module: string): void {
	retained.push([checkpoint, module]);
}

/**
 * Answer whether a reader can go back.
 * @returns The test's answer.
 */
function backOffered(): boolean {
	return canGoBack;
}

/**
 * The router's history.
 * @returns The router.
 */
function routerDouble() {
	return { history: { back: goBack, canGoBack: backOffered } };
}

/**
 * The location's actions.
 * @returns The actions.
 */
function locationDouble() {
	return { compareAgainst, open: openRoot, openRetained };
}

/** Stand in for Retry where a test does not press it. */
function nothing(): void {
	// The test presses nothing.
}

await mock.module("@tanstack/react-router", () => ({ useRouter: routerDouble }));
await mock.module("#ui/panes/reading-routing/hooks/use-model-location.ts", () => ({
	useModelLocation: locationDouble,
}));
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, fireEvent, render, screen, waitFor } = await import("@testing-library/react");
const { ModelDestinationNotice, ModelUnavailableReading } =
	await import("#ui/components/architecture-model/ModelDestinationState.tsx");

const VAULT = "/work/shop/.archboard/vault";
const CHECKPOINT = "a".repeat(40);
const RETIRED: Model = { ...SHOP, manifest: { ...SHOP.manifest, retiredIds: ["Shop#Old"] } };
const COMPARED: Model = {
	...SHOP,
	comparison: {
		reason: "predecessor",
		against: null,
		revision: SHOP.revision,
		interfaceChanges: { changed: [], unchanged: [] },
		interfaceMeasures: { states: [], containers: [] },
		subjects: [],
	},
};

/**
 * Render a part with a query client.
 * @param element The part.
 * @returns The rendering.
 */
function mount(element: ReactElement) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(createElement(QueryClientProvider, { client }, element));
}

/**
 * Answer the retained search.
 * @param answer The reply.
 * @param status Its status.
 */
function answerRetained(answer: unknown, status = 200): void {
	spyOn(globalThis, "fetch").mockResolvedValue(Response.json(answer, { status }));
}

/**
 * Render what a removed module says.
 * @returns The rendering.
 */
function mountRemoved() {
	const request = { ...shopRequest({ scope: "Shop#Old" }), model: RETIRED, grammar: null };
	return mount(createElement(ModelUnavailableReading, { vault: VAULT, paneId: "A", request }));
}

/**
 * Find an action.
 * @param slot Its slot.
 * @returns The action, when it is offered.
 */
function action(slot: string): Element | null {
	return document.querySelector(`[data-slot="${slot}"]`);
}

afterEach(() => {
	cleanup();
	mock.restore();
	canGoBack = true;
	went.length = 0;
	compared.length = 0;
	retained.length = 0;
});
afterAll(() => GlobalRegistrator.unregister());

test("a failed drawing offers Retry and Back, and a way out when a comparison can be what failed", () => {
	const onRetry = mock(nothing);
	const request = { ...shopRequest({ scope: "Shop#Worker" }), model: COMPARED };
	mount(
		createElement(ModelDestinationNotice, {
			paneId: "A",
			request,
			failure: new Error("no route"),
			onRetry,
			waiting: false,
		}),
	);
	expect(screen.getByRole("alert").getAttribute("data-code")).toBe("DRAW_FAILED");
	fireEvent.click(action("model-retry")!);
	fireEvent.click(action("model-back")!);
	fireEvent.click(action("model-show-plain")!);
	expect(onRetry).toHaveBeenCalledTimes(1);
	expect(went).toEqual(["back"]);
	expect(compared).toEqual(["after"]);
});

test("a reading with no comparison and no history offers neither a way out nor Back", () => {
	canGoBack = false;
	mount(
		createElement(ModelDestinationNotice, {
			paneId: "A",
			request: shopRequest({ scope: "Shop#Worker" }),
			failure: new Error("no route"),
			onRetry: nothing,
			waiting: false,
		}),
	);
	expect(action("model-retry")).not.toBeNull();
	expect(action("model-back")).toBeNull();
	expect(action("model-show-plain")).toBeNull();
});

test("a removed module offers its retained reading", async () => {
	answerRetained({
		success: true,
		retained: { checkpoint: CHECKPOINT, name: "Old", createdAt: "2026-10-29T02:06:58.635Z" },
	});
	mountRemoved();
	await waitFor(() => expect(action("model-open-retained")).not.toBeNull());
	expect(action("model-missing-scope")).toBeNull();
	fireEvent.click(action("model-open-retained")!);
	expect(retained).toEqual([[CHECKPOINT, "Shop#Old"]]);
});

test("a removed module that no reading holds still has a way on", async () => {
	answerRetained({ success: true, retained: null });
	mountRemoved();
	await waitFor(() => expect(action("model-removed-module")?.textContent).toContain("Shop#Old"));
	expect(action("model-open-root")).not.toBeNull();
	expect(action("model-open-retained")).toBeNull();
});

test("a failed search for a retained reading can be tried again", async () => {
	answerRetained({ success: false, code: "ARCHIVE_UNREADABLE", error: "no" }, 422);
	mountRemoved();
	await waitFor(() => expect(action("model-retry")).not.toBeNull());
	expect(action("model-open-root")).not.toBeNull();
});

test("a scope that this model never retired is only absent", () => {
	const request = { ...shopRequest({ scope: "Shop#Never" }), grammar: null };
	mount(createElement(ModelUnavailableReading, { vault: VAULT, paneId: "A", request }));
	expect(action("model-missing-scope")).not.toBeNull();
	expect(action("model-removed-module")).toBeNull();
});
