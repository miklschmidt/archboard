import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedCanvas } from "../support/owned-canvas.ts";
import {
	browserTestRoots,
	canvasTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerCanvasBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { SURFACE, WAIT, drawnId, pick, press, textOf } from "./support/drilling.ts";
import { serverPath } from "./support/navigator-support.ts";
import { pictureAtRest } from "./support/semantic-page.ts";

// Inspecting a group in a real browser: the half of the workflow only a
// browser can answer. The keyboard reaches the control and the clear action,
// and what the stylesheet does with the marks the pane toggles — members stand
// as drawn, the rest recedes — is a computed style, which no DOM stand-in has.
// The semantics of who is a member are the pure inspection's, and are owned by
// its own tests and the CLI owner.

/** The group control in the reading strip. */
const CHOOSER = "[data-slot='semantic-group-choice']";

/** The control that lets go of the group. */
const CLEAR = "[data-slot='semantic-group-clear']";

/**
 * How opaque one drawn subject is, as the browser computes it.
 * @param browser The page.
 * @param id The subject's id.
 * @returns Its computed opacity.
 */
const opacityOf = (browser: AgentBrowserSession, id: string): Promise<number> =>
	browser.eval<number>(
		`Number(getComputedStyle(document.querySelector("${SURFACE} [data-semantic-id='${id}']")).opacity)`,
	);

/**
 * Which element has the keyboard.
 * @param browser The page.
 * @returns Its `data-slot`, or null.
 */
const focused = (browser: AgentBrowserSession): Promise<string | null> =>
	browser.eval<string | null>("document.activeElement?.getAttribute('data-slot') ?? null");

test("a person inspects a group from the keyboard, sees it stand out, and writes nothing", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "semantic-groups-vault");
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(
		join(vault, ".archboard/config.yaml"),
		Bun.YAML.stringify({
			...DEFAULT_SEMANTIC_POLICY,
			groups: { fulfillment: { name: "Fulfillment" }, billing: { name: "Billing" } },
		}),
	);
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	// Fulfillment crosses two services; the worker inside Shipping is also
	// Billing's; the ledger is Billing's alone; the gateway belongs to nothing.
	const created = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "drawing fulfillment",
		body: {
			board: "orders",
			origin: "agent",
			writerId: "browser-owner",
			create: {
				level: "system",
				nodes: [
					{ name: "Orders", kind: "service" },
					{ name: "Shipping", kind: "service" },
					{ name: "Handler", kind: "route", parent: "Orders", groups: ["fulfillment"] },
					{ name: "Queue", kind: "queue", parent: "Orders", groups: ["fulfillment"] },
					{ name: "Worker", kind: "job", parent: "Shipping", groups: ["billing", "fulfillment"] },
					{ name: "Ledger", kind: "datastore", groups: ["billing"] },
					{ name: "Gateway", kind: "route" },
					{ name: "Reports", kind: "datastore" },
				],
				edges: [
					{ from: "Gateway", to: "Handler", kind: "http", label: "place order" },
					{ from: "Handler", to: "Queue", kind: "queue" },
					{ from: "Queue", to: "Worker", kind: "queue" },
					{ from: "Worker", to: "Ledger", kind: "data" },
				],
			},
		},
	});
	expect(created.status).toBe(200);
	const before = readFileSync(join(vault, "orders.semantic.json"), "utf8");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=orders`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	// At rest: an arriving picture fades its cards in, and what is under test is
	// which of them the inspection lets recede.
	await pollUntil(
		() => pictureAtRest(browser.eval.bind(browser)),
		(atRest) => atRest,
		"the semantic board to be drawn in its pane",
		WAIT,
	);
	const ids = {
		handler: (await drawnId(browser, "Handler")) ?? "",
		worker: (await drawnId(browser, "Worker")) ?? "",
		gateway: (await drawnId(browser, "Gateway")) ?? "",
		ledger: (await drawnId(browser, "Ledger")) ?? "",
		reports: (await drawnId(browser, "Reports")) ?? "",
	};
	expect(Object.values(ids).every((id) => id !== "")).toBe(true);

	// The control offers the groups the variant uses under their configured
	// names, and is reachable from the keyboard.
	await pollUntil(
		() =>
			browser.eval<string[]>(
				`[...document.querySelector("${CHOOSER}").options].map((option) => option.textContent)`,
			),
		(options) => options.includes("Fulfillment") && options.includes("Billing"),
		"the group control to offer the configured groups",
		WAIT,
	);
	await browser.eval(`document.querySelector("${CHOOSER}").focus()`);
	expect(await focused(browser)).toBe("semantic-group-choice");
	await browser.eval(
		`(() => { const control = document.querySelector("${CHOOSER}");` +
			` control.value = "fulfillment"; control.dispatchEvent(new Event("change", { bubbles: true })); })()`,
	);

	// Members stand as drawn, the rest recedes, and a neighbour stays readable.
	await pollUntil(
		() => opacityOf(browser, ids.reports),
		(opacity) => opacity < 1,
		"the part outside the group to recede",
		WAIT,
	);
	expect(await opacityOf(browser, ids.handler)).toBe(1);
	expect(await opacityOf(browser, ids.worker)).toBe(1);
	expect(await opacityOf(browser, ids.gateway)).toBeGreaterThan(
		await opacityOf(browser, ids.reports),
	);
	expect(await opacityOf(browser, ids.ledger)).toBeGreaterThan(
		await opacityOf(browser, ids.reports),
	);
	expect(await textOf(browser, "[data-slot='semantic-group-status']")).toContain("3 members");
	// The disclosure is keyboard accessible and exposes the shared report.
	const summary = "[data-slot='semantic-group-report'] summary";
	await browser.eval(`document.querySelector("${summary}").focus()`);
	await press(browser, summary);
	await pollUntil(
		() => browser.eval<boolean>("document.querySelector('[data-slot=semantic-group-report]').open"),
		(open) => open,
		"the complete group report to open",
		WAIT,
	);
	expect(
		await textOf(browser, "[data-slot='semantic-group-report'] [data-direction='incoming']"),
	).toContain("Gateway");
	expect(
		await textOf(browser, "[data-slot='semantic-group-report'] [data-direction='outgoing']"),
	).toContain("Ledger");
	await press(browser, summary);

	// The picked member is both attended and a member.
	await pick(browser, ids.worker);
	await pollUntil(
		() => textOf(browser, "[data-slot='semantic-inspector-groups']"),
		(said) => said.includes("Fulfillment") && said.includes("Billing"),
		"the inspector to offer the worker's memberships",
		WAIT,
	);
	expect(
		await browser.eval<boolean>(
			`document.querySelector("${SURFACE} [data-semantic-id='${ids.worker}']").classList.contains("is-selected")`,
		),
	).toBe(true);
	expect(await opacityOf(browser, ids.worker)).toBe(1);

	// The clear action is a button the keyboard reaches, and it lets everything back.
	await browser.eval(`document.querySelector("${CLEAR}").focus()`);
	expect(await focused(browser)).toBe("semantic-group-clear");
	await press(browser, CLEAR);
	await pollUntil(
		() => opacityOf(browser, ids.reports),
		(opacity) => opacity === 1,
		"the picture to return to itself once the group is let go",
		WAIT,
	);
	expect(await browser.eval<string>(`document.querySelector("${CHOOSER}").value`)).toBe("");

	// Nothing a person did in the browser wrote a board.
	expect(readFileSync(join(vault, "orders.semantic.json"), "utf8")).toBe(before);
	await canvas.assertRunning();
}, 60_000);
