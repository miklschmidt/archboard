// Where the map and the code disagree: the findings of a pass, warnings first, as cards beside their
// code or as a list beside the code of the one chosen, in the layout this browser remembers; the
// source lines round a finding's evidence with that line marked and coloured by its language; and
// the pass the view starts when no remembered pass read the reading. The server's routes are
// answered by a stub in its place.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider, focusManager, onlineManager } =
	await import("@tanstack/react-query");
const { act, cleanup, configure, fireEvent, getConfig, render, waitFor } =
	await import("@testing-library/react");
const { ModelCodeEvidence } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelCodeFindings.tsx");
const { useModelCodeFindings } =
	await import("#ui/architecture-drawing/model-reader/reading/hooks/use-model-code-findings.ts");
const { useCodeCheck } =
	await import("#ui/architecture-drawing/model-reader/reading/hooks/use-code-check.ts");
const { CODE_FINDINGS_LAYOUT_KEY, chooseCodeFindingsLayout } =
	await import("#ui/architecture-drawing/model-reader/reading/clients/code-findings-layout.ts");
const { readRetainedFrom, retainedReads } =
	await import("#ui/architecture-drawing/canvas/picture/reads/clients/retained-reads.ts");
const { fetchCodeFindings } =
	await import("#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts");
const { codeTokensQuery } =
	await import("#ui/architecture-drawing/model-reader/access/clients/code-highlighter.ts");

type Props = ComponentProps<typeof ModelCodeEvidence>;
type Reading = NonNullable<Props["reading"]>;

/**
 * The ceiling of every wait in this file. Testing Library gives a wait one second, but a page that
 * shares the machine with the other test files reads its lines and imports its grammar seconds late
 * (the grammar alone takes 0.3 s on a quiet machine). A passing run never reaches the ceiling, which
 * stays below Bun's own 15 s for a case.
 */
const TEST_READ_WAIT_MS = 10_000;

const realFetch = globalThis.fetch;
const waitCeiling = getConfig().asyncUtilTimeout;
configure({ asyncUtilTimeout: TEST_READ_WAIT_MS });
const observer = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver")!;
const clients: InstanceType<typeof QueryClient>[] = [];
const VAULT = "/work/shop/.archboard/vault";

// A page that cannot tell where an element is counts every finding's source as near, so each
// excerpt is read at once.
// The findings are read from the server stub of each test, whatever reader another test installed.
beforeEach(() => {
	Reflect.deleteProperty(globalThis, "IntersectionObserver");
	readRetainedFrom({ ...retainedReads(), codeFindings: fetchCodeFindings });
});
afterEach(() => {
	cleanup();
	chooseCodeFindingsLayout("cards");
	localStorage.clear();
	for (const client of clients.splice(0)) client.clear();
	globalThis.fetch = realFetch;
	Object.defineProperty(globalThis, "IntersectionObserver", observer);
	focusManager.setFocused(undefined);
	onlineManager.setOnline(true);
});
afterAll(async () => {
	configure({ asyncUtilTimeout: waitCeiling });
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

/** The lines round the call, as the server answers them. */
const LINES = {
	success: true,
	repo: CALL.repo,
	path: CALL.path,
	line: CALL.line,
	first: 18,
	lines: ["const a = 1;", "b();", "c();", "work();", "e();", "f();", "g();"],
};

/**
 * Answer every request as a test says, and keep what was asked.
 * @param reply The answer to each address.
 * @returns The addresses asked for.
 */
function answering(reply: (address: URL) => Response | Promise<Response>): URL[] {
	const asked: URL[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL) => {
			const address = new URL(
				input instanceof Request ? input.url : input.toString(),
				"http://archboard.invalid",
			);
			asked.push(address);
			return reply(address);
		},
		{ preconnect: realFetch.preconnect },
	);
	return asked;
}

/**
 * A client of the page's cache.
 * @returns The client.
 */
function cacheClient(): InstanceType<typeof QueryClient> {
	const made = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(made);
	return made;
}

/**
 * Mount the findings of the pass.
 * @param check How the pass the view started stands.
 * @returns The subjects that choosing a finding selected, in turn.
 */
function mount(check: Props["check"] = { status: "checking" }): (string | null)[] {
	const shown: (string | null)[] = [];
	render(
		createElement(
			QueryClientProvider,
			{ client: cacheClient() },
			createElement(ModelCodeEvidence, {
				vault: VAULT,
				reading: READING,
				check,
				ends: ENDS,
				/**
				 * Report the subject a choice selected.
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
 * The findings on screen, in their order.
 * @param slot The part each finding is drawn as.
 * @returns Their codes.
 */
function codes(slot: "code-finding" | "code-finding-row"): (string | null)[] {
	return [...document.querySelectorAll(`[data-slot="${slot}"]`)].map((one) =>
		one.getAttribute("data-finding-code"),
	);
}

/**
 * Press something.
 * @param element What to press.
 */
async function press(element: Element): Promise<void> {
	await act(async () => {
		fireEvent.click(element);
	});
}

/**
 * The storage of a page that cannot reach it.
 * @throws {Error} Always.
 */
function storageOff(): never {
	throw new Error("Storage is off.");
}

/** Nothing happens: the view's findings are not chosen here. */
function nothing(): void {
	// No finding is chosen.
}

/**
 * The rows of the list.
 * @returns The rows, in order.
 */
function rows(): Element[] {
	return [...document.querySelectorAll('[data-slot="code-finding-row"]')];
}

/**
 * Wait until every excerpt on the page has its lines or has none. The cache tells the page that a
 * read has ended in a task of its own, so a test that is over before then leaves an update outside
 * act, in the report of the test that follows.
 */
async function excerptsRead(): Promise<void> {
	await waitFor(() =>
		expect(document.querySelector('output[data-slot="code-source-state"]')).toBeNull(),
	);
}

/**
 * The passes a page asked for.
 * @param asked The addresses it asked for.
 * @returns The addresses of the code check.
 */
function checksIn(asked: readonly URL[]): URL[] {
	return asked.filter((one) => one.pathname === "/api/vault/code-check");
}

/**
 * Switch the layout.
 * @param layout The layout to switch to.
 */
async function lay(layout: "cards" | "list"): Promise<void> {
	await press(
		document.querySelector(`[data-slot="code-findings-layout"] [data-choice="${layout}"]`)!,
	);
}

// The first test, because the page reads its storage once, when the layout is first asked for.
test("a page starts with the layout its browser remembers", async () => {
	answering(() => Response.json({ error: "no" }, { status: 404 }));
	localStorage.setItem(CODE_FINDINGS_LAYOUT_KEY, "list");
	mount();
	expect(document.querySelector('[data-slot="code-evidence"]')?.getAttribute("data-layout")).toBe(
		"list",
	);
	await waitFor(() =>
		expect(
			document.querySelector('[data-slot="code-source-state"][data-unavailable]'),
		).not.toBeNull(),
	);
});

test("cards show every finding beside its code, warnings first, and a card's key selects its subject", async () => {
	answering(() => Response.json({ error: "no" }, { status: 404 }));
	const shown = mount();
	await excerptsRead();
	expect(codes("code-finding")).toEqual([
		"RELATIONSHIP_UNDRAWN",
		"BINDING_SYMBOL_MISSING",
		"EXPOSED_UNUSED",
	]);
	expect(document.querySelectorAll('[data-slot="code-source"]')).toHaveLength(3);
	const keys = [...document.querySelectorAll('[data-slot="code-finding-show"]')];
	expect(keys.map((key) => key.getAttribute("aria-label"))).toEqual([
		"Show Worker on the picture",
		"Show Gateway on the picture",
		"Show Worker on the picture",
	]);
	await press(keys[1]!);
	expect(shown).toEqual(["Shop#Gateway"]);
});

test("the list walks its rows with the keys, and each finding chosen selects its subject", async () => {
	answering(() => Response.json({ error: "no" }, { status: 404 }));
	const shown = mount();
	await excerptsRead();
	await lay("list");
	expect(codes("code-finding-row")).toEqual([
		"RELATIONSHIP_UNDRAWN",
		"BINDING_SYMBOL_MISSING",
		"EXPOSED_UNUSED",
	]);
	expect(codes("code-finding")).toEqual(["RELATIONSHIP_UNDRAWN"]);
	await act(async () => {
		fireEvent.keyDown(rows()[0]!, { key: "ArrowDown" });
	});
	expect(codes("code-finding")).toEqual(["BINDING_SYMBOL_MISSING"]);
	expect(document.activeElement).toBe(rows()[1]!);
	await act(async () => {
		fireEvent.keyDown(rows()[1]!, { key: "End" });
	});
	expect(codes("code-finding")).toEqual(["EXPOSED_UNUSED"]);
	await press(rows()[0]!);
	expect(rows()[0]!.getAttribute("aria-current")).toBe("true");
	expect(shown).toEqual(["Shop#Gateway", "Shop#Worker", "Shop#Worker"]);
});

test("the switch is remembered, and a page without storage still switches", async () => {
	answering(() => Response.json({ error: "no" }, { status: 404 }));
	mount();
	await excerptsRead();
	expect(document.querySelector('[data-slot="code-evidence"]')?.getAttribute("data-layout")).toBe(
		"cards",
	);
	await lay("list");
	expect(localStorage.getItem(CODE_FINDINGS_LAYOUT_KEY)).toBe("list");
	cleanup();
	const storage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!;
	Object.defineProperty(globalThis, "localStorage", { configurable: true, get: storageOff });
	try {
		chooseCodeFindingsLayout("cards");
		mount();
		await excerptsRead();
		await lay("list");
		expect(document.querySelector('[data-slot="code-evidence"]')?.getAttribute("data-layout")).toBe(
			"list",
		);
	} finally {
		Object.defineProperty(globalThis, "localStorage", storage);
	}
});

test("the excerpt marks the evidence line among the lines round it, in the colours of its language", async () => {
	const asked = answering(() => Response.json(LINES));
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
	expect(asked[0]?.pathname).toBe("/api/code/source-lines");
	expect(Object.fromEntries(asked[0]!.searchParams)).toEqual({
		vault: VAULT,
		repo: CALL.repo,
		path: CALL.path,
		line: String(CALL.line),
	});
	await waitFor(() => expect(document.querySelector("code[data-highlighted]")).not.toBeNull());
	const keyword = [...document.querySelectorAll<HTMLElement>("[data-line='18'] span[style]")].find(
		(token) => token.textContent === "const",
	);
	expect(keyword?.style.color).toBe("var(--code-token-keyword)");
	expect(document.querySelector("mark")?.textContent).toContain("work();");
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

test.each([
	["flake.nix", "let value = 1; in value"],
	["main.tofu", 'resource "example" "main" {}'],
])("the excerpt highlights %s evidence that the code check reads", async (path, source) => {
	const tokens = await cacheClient().fetchQuery(codeTokensQuery(path, [source]));
	expect(tokens).not.toBeNull();
	expect(
		tokens
			?.flat()
			.map((token) => token.content)
			.join(""),
	).toBe(source);
});

/** The reading on screen, by the names a code pass gives it. */
const MODEL = {
	manifest: { id: "Shop" },
	selectedState: { id: "Current", lifecycle: "current" },
	revision: { digest: "a".repeat(64) },
} as const;

/**
 * The code view of the reading on screen, as Measures draws it: the remembered findings, and the
 * pass it starts when none of them read the reading.
 * @param props The reading.
 * @param props.model The reading on screen.
 * @returns The view.
 */
function CodeView(props: { readonly model: typeof MODEL | typeof DRAFT }) {
	const { reading, read } = useModelCodeFindings(VAULT, props.model);
	const check = useCodeCheck(VAULT, props.model, { read, matched: reading !== null });
	return createElement(ModelCodeEvidence, {
		vault: VAULT,
		reading,
		check,
		ends: ENDS,
		onShow: nothing,
	});
}

/** A draft of the model, which a pass reads only when it is asked for by its state. */
const DRAFT = {
	manifest: { id: "Shop" },
	selectedState: { id: "TASK-1", lifecycle: "draft" },
	revision: { digest: "b".repeat(64) },
} as const;

/**
 * A server whose memory is empty until the code check runs.
 * @param reading What the pass finds.
 * @returns The addresses asked for, and how to let the pass finish.
 */
function serverWithPass(reading: Reading): { asked: URL[]; finish: () => void } {
	const { promise: passed, resolve: finish } = Promise.withResolvers<void>();
	let checked = false;
	const asked = answering(async (address) => {
		if (address.pathname === "/api/vault/code-check") {
			await passed;
			checked = true;
			return Response.json({
				success: true,
				timings: [],
				states: [],
				findings: [],
				skipped: [],
				behind: [],
			});
		}
		if (address.pathname === "/api/vault/code-findings")
			return Response.json({ success: true, readings: [], models: checked ? [reading] : [] });
		return Response.json({ error: "no" }, { status: 404 });
	});
	return { asked, finish };
}

test("the code view starts one pass when no pass read the reading, and then shows what it found", async () => {
	const { asked, finish } = serverWithPass(READING);
	const cache = cacheClient();
	const view = render(
		createElement(
			QueryClientProvider,
			{ client: cache },
			createElement(CodeView, { model: MODEL }),
		),
	);
	await waitFor(() =>
		expect(document.querySelector('[data-slot="code-evidence-checking"]')).not.toBeNull(),
	);
	await waitFor(() => expect(checksIn(asked)).toHaveLength(1));
	expect(
		asked.find((one) => one.pathname === "/api/vault/code-check")?.searchParams.has("state"),
	).toBe(false);
	view.unmount();
	render(
		createElement(
			QueryClientProvider,
			{ client: cache },
			createElement(CodeView, { model: MODEL }),
		),
	);
	await act(async () => {
		finish();
	});
	await waitFor(() => expect(codes("code-finding")).toHaveLength(3));
	await excerptsRead();
	expect(checksIn(asked)).toHaveLength(1);
});

test("a draft is checked by its state, and a refused pass says why and tries again", async () => {
	let refuse = true;
	const asked = answering((address) => {
		if (address.pathname === "/api/vault/code-check")
			return refuse
				? Response.json(
						{ success: false, code: "NO_SUCH_DRAFT", error: "No document has the draft TASK-1." },
						{ status: 422 },
					)
				: Response.json({
						success: true,
						timings: [],
						states: [],
						findings: [],
						skipped: [],
						behind: [],
					});
		if (address.pathname === "/api/vault/code-findings")
			return Response.json({ success: true, readings: [], models: [] });
		return Response.json({ error: "no" }, { status: 404 });
	});
	const cache = cacheClient();
	const view = render(
		createElement(
			QueryClientProvider,
			{ client: cache },
			createElement(CodeView, { model: DRAFT }),
		),
	);
	await waitFor(() =>
		expect(document.querySelector('[data-slot="code-evidence-failed"]')?.textContent).toContain(
			"No document has the draft TASK-1.",
		),
	);
	expect(checksIn(asked)[0]?.searchParams.get("state")).toBe("TASK-1");
	view.unmount();
	render(
		createElement(
			QueryClientProvider,
			{ client: cache },
			createElement(CodeView, { model: DRAFT }),
		),
	);
	await waitFor(() =>
		expect(document.querySelector('[data-slot="code-evidence-failed"]')).not.toBeNull(),
	);
	await act(async () => {
		focusManager.setFocused(false);
		focusManager.setFocused(true);
		onlineManager.setOnline(false);
		onlineManager.setOnline(true);
	});
	expect(checksIn(asked)).toHaveLength(1);
	refuse = false;
	await press(document.querySelector('[data-slot="code-evidence-retry"]')!);
	await waitFor(() => expect(checksIn(asked)).toHaveLength(2));
	await waitFor(() =>
		expect(document.querySelector('[data-slot="code-evidence-failed"]')?.textContent).toContain(
			"did not read this version",
		),
	);
});
