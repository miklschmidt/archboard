// The findings of module depth join the findings of Where the map and the code disagree, each
// naming the export it judges, in both layouts (TASK-646.07). A finding with no evidence reads no
// source, so the page reads nothing.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, render } = await import("@testing-library/react");
const { ModelCodeEvidence } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelCodeFindings.tsx");
const { chooseCodeFindingsLayout } =
	await import("#ui/architecture-drawing/model-reader/reading/clients/code-findings-layout.ts");

type Reading = NonNullable<ComponentProps<typeof ModelCodeEvidence>["reading"]>;

const clients: InstanceType<typeof QueryClient>[] = [];
const TIMING = { kind: "node", id: "Shop#Timing", name: "Timing" } as const;

afterEach(() => {
	cleanup();
	chooseCodeFindingsLayout("cards");
	for (const client of clients.splice(0)) client.clear();
});
afterAll(async () => {
	await GlobalRegistrator.unregister();
});

/** A pass that found a value Timing exports, a shallow Timing, and a binding that misses its symbol. */
const READING: Reading = {
	model: "Shop",
	state: "Current",
	revision: { digest: "a".repeat(64), files: [] },
	checkedAt: "2026-11-19T12:00:00.000Z",
	findings: [
		{
			code: "MODULE_SHALLOW",
			severity: "information",
			file: "timing.module.json",
			subject: TIMING,
			message: "Timing is shallow.",
		},
		{
			code: "EXPOSED_VALUE",
			severity: "warning",
			file: "timing.module.json",
			subject: TIMING,
			export: "RETRY_MS",
			message: "Timing exports the value RETRY_MS, which code outside it reads.",
		},
		{
			code: "BINDING_SYMBOL_MISSING",
			severity: "warning",
			file: "timing.module.json",
			subject: TIMING,
			message: "The binding of Timing names a symbol that its file does not define.",
		},
	],
};

/** Nothing happens: no finding is chosen here. */
function nothing(): void {
	// No finding is chosen.
}

/**
 * Mount the findings of the pass.
 */
function mount(): void {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	render(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ModelCodeEvidence, {
				vault: "/work/shop/.archboard/vault",
				reading: READING,
				check: { status: "checking" },
				ends: { nodes: [TIMING], edges: [] },
				onShow: nothing,
			}),
		),
	);
}

/**
 * The findings on screen, each with the export it names.
 * @param slot The part each finding is drawn as.
 * @returns Each finding's code and export.
 */
function shown(
	slot: "code-finding" | "code-finding-row",
): (readonly [string | undefined, string | undefined])[] {
	return [...document.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`)].map((one) => [
		one.dataset["findingCode"],
		one.querySelector('[data-slot="code-finding-export"]')?.textContent.replace("exports ", ""),
	]);
}

/** The findings in their order: warnings first, each with the export it names. */
const ORDER = [
	["EXPOSED_VALUE", "RETRY_MS"],
	["BINDING_SYMBOL_MISSING", undefined],
	["MODULE_SHALLOW", undefined],
] as const;

test("a finding of module depth stands among the others, warnings first, naming its export", async () => {
	mount();
	expect(shown("code-finding")).toEqual(ORDER.map((one) => [...one]));
	await act(async () => {
		chooseCodeFindingsLayout("list");
	});
	expect(shown("code-finding-row")).toEqual(ORDER.map((one) => [...one]));
});
