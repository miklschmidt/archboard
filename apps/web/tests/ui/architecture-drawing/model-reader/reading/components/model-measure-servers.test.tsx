// What a table of Measures says when the last code pass met a checkout without the server of a
// language (TASK-646.09): each language names the server that it needs, once for its checkout,
// and Fix with Codex asks for the setup in that checkout. A reader outside the application, which
// offers no setup, still says which server is missing.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps, type ContextType } from "react";
import type { RememberedFindings } from "@archboard/code-intel/code-check";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { ModelMeasures } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelMeasures.tsx");
const { LanguageServerFixContext } =
	await import("#ui/architecture-drawing/model-reader/state/language-server-fix.ts");
const { kindLookOf } = await import("#ui/architecture-drawing/canvas/picture/rules/kind-look.ts");
const { readRetainedFrom, retainedReads } =
	await import("#ui/architecture-drawing/canvas/picture/reads/clients/retained-reads.ts");
const { fetchCodeFindings } =
	await import("#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts");

type Props = ComponentProps<typeof ModelMeasures>;
type Setup = ContextType<typeof LanguageServerFixContext>;

const realFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];
const REVISION = { digest: "a".repeat(64), files: [] };
const STATE = { id: "Current", name: "Implemented", lifecycle: "current" } as const;
const SERVER = '[data-slot="model-measures-server"]';

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	globalThis.fetch = realFetch;
});
afterAll(async () => {
	await Bun.sleep(1);
	await GlobalRegistrator.unregister();
});

/**
 * A checkout that has no server for a language, as the code check says it once.
 * @param repo The checkout's repository.
 * @param language The language.
 * @returns The skip.
 */
function missing(repo: string, language: string) {
	return {
		reason: "language-server-missing",
		repo,
		detail: `${language}: no server is configured. Configure one with \`archboard repo language-server ${language} <command>\``,
	} as const;
}

/** The pass over this version of the reading: the orders checkout has no Python and no Go server. */
const REMEMBERED: RememberedFindings = {
	readings: [],
	models: [
		{
			model: "Shop",
			state: "Current",
			revision: REVISION,
			checkedAt: "2026-11-19T12:00:00.000Z",
			findings: [],
			depth: [],
			skipped: [
				missing("example/orders", "python"),
				missing("example/orders", "go"),
				missing("example/orders", "python"),
				missing("example/shop", "rust"),
			],
		},
	],
};

/**
 * A language's server, as a setup brief would name it.
 * @param language The language.
 * @returns The server.
 */
function server(language: string): string {
	return `\`${language}-server\``;
}

/** A table chooses nothing here. */
function nothing(): void {}

/**
 * Mount the table of what a module exposes, with its code columns, over the remembered pass.
 * @param setup What the application offers, or nothing outside it.
 */
function mount(setup: Setup): void {
	readRetainedFrom({ ...retainedReads(), codeFindings: fetchCodeFindings });
	globalThis.fetch = Object.assign(async () => Response.json({ success: true, ...REMEMBERED }), {
		preconnect: realFetch.preconnect,
	});
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	const props: Props = {
		vault: "/work/servers/.archboard/vault",
		model: {
			manifest: {
				schemaVersion: 1,
				id: "Shop",
				name: "Shop",
				current: { id: "Current", name: "Now" },
			},
			selectedState: STATE,
			revision: REVISION,
			modules: [{ binding: { repo: "example/shop", path: "src" } }],
			policy: DEFAULT_SEMANTIC_POLICY,
		},
		projection: {
			complete: {
				nodes: [{ id: "api", name: "api", kind: "module", order: 1 }],
				edges: [],
				flows: [],
				walkthroughs: [],
			},
		},
		label: "What a module exposes",
		keys: ["entryPoints", "codeExports"],
		look: kindLookOf(DEFAULT_SEMANTIC_POLICY, new Map()),
		selected: null,
		view: { measure: "entryPoints", fewest: false, show: "all" },
		onView: nothing,
		onChoose: nothing,
	};
	render(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(
				LanguageServerFixContext,
				{ value: setup },
				createElement(ModelMeasures, props),
			),
		),
	);
}

/**
 * The line of one checkout, once the pass is read.
 * @param repo The checkout's repository.
 * @returns The line.
 */
function line(repo: string): Promise<HTMLElement> {
	return waitFor(() => {
		const found = document.querySelector<HTMLElement>(`${SERVER}[data-repo="${repo}"]`);
		if (found === null) throw new Error(`no line for ${repo}`);
		return found;
	});
}

test("a language without its server names the server it needs, and Fix with Codex asks for it in that checkout", async () => {
	const asked: (readonly [string, readonly string[]])[] = [];
	mount({
		server,
		/**
		 * Keep what the person asked for.
		 * @param repo The checkout's repository.
		 * @param languages Its languages without a server.
		 */
		fix: (repo, languages) => {
			asked.push([repo, languages]);
		},
	});
	const orders = await line("example/orders");
	expect([...orders.querySelectorAll("li")].map((each) => each.textContent)).toEqual([
		"No Python language server in example/orders, so its code is not counted. It needs python-server.",
		"No Go language server in example/orders, so its code is not counted. It needs go-server.",
	]);
	expect(document.querySelectorAll(SERVER)).toHaveLength(2);
	await act(async () => {
		fireEvent.click(orders.querySelector("button")!);
	});
	expect(asked).toEqual([["example/orders", ["python", "go"]]]);
});

test("a reader outside the application says which server is missing, and offers no fix", async () => {
	mount(null);
	const shop = await line("example/shop");
	expect(shop.textContent).toBe(
		"No Rust language server in example/shop, so its code is not counted.",
	);
	expect(shop.querySelector("button")).toBeNull();
});
