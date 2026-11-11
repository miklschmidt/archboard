import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";

import { createJsonRequester } from "../support/http.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import { vaultIn } from "../support/test-vault.ts";
import {
	browserTestRoots,
	serverTestEnvironment,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";
import { switchTheme } from "./support/shell-dom.ts";
import {
	seedCanonicalModel,
	editCanonicalModel,
	openAbout,
	chooseFlow,
} from "./support/canonical-page.ts";
import { initializeSource } from "./support/canonical-model.ts";
import { mintId } from "@archboard/model/ids";
import { unresolvedPaints } from "./support/computed-colours.ts";

/** How long any one thing here is waited for. */
const WAIT = { timeoutMs: 6_000 } as const;

/** The element the camera moves. */
const SURFACE = "[data-slot='model-diagram'] [data-slot='canvas-surface']";

/** The panel beside the diagram. */
const INSPECTOR = "[data-slot='module-details']";

/**
 * Whether a subject's group carries the warning badge, and whether the reader's
 * own ring is lit on it.
 * @param browser The page.
 * @param id The subject's semantic id.
 * @returns The two, read off the same group.
 */
const marksOn = (
	browser: AgentBrowserSession,
	id: string,
): Promise<{ warned: boolean; attended: boolean }> =>
	browser.eval(
		`(() => {` +
			` const groups = [...document.querySelectorAll("${SURFACE} [data-semantic-id='${id}']")];` +
			` return {` +
			`  warned: groups.some((group) => group.querySelector("path[d^='M0,-5.2']") !== null),` +
			`  attended: groups.some((group) => group.classList.contains("is-selected")),` +
			` }; })()`,
	);

/**
 * Pick a subject out of the diagram the way a person does: press on the shape,
 * release and click on the viewport, because a browser retargets a click to
 * whichever element holds the pointer.
 * @param browser The page.
 * @param id The semantic id to pick.
 * @returns Settles once the click has been delivered.
 */
const pick = (browser: AgentBrowserSession, id: string): Promise<unknown> =>
	browser.eval(
		`(() => {` +
			` const card = document.querySelector("${SURFACE} [data-semantic-id='${id}']");` +
			` const view = document.querySelector("[data-slot='model-diagram']");` +
			` const at = card.getBoundingClientRect();` +
			` const where = { pointerId: 1, isPrimary: true, button: 0, bubbles: true,` +
			`   clientX: Math.round(at.x + at.width / 2), clientY: Math.round(at.y + at.height / 2) };` +
			` card.dispatchEvent(new PointerEvent("pointerdown", where));` +
			` view.dispatchEvent(new PointerEvent("pointerup", where));` +
			` view.dispatchEvent(new MouseEvent("click", where)); })()`,
	);

test("a reader sees what is unsettled and what belongs together, painted on both grounds", async () => {
	await using resources = new AsyncDisposableStack();
	const root = join(browserTestRoots().ownerRoot, "model-legibility");
	const vault = vaultIn(root);
	const model = await seedCanonicalModel(vault, "Write path", {
		nodes: [
			{ name: "Gateway", kind: "route" },
			{ name: "Writer", kind: "module", responsibility: "Takes the lease" },
			{ name: "Ledger", kind: "datastore" },
		],
		edges: [
			{ from: "Gateway", to: "Writer", kind: "call", label: "hands it over" },
			{ from: "Writer", to: "Ledger", kind: "data", label: "writes" },
		],
	});
	const id = (name: string): string => model.modules.find((module) => module.name === name)!.id;
	const policy = structuredClone(DEFAULT_SEMANTIC_POLICY);
	policy.nodeKinds["route"]!.color = "blue";
	policy.nodeKinds["queue"]!.color = "green";
	policy.nodeKinds["datastore"]!.color = "amber";
	policy.groups = {
		"write-path": { name: "the write path", color: "violet" },
		payments: { name: "payments", color: "amber" },
	};
	writeFileSync(join(vault, ".archboard/config.yaml"), Bun.YAML.stringify(policy));
	for (const index of [0, 1, 2]) {
		const path = join(vault, `module-${index}.module.json`);
		const module = JSON.parse(readFileSync(path, "utf8"));
		module.groups = [index === 2 ? "payments" : "write-path"];
		for (const edge of module.outgoing) edge.traffic = {};
		if (index === 0) module.outgoing[0].emphasis = "hero";
		writeFileSync(path, JSON.stringify(module));
	}
	const flow = `${model.manifest.id}#${mintId()}`;
	writeFileSync(
		join(vault, "write.flows.json"),
		JSON.stringify({
			schemaVersion: 1,
			id: mintId(),
			name: "Writes",
			flows: [
				{
					id: flow,
					name: "One write",
					participants: [id("Gateway"), id("Writer")],
					steps: [
						{
							id: `${model.manifest.id}#${mintId()}`,
							from: id("Gateway"),
							to: id("Writer"),
							label: "asks",
							kind: "sync",
						},
						{
							id: `${model.manifest.id}#${mintId()}`,
							from: id("Writer"),
							to: id("Gateway"),
							label: "the version",
							kind: "return",
						},
					],
				},
			],
		}),
	);
	initializeSource(root);
	const server = await startOwnedServer({
		serverPath,
		vault,
		env: serverTestEnvironment({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" }),
	});
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const request = createJsonRequester(server);
	const proposal = await editCanonicalModel(
		request,
		vault,
		"legible-proposal",
		[
			{ type: "edit-module", subject: id("Writer"), set: { responsibility: "Drains the queue" } },
			{
				type: "add-module",
				module: { name: "Queue", kind: "queue", groups: ["write-path"], order: 3 },
			},
			{
				type: "add-relationship",
				source: id("Gateway"),
				relationship: { to: "Queue", kind: "queue", label: "enqueues", traffic: {}, order: 1 },
			},
			{
				type: "remove-relationship",
				subject: model.relationships.find((edge) => edge.label === "writes")!.id,
			},
		],
		{ proposal: { type: "create", name: "Proposed queue" } },
	);
	await editCanonicalModel(request, vault, "legible-current", [
		{ type: "edit-module", subject: id("Writer"), set: { responsibility: "Writes the note" } },
	]);

	const browser = resources.use(await createAgentBrowser());
	await browser.run([
		"open",
		`${server.base}/?modelA=${model.manifest.id}&stateA=${proposal.target.state}`,
	]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	// At rest: an arriving picture draws its lines on and gives them their
	// arrowheads last, and what is under test is the picture a reader reads.
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector("${SURFACE}:not([data-picture-motion]) svg") !== null`,
			),
		(atRest) => atRest,
		"the proposal to be drawn in its pane",
		WAIT,
	);
	await switchTheme(browser, "light");

	// Every paint in the picture resolves against the page's own tokens.
	expect(await unresolvedPaints(browser, SURFACE)).toEqual([]);

	const writer = id("Writer");
	// What nobody has decided is on the card, with nothing selected — and
	// picking that very card out shows both marks at once, which is the case a
	// single mark per subject used to lose.
	await pollUntil(
		() => marksOn(browser, writer),
		(marks) => marks.warned && !marks.attended,
		"the unsettled part to be badged before anybody picks anything",
		WAIT,
	);
	await pick(browser, writer);
	await pollUntil(
		() => marksOn(browser, writer),
		(marks) => marks.warned && marks.attended,
		"the same part to be both badged and ringed once it is picked out",
		WAIT,
	);
	// And the badge is cashed in for words where the reader clicked.
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector("[data-slot='model-panel'] ${INSPECTOR} [data-slot='semantic-inspector-waiting'] [data-field='responsibility']") !== null`,
			),
		Boolean,
		"the panel to explain the warning on its subject",
		WAIT,
	);
	await openAbout(browser, "selection");
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector("[data-slot='model-about'] ${INSPECTOR}")?.textContent.includes('the write path') === true`,
			),
		Boolean,
		"About to name the group",
		WAIT,
	);

	// The other grammar, told in the same language.
	// The views are on the model tab, which the pick moved away from.
	await openAbout(browser);
	await chooseFlow(browser, flow);
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelectorAll("${SURFACE} [data-semantic-kind='step']").length`,
			),
		(steps) => steps > 0,
		"the exchange to be drawn",
		WAIT,
	);
	expect(await unresolvedPaints(browser, SURFACE)).toEqual([]);

	// And again on the other ground.
	await switchTheme(browser, "dark");
	await browser.run(["press", "Backspace"]);
	await pollUntil(
		() =>
			browser.eval<number>(
				`document.querySelectorAll("${SURFACE} [data-semantic-kind='edge']").length`,
			),
		(edges) => edges > 0,
		"the architecture to be drawn again",
		WAIT,
	);
	expect(await unresolvedPaints(browser, SURFACE)).toEqual([]);

	await server.assertRunning();
}, 90_000);
