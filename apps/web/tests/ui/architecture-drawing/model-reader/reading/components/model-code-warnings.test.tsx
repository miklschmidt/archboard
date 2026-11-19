// The count of warnings of the model: a quiet one, as the foot of the right panel shows it, draws
// nothing while the pass found no warning to walk through, and About always shows the count.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
import type { CodeCheckAnswer } from "@archboard/code-intel/code-check";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { ModelCodeWarnings } =
	await import("#ui/architecture-drawing/model-reader/reading/components/ModelCodeFindings.tsx");
const { CodeExports, ModuleCodeExports } =
	await import("#ui/architecture-drawing/model-reader/reading/code-exports/components/CodeExports.tsx");

type Reading = NonNullable<ComponentProps<typeof ModelCodeWarnings>["reading"]>;

const COUNT = "[data-slot='code-warning-count']";

/**
 * A pass over the shop with one finding of each severity named.
 * @param severities The severity of each finding.
 * @returns The pass, as the server keeps it.
 */
function pass(...severities: Reading["findings"][number]["severity"][]): Reading {
	return {
		model: "Shop",
		state: "Current",
		revision: { digest: "a".repeat(64), files: [] },
		checkedAt: "2026-11-01T12:00:00.000Z",
		findings: severities.map((severity) => ({
			code: "BINDING_SYMBOL_MISSING",
			severity,
			file: "modules/gateway.json",
			subject: { kind: "node", id: "Shop#Gateway", name: "Gateway" },
			message: "The binding of Gateway names a symbol that its file does not define.",
		})),
	};
}

/** A count that selects nothing: these tests read the count alone. */
function selectNothing(): void {}

/**
 * Show the count.
 * @param reading What the pass found.
 * @param quiet Whether the count says nothing for a pass with no warning.
 * @returns The count's button, or null when none stands.
 */
function counted(reading: Reading, quiet: boolean): HTMLButtonElement | null {
	render(createElement(ModelCodeWarnings, { reading, onSelect: selectNothing, quiet }));
	return document.querySelector<HTMLButtonElement>(COUNT);
}

const realFetch = globalThis.fetch;
const clients: InstanceType<typeof QueryClient>[] = [];

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
	globalThis.fetch = realFetch;
});
afterAll(async () => {
	await Bun.sleep(1);
	await GlobalRegistrator.unregister();
});

test("a quiet count draws nothing for a pass with no warning, and counts the warnings that it has", () => {
	expect(counted(pass("information"), true)).toBeNull();
	cleanup();
	expect(counted(pass(), true)).toBeNull();
	cleanup();
	const walked = counted(pass("information", "warning", "warning"), true);
	expect(walked?.getAttribute("data-count")).toBe("2");
	expect(walked?.disabled).toBe(false);
});

test("the count of About stays for a pass with no warning, and offers nothing to walk through", () => {
	const none = counted(pass("information"), false);
	expect(none?.getAttribute("data-count")).toBe("0");
	expect(none?.disabled).toBe(true);
});

const VAULT = "/work/shop/.archboard/vault";
const GATEWAY = { kind: "node", id: "Shop#Gateway", name: "Gateway" } as const;
/** A file the gateway could be bound to, which stands for no folder. */
const BOUND = "src/gateway/gateway.ts";

/** What the last pass counted of the gateway: a function, a class with a method, a value, a type. */
const NAMES: NonNullable<CodeCheckAnswer["depth"]>[number]["names"] = [
	{ name: "open", kind: "function", path: "src/gateway/index.ts", line: 3 },
	{ name: "Gate", kind: "class", path: "src/gateway/gate.ts", line: 1 },
	{ name: "Gate.pass", kind: "method", path: "src/gateway/gate.ts", line: 4 },
	{ name: "LIMITS", kind: "value", path: "src/gateway/limits.ts", line: 1 },
	{ name: "Options", kind: "type", path: "src/gateway/index.ts", line: 9 },
];

/**
 * A pass that measured the gateway, with a warning on its value and its roll-up on the module.
 * @returns The pass, as the findings answer gives it, without the names.
 */
function measured(): Reading {
	return {
		...pass(),
		findings: [
			{
				code: "EXPOSED_VALUE",
				severity: "warning",
				file: "modules/gateway.json",
				subject: GATEWAY,
				export: "LIMITS",
				message: "Gateway exports the value LIMITS, and outside code reads it.",
			},
			{
				code: "CALLER_UNDRAWN",
				severity: "warning",
				file: "modules/gateway.json",
				subject: GATEWAY,
				message: "The code of Worker reaches Gateway, and no relationship joins them.",
			},
			{
				code: "MODULE_SHALLOW",
				severity: "information",
				file: "modules/gateway.json",
				subject: GATEWAY,
				message: "Every export of Gateway carries a finding.",
			},
		],
		depth: [
			{
				model: "Shop",
				state: "Current",
				subject: GATEWAY,
				repo: "example/shop",
				directory: "src/gateway",
				languages: ["typescript"],
				unjudged: [],
				exports: { functions: 1, classes: 1, methods: 1, values: 1, types: 1 },
				logic: 4,
			},
		],
	};
}

/**
 * What the server answers an address: the gateway narrowed to it with its names, an open of code,
 * and nothing else.
 * @param url The address.
 * @returns The answer.
 */
function answerTo(url: string): Response {
	if (url.includes("/api/vault/code-exports")) {
		const depth = (measured().depth ?? []).map((module) => ({ ...module, names: NAMES }));
		return Response.json({ success: true, depth });
	}
	if (url.includes("/api/code-targets/open"))
		return Response.json({
			success: true,
			code: "CODE_TARGET_OPENED",
			repository: "example/shop",
			path: "src/gateway/limits.ts",
			kind: "file",
		});
	return Response.json({ success: false, error: "not here" }, { status: 404 });
}

/**
 * Answer the server as `answerTo` says, keeping each address asked for.
 * @returns Each address asked for, with its body.
 */
function serving(): { url: string; body: unknown }[] {
	const asked: { url: string; body: unknown }[] = [];
	globalThis.fetch = Object.assign(
		async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input instanceof Request ? input.url : input);
			asked.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
			return answerTo(url);
		},
		{ preconnect: realFetch.preconnect },
	);
	return asked;
}

/**
 * Show the code exports of the gateway.
 * @param reading The pass that read the reading on screen, or null.
 * @param read How the read of the remembered passes stands.
 */
function showExports(
	reading: Reading | null,
	read: ComponentProps<typeof CodeExports>["read"] = "success",
): void {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	render(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(CodeExports, {
				vault: VAULT,
				module: GATEWAY.id,
				reading,
				read,
				onNotice: selectNothing,
			}),
		),
	);
}

/**
 * The rows of the list, by kind, each with the codes of its findings.
 * @returns Each kind's rows.
 */
function listed(): Record<string, string[]> {
	const kinds: Record<string, string[]> = {};
	for (const row of document.querySelectorAll<HTMLElement>("[data-slot='code-export']")) {
		const kind = row.closest("[data-export-kind]")?.getAttribute("data-export-kind") ?? "";
		const codes = [...row.querySelectorAll("[data-finding-code]")].map((chip) =>
			chip.getAttribute("data-finding-code"),
		);
		(kinds[kind] ??= []).push([row.getAttribute("data-export"), ...codes].join(" "));
	}
	return kinds;
}

test("code exports list a module's exports by kind, each with its findings, read for that module alone", async () => {
	const asked = serving();
	showExports(measured());
	await waitFor(() =>
		expect(document.querySelectorAll("[data-slot='code-export']")).toHaveLength(5),
	);

	expect(listed()).toEqual({
		function: ["open"],
		class: ["Gate"],
		method: ["Gate.pass"],
		value: ["LIMITS EXPOSED_VALUE"],
		type: ["Options"],
	});
	expect(
		[...document.querySelectorAll("[data-slot='code-exports-module'] [data-finding-code]")].map(
			(chip) => chip.getAttribute("data-finding-code"),
		),
	).toEqual(["MODULE_SHALLOW"]);
	const read = new URL(asked[0]?.url ?? "", "http://archboard.test");
	expect(asked).toHaveLength(1);
	expect(read.pathname).toBe("/api/vault/code-exports");
	expect(Object.fromEntries(read.searchParams)).toMatchObject({
		model: "Shop",
		state: "Current",
		revision: "a".repeat(64),
		module: GATEWAY.id,
	});

	const value = document.querySelector<HTMLElement>(
		"[data-slot='code-export'][data-export='LIMITS']",
	);
	fireEvent.click(value!);
	await waitFor(() => expect(asked).toHaveLength(2));
	expect(asked[1]?.url).toContain("/api/code-targets/open");
	expect(asked[1]?.body).toMatchObject({
		repo: "example/shop",
		path: "src/gateway/limits.ts",
		symbol: "LIMITS",
		line: 1,
	});
});

test("a module no pass measured reads no exports, and says why", () => {
	const asked = serving();
	showExports(pass());
	expect(document.querySelectorAll("[data-slot='code-exports-unmeasured']")).toHaveLength(1);
	cleanup();
	// A module bound to a file that stands for no folder: the words name the binding the pass skipped.
	showExports({
		...pass(),
		skipped: [
			{
				reason: "binding-not-a-module",
				model: "Shop",
				state: "Current",
				subject: GATEWAY,
				detail: BOUND,
			},
		],
	});
	expect(document.querySelector("[data-slot='code-exports-skipped']")?.textContent).toContain(
		BOUND,
	);
	cleanup();
	showExports(null);
	expect(document.querySelectorAll("[data-slot='code-exports-unread']")).toHaveLength(1);
	// While the remembered passes are read, after their read failed, and for a reading that is not
	// the vault on disk, the words say so, and never that no pass read the reading.
	for (const read of ["pending", "error", "elsewhere"] as const) {
		cleanup();
		showExports(null, read);
		const words = document.querySelector("[data-slot='code-exports-unread']");
		expect(words?.getAttribute("data-read")).toBe(read);
	}
	cleanup();
	showExports({
		...pass(),
		skipped: [{ reason: "exposure-unknown", model: "Shop", state: "Current", subject: GATEWAY }],
	});
	expect(document.querySelectorAll("[data-slot='code-exports-skipped']")).toHaveLength(1);
	expect(asked).toHaveLength(0);
});

test("a server that forgot the pass reads as forgotten, and any other refusal of the exports as a failure", async () => {
	for (const [code, slot] of [
		["CODE_EXPORTS_UNREAD", "code-exports-forgotten"],
		["VAULT_UNREGISTERED", "code-exports-unavailable"],
	] as const) {
		globalThis.fetch = Object.assign(
			async () => Response.json({ success: false, code, error: "refused" }, { status: 404 }),
			{ preconnect: realFetch.preconnect },
		);
		showExports(measured());
		// oxlint-disable-next-line no-await-in-loop -- one refusal at a time, each on its own page
		await waitFor(() => expect(document.querySelectorAll(`[data-slot='${slot}']`)).toHaveLength(1));
		cleanup();
	}
});

/**
 * The gateway's code exports as a section of the right panel, in a reading.
 * @param client The query client.
 * @param model Where the reading comes from.
 * @returns The panel's section.
 */
function panelExports(
	client: InstanceType<typeof QueryClient>,
	model: ComponentProps<typeof ModuleCodeExports>["model"],
) {
	return createElement(
		QueryClientProvider,
		{ client },
		createElement(ModuleCodeExports, {
			vault: VAULT,
			model,
			module: { id: GATEWAY.id, binding: { repo: "example/shop", path: "src/gateway" } },
			reading: measured(),
			read: "success",
			onNotice: selectNothing,
		}),
	);
}

test("the right panel lists a selected module's code exports, and a branch reading lists none", async () => {
	serving();
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	const { rerender } = render(panelExports(client, {}));
	await waitFor(() =>
		expect(
			document.querySelectorAll("[data-slot='module-code-exports'] [data-slot='code-export']"),
		).toHaveLength(5),
	);
	rerender(panelExports(client, { sourceRef: "feature" }));
	expect(document.querySelector("[data-slot='module-code-exports']")).toBeNull();
});
