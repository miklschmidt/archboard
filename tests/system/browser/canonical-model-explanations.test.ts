import { openModelSidebar } from "./support/canonical-page.ts";
import { expect, test } from "bun:test";
import { cpSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startOwnedServer } from "../support/owned-server.ts";
import { prepareProductionFixture } from "../server-state/support/codex-production.ts";
import { productionServer } from "../server-state/support/production-server.ts";
import {
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	serverTestEnvironment,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { initializeSource } from "./support/canonical-model.ts";

const WAIT = { timeoutMs: 10_000 } as const;

test("an explanation keeps its captured selection after scope navigation", async () => {
	await using resources = new AsyncDisposableStack();
	const { fixture, server, browser } = await openReader(resources);
	await openModelSidebar(browser);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Gateway"]']);
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('[data-slot="model-explain"]') !== null`),
		Boolean,
		"the explanation actions",
		WAIT,
	);
	await browser.run(["click", '[data-slot="model-explain"]']);

	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const item = document.querySelector('[data-explanation-action="explain-selection"]'); return item !== null && item.getBoundingClientRect().height > 0 && item.getAttribute("aria-disabled") !== "true" && !item.hasAttribute("disabled"); })()`,
			),
		Boolean,
		"the explanation menu",
		WAIT,
	);
	await browser.run(["click", '[data-explanation-action="explain-selection"]']);
	await pollUntil(
		() =>
			browser.eval<{ status: string | null; alerts: string[] }>(
				`({status: document.querySelector('[data-slot="model-explanation"]')?.getAttribute('data-status') ?? null, alerts: [...document.querySelectorAll('[role="alert"]')].map(e => e.textContent)})`,
			),
		(result) => result.status === "running",
		"the running explanation",
		WAIT,
	);
	const captured = await browser.eval<string | null>(
		`document.querySelector('[data-slot="model-explanation"]')?.getAttribute('data-action-id') ?? null`,
	);
	expect(captured).not.toBeNull();
	await browser.run(["click", '[data-slot="module-open"]']);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-reading"]')?.getAttribute('data-scope') ?? null`,
			),
		(scope) => scope === "Shop#Gateway",
		"navigation during the explanation",
		WAIT,
	);
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ ordinaryOnly: true, explanationQueue: true, completeWorkhorseTurn: true }),
	);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-explanation"]')?.getAttribute('data-status') ?? null`,
			),
		(status) => status === "completed",
		"the captured answer",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-explanation"]')?.getAttribute('data-action-id') ?? null`,
		),
	).toBe(captured);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-explanation-text"]')?.textContent ?? ''`,
		),
	).toBe("The gateway accepts shopping requests.");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-explanation-context"]')?.textContent ?? ''`,
		),
	).toContain("Shop#Gateway");
	const paneContext = await pollUntil(
		async () => (await (await fetch(`${server.base}/api/panes`)).json()).panes[0]?.architecture,
		(architecture) => architecture?.reading.scope === "Shop#Gateway",
		"the canonical pane context after navigation",
		WAIT,
	);
	expect(paneContext).toMatchObject({
		model: "Shop",
		vault: fixture.vault,
		reading: { scope: "Shop#Gateway", groups: ["public"] },
	});
	expect(await browser.run(["errors"])).toBe("");
}, 60_000);

async function openReader(resources: AsyncDisposableStack) {
	const fixture = prepareProductionFixture(
		resources,
		resolve(import.meta.dir, "../server-state/fixtures/fake-codex-production.ts"),
	);
	cpSync(
		resolve(import.meta.dir, "../../../examples/canonical-model/.archboard/vault"),
		fixture.vault,
		{ recursive: true },
	);
	initializeSource(fixture.root);
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ ordinaryOnly: true, explanationQueue: true }),
	);
	const server = await startOwnedServer({
		...productionServer,
		vault: fixture.vault,
		env: serverTestEnvironment({
			ARCHBOARD_TEST_CODEX_EXECUTABLE: fixture.executablePath,
			ARCHBOARD_TEST_CODEX_LOG: fixture.logPath,
			ARCHBOARD_TEST_CODEX_CONTROL: fixture.controlPath,
			XDG_STATE_HOME: join(fixture.root, "state"),
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_CONFIG_NOSYSTEM: "1",
		}),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());

	await browser.run(["open", `${server.base}/?modelA=Shop`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(`document.querySelector('[data-module-id="Shop#Gateway"]') !== null`),
		Boolean,
		"the canonical selection",
		WAIT,
	);
	return { fixture, server, browser };
}

async function actionStatus(browser: AgentBrowserSession, expected: string) {
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-explanation"]')?.getAttribute('data-status') ?? null`,
			),
		(status) => status === expected,
		`the ${expected} explanation`,
		WAIT,
	);
}

async function menuReady(browser: AgentBrowserSession, action: string) {
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const item = document.querySelector('[data-explanation-action="${action}"]'); return item !== null && item.getBoundingClientRect().height > 0 && item.getAttribute('aria-disabled') !== 'true' && !item.hasAttribute('disabled'); })()`,
			),
		Boolean,
		"the applicable explanation action",
		WAIT,
	);
}

test("keyboard and context actions expose unavailable agents, captured retry, and cancellation", async () => {
	await using resources = new AsyncDisposableStack();
	const { fixture, server, browser } = await openReader(resources);
	const gateway = '[data-slot="module-list"] [data-module-id="Shop#Gateway"]';
	await browser.run(["click", gateway]);
	await browser.run(["press", "Shift+F10"]);
	await menuReady(browser, "explain-selection");
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ ordinaryOnly: true, explanationQueue: true, accountReadFails: true }),
	);
	await browser.run(["click", '[data-explanation-action="explain-selection"]']);
	await actionStatus(browser, "unavailable");
	const original = await browser.eval<string | null>(
		`document.querySelector('[data-slot="model-explanation"]')?.getAttribute('data-action-id') ?? null`,
	);
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ ordinaryOnly: true, explanationQueue: true }),
	);
	await browser.run(["click", '[data-slot="explanation-retry"]']);
	await actionStatus(browser, "running");
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-explanation"]')?.getAttribute('data-action-id') ?? null`,
		),
	).toBe(original);
	await browser.run(["click", '[data-slot="explanation-cancel"]']);
	await actionStatus(browser, "cancelled");
	await openModelSidebar(browser);
	await browser.run(["scrollintoview", '[data-slot="module-list"] [data-module-id="Shop#Worker"]']);
	await openModelSidebar(browser);
	await browser.run(["click", '[data-slot="module-list"] [data-module-id="Shop#Worker"]']);
	await openModelSidebar(browser);
	const point = await browser.eval<{ x: number; y: number }>(
		`(() => { const r = document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Worker"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
	);
	await browser
		.run(["mouse", "move", String(Math.round(point.x)), String(Math.round(point.y))])
		.catch((error) => {
			throw new Error(`Cannot point at Worker: ${JSON.stringify(point)}. ${error}`);
		});
	await browser.run(["mouse", "down", "right"]);
	await browser.run(["mouse", "up", "right"]);
	await menuReady(browser, "trace-flow");
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="module-list"] [data-module-id="Shop#Worker"]')?.getAttribute('aria-pressed') ?? null`,
		),
	).toBe("true");
	await browser.run(["click", '[data-explanation-action="trace-flow"]']);
	await actionStatus(browser, "running");
	const panes = await (await fetch(`${server.base}/api/panes`)).json();
	const tabSessionId = panes.panes[0].tabSessionId;
	const query = new URLSearchParams({ vault: fixture.vault, tabSessionId });
	const result = await (
		await fetch(`${server.base}/api/architecture/explanations?${query}`)
	).json();
	expect(result).toMatchObject({
		success: true,
		action: { capture: { investigate: true, request: { subjects: ["Shop#Worker"] } } },
	});
	await browser.run(["click", '[data-slot="explanation-cancel"]']);
	await actionStatus(browser, "cancelled");
	writeFileSync(
		fixture.controlPath,
		JSON.stringify({ ordinaryOnly: true, explanationQueue: true, completeWorkhorseTurn: true }),
	);
	await browser.eval(`(() => {
		const original = window.fetch;
		window.__restoreExplanationRead = () => { window.fetch = original; };
		window.fetch = async (input, init) => {
			const url = new URL(typeof input === 'string' ? input : input.url, location.href);
			const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
			if (url.pathname === '/api/architecture/explanations' && method === 'GET') {
				return new Response(JSON.stringify({
					success: false, code: 'AGENT_UNAVAILABLE',
					error: 'The local agent is unavailable. Reconnect it and retry.'
				}), { status: 503, headers: { 'Content-Type': 'application/json' } });
			}
			return original.call(window, input, init);
		};
	})()`);
	const invoked = await fetch(`${server.base}/api/architecture/explanations`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			vault: fixture.vault,
			tabSessionId,
			request: { ...result.action.capture.request, actionId: "typed-action" },
			selection: result.action.capture.selection,
		}),
	});
	expect(invoked.status).toBe(200);
	const recovery = '[role="alert"]:has(+ [data-slot="model-explanation"]) button';
	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector('${recovery}') !== null`),
		Boolean,
		"the failed explanation read with its cached answer and recovery action",
		WAIT,
	);
	expect(
		await browser.eval<string | null>(
			`document.querySelector('[data-slot="model-explanation"]')?.getAttribute('data-action-id') ?? null`,
		),
	).toBe(result.action.actionId);
	await browser.eval("window.__restoreExplanationRead()");
	await browser.run(["click", recovery]);
	await pollUntil(
		() =>
			browser.eval<string | null>(
				`document.querySelector('[data-slot="model-explanation"]')?.getAttribute('data-action-id') ?? null`,
			),
		(id) => id === "typed-action",
		"the action started through the shared agent endpoint",
		WAIT,
	);
	await actionStatus(browser, "completed");
	expect(await browser.run(["errors"])).toBe("");
}, 60_000);
