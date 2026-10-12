import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_SEMANTIC_POLICY } from "@/shared/semantic-policy/index";
import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { SURFACE, WAIT, drawnId, press } from "./support/drilling.ts";
import { serverPath } from "./support/navigator-support.ts";
import { pictureAtRest } from "./support/semantic-page.ts";

// Selecting a group in a real browser: the half of the workflow only a
// browser can answer. The ring on each member is the picture's stylesheet at
// work, which no DOM stand-in computes. Who is selected, when the group is let
// go, and the chip's colour token are owned by the pane's own tests.

/**
 * One group's button in the list on the sidebar's board tab.
 * @param group The group's id.
 * @returns Its selector.
 */
const choice = (group: string): string =>
	`[data-slot='semantic-group-choice'][data-group='${group}']`;

/**
 * Which of some drawn subjects show the selection ring, as the browser computes it.
 * @param browser The page.
 * @param ids The subjects.
 * @returns The ids whose ring is drawn, in the order given.
 */
const ringed = (browser: AgentBrowserSession, ids: readonly string[]): Promise<string[]> =>
	browser.eval<string[]>(
		`${JSON.stringify(ids)}.filter((id) => {` +
			` const halo = document.querySelector("${SURFACE} [data-semantic-id='" + id + "'] > .ab-halo");` +
			` return halo !== null && Number(getComputedStyle(halo).opacity) === 1; })`,
	);

test("a person selects a group from its colour and name, sees its members ringed, and writes nothing", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "semantic-groups-vault");
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	writeFileSync(
		join(vault, ".archboard/config.yaml"),
		Bun.YAML.stringify({
			...DEFAULT_SEMANTIC_POLICY,
			groups: {
				fulfillment: { name: "Fulfillment", color: "teal" },
				billing: { name: "Billing", color: "amber" },
			},
		}),
	);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);

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
	await browser.run(["open", `${server.base}/?paneA=orders`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => pictureAtRest(browser.eval.bind(browser)),
		(atRest) => atRest,
		"the semantic board to be drawn in its pane",
		WAIT,
	);
	const names = ["Handler", "Queue", "Worker", "Ledger", "Gateway", "Reports"];
	const ids = await Promise.all(names.map((name) => drawnId(browser, name)));
	const [handler, queue, worker] = ids;

	await pollUntil(
		() => browser.eval<boolean>(`document.querySelector("${choice("fulfillment")}") !== null`),
		(listed) => listed,
		"the group list to offer the configured groups",
		WAIT,
	);

	// Choosing the group rings every member across both services, and nothing else.
	await press(browser, choice("fulfillment"));
	await pollUntil(
		() => ringed(browser, ids),
		(drawn) => drawn.length > 0,
		"the group's members to be ringed",
		WAIT,
	);
	expect(await ringed(browser, ids)).toEqual([handler!, queue!, worker!]);

	// Choosing it again lets go.
	await press(browser, choice("fulfillment"));
	await pollUntil(
		() => ringed(browser, ids),
		(drawn) => drawn.length === 0,
		"the group to be let go",
		WAIT,
	);

	// Nothing a person did in the browser wrote a board.
	expect(readFileSync(join(vault, "orders.semantic.json"), "utf8")).toBe(before);
	await server.assertRunning();
}, 60_000);
