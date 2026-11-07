// Where the map and the code disagree: the findings of a pass one at a time, warnings first, with a
// pager that selects each finding's subject, and the source lines round a finding's evidence with
// that line marked. The server's route answers the lines, and here a stub answers in its place.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { ModelCodeEvidence } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelCodeFindings.tsx");

type Props = ComponentProps<typeof ModelCodeEvidence>;
type Reading = NonNullable<Props["reading"]>;

const realFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];
const VAULT = "/work/shop/.archboard/vault";

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	globalThis.fetch = realFetch;
});
afterAll(async () => {
	await Bun.sleep(1);
	await GlobalRegistrator.unregister();
});

/** Where the gateway's code calls the worker. */
const CALL = {
	kind: "call",
	resolution: "resolved",
	from: "Shop#Gateway",
	to: "Shop#Worker",
	repo: "example/shop",
	path: "src/gateway.ts",
	line: 21,
	symbol: "work",
} as const;

/** A pass with an information first and two warnings after it, as the server keeps them. */
const READING: Reading = {
	model: "Shop",
	state: "Current",
	revision: { digest: "a".repeat(64), files: [] },
	checkedAt: "2026-11-01T12:00:00.000Z",
	findings: [
		{
			code: "EXPOSED_UNUSED",
			severity: "information",
			file: "modules/worker.json",
			subject: { kind: "node", id: "Shop#Worker", name: "Worker" },
			message: "Worker exposes run, and no file outside it uses it.",
		},
		{
			code: "RELATIONSHIP_UNDRAWN",
			severity: "warning",
			file: "modules/worker.json",
			subject: { kind: "node", id: "Shop#Worker", name: "Worker" },
			message: "The code of Gateway reaches Worker. No relationship joins these modules.",
			evidence: [CALL],
		},
		{
			code: "BINDING_SYMBOL_MISSING",
			severity: "warning",
			file: "modules/gateway.json",
			subject: { kind: "node", id: "Shop#Gateway", name: "Gateway" },
			message: "The binding of Gateway names a symbol that its file does not define.",
		},
	],
};

const ENDS: Props["ends"] = {
	nodes: [
		{ id: "Shop#Gateway", name: "Gateway" },
		{ id: "Shop#Worker", name: "Worker" },
	],
	edges: [],
};

/**
 * Answer every read of source lines as a test says, and keep what was asked.
 * @param reply The answer.
 * @returns The addresses asked for.
 */
function answering(reply: () => Response): string[] {
	const asked: string[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL) => {
			asked.push(input instanceof Request ? input.url : input.toString());
			return reply();
		},
		{ preconnect: realFetch.preconnect },
	);
	return asked;
}

/**
 * Mount the findings.
 * @returns The subjects that the pager selected, in turn.
 */
function mount(): (string | null)[] {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	const shown: (string | null)[] = [];
	render(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(ModelCodeEvidence, {
				vault: VAULT,
				reading: READING,
				ends: ENDS,
				/**
				 * Report the subject a step selected.
				 * @param id The subject, or null for the whole model.
				 */
				onShow: (id) => {
					shown.push(id);
				},
			}),
		),
	);
	return shown;
}

/**
 * The words of a part of the findings.
 * @param slot The part.
 * @returns Its words, or null when it is absent.
 */
function words(slot: string): string | null {
	return document.querySelector(`[data-slot="${slot}"]`)?.textContent ?? null;
}

/**
 * What the card shows now.
 * @returns The code of its finding, where the pager stands and the route.
 */
function card(): { code: string | null; position: string | null; route: string | null } {
	const finding = document.querySelector('[data-slot="code-finding"]');
	return {
		code: finding?.getAttribute("data-finding-code") ?? null,
		position: words("code-evidence-position"),
		route: words("code-finding-route"),
	};
}

/**
 * Press a key of the pager.
 * @param slot The key.
 */
async function press(slot: "code-evidence-next" | "code-evidence-back"): Promise<void> {
	await act(async () => {
		fireEvent.click(document.querySelector(`[data-slot="${slot}"]`)!);
	});
}

test("the pager walks the warnings first, and each step selects the finding's subject", async () => {
	answering(() => Response.json({ error: "no" }, { status: 404 }));
	const shown = mount();
	expect(card()).toEqual({
		code: "RELATIONSHIP_UNDRAWN",
		position: "1 of 3",
		route: "GatewaytoWorker",
	});
	await press("code-evidence-next");
	expect(card()).toEqual({ code: "BINDING_SYMBOL_MISSING", position: "2 of 3", route: "Gateway" });
	await press("code-evidence-next");
	expect(card().code).toBe("EXPOSED_UNUSED");
	await press("code-evidence-next");
	expect(card().position).toBe("1 of 3");
	await press("code-evidence-back");
	expect(card().position).toBe("3 of 3");
	expect(shown).toEqual(["Shop#Gateway", "Shop#Worker", "Shop#Worker", "Shop#Worker"]);
});

test("the excerpt marks the evidence line among the lines round it", async () => {
	const asked = answering(() =>
		Response.json({
			success: true,
			repo: CALL.repo,
			path: CALL.path,
			line: CALL.line,
			first: 18,
			lines: ["a", "b", "c", "work();", "e", "f", "g"],
		}),
	);
	mount();
	await waitFor(() => expect(document.querySelector("mark")).not.toBeNull());
	const lines = [...document.querySelectorAll("[data-line]")];
	expect(lines.map((line) => line.getAttribute("data-line"))).toEqual([
		"18",
		"19",
		"20",
		"21",
		"22",
		"23",
		"24",
	]);
	expect(document.querySelectorAll("mark")).toHaveLength(1);
	expect(document.querySelector("mark")?.getAttribute("data-line")).toBe("21");
	expect(document.querySelector("mark")?.textContent).toContain("work();");
	const address = new URL(asked[0]!, "http://archboard.invalid");
	expect(address.pathname).toBe("/api/code/source-lines");
	expect(Object.fromEntries(address.searchParams)).toEqual({
		vault: VAULT,
		repo: CALL.repo,
		path: CALL.path,
		line: String(CALL.line),
	});
});

test.each([404, 500])(
	"the excerpt is quietly unavailable when the server answers %d",
	async (status) => {
		answering(() => Response.json({ error: "no" }, { status }));
		mount();
		await waitFor(() =>
			expect(
				document.querySelector('[data-slot="code-source-state"][data-unavailable]'),
			).not.toBeNull(),
		);
		expect(document.querySelector("mark")).toBeNull();
	},
);
