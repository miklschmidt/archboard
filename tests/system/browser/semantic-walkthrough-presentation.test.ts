import { expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
import { WAIT, press } from "./support/drilling.ts";
import { serverPath } from "./support/navigator-support.ts";
import { pictureAtRest } from "./support/semantic-page.ts";

// Presenting a walkthrough in a real browser: the half only a browser can
// answer. Keys reach the presentation wherever focus is, the camera really
// glides and lands, what a step is not about really recedes as a computed
// style, and leaving gives the pane back as it was. Which step is on screen,
// and what it asks of the picture, are the stage owners'.

/** How long a step may take to arrive: a glide, or a picture carried across views. */
const ARRIVAL = { timeoutMs: 8_000 } as const;

/** Where a pane is in a presentation, read off the page. */
interface Presented {
	/** The step on screen, or null while nothing is presented. */
	readonly step: string | null;
	/** Whether the step has finished arriving: no glide, no picture still moving. */
	readonly arrived: boolean;
	/** The heading in the caption, or null. */
	readonly heading: string | null;
	/** Whether the sidebar can be seen. */
	readonly sidebar: boolean;
	/** The surface's transform. */
	readonly camera: string;
}

/**
 * Where the pane is in its presentation.
 * @param browser The page.
 * @returns What the page says.
 */
const presented = (browser: AgentBrowserSession): Promise<Presented> =>
	browser.eval<Presented>(
		`(() => {` +
			` const stage = document.querySelector("[data-slot='semantic-board-stage']");` +
			` const surface = document.querySelector("[data-slot='semantic-board-surface']");` +
			` const sidebar = document.querySelector("[data-slot='semantic-sidebar']");` +
			` return {` +
			`  step: stage?.getAttribute("data-presentation-step") ?? null,` +
			`  arrived: !!surface && !surface.hasAttribute("data-camera-motion") && !surface.hasAttribute("data-picture-motion"),` +
			`  heading: document.querySelector("[data-slot='semantic-presentation-heading']")?.textContent ?? null,` +
			`  sidebar: !!sidebar && sidebar.checkVisibility(),` +
			`  camera: surface?.style.transform ?? "",` +
			` }; })()`,
	);

/**
 * Wait for a step to have arrived.
 * @param browser The page.
 * @param step Which step.
 * @returns What the page says once it has.
 */
const arrivedAt = (browser: AgentBrowserSession, step: string): Promise<Presented> =>
	pollUntil(
		() => presented(browser),
		(state) => state.step === step && state.arrived,
		`step ${step} to finish arriving`,
		ARRIVAL,
	);

/**
 * How opaque one drawn subject is, as the browser computes it, by the words on it.
 * @param browser The page.
 * @param words What the subject says.
 * @returns Its computed opacity, or -1 when nothing says that.
 */
const opacityOfCard = (browser: AgentBrowserSession, words: string): Promise<number> =>
	browser.eval<number>(
		`(() => { const card = [...document.querySelectorAll("[data-slot='semantic-board-surface'] [data-semantic-kind='node']")]` +
			`.find((group) => group.textContent.includes(${JSON.stringify(words)}));` +
			` if (!card) return -1;` +
			// What a reader sees: the card's own opacity, under any opacity filter over it.
			` const look = getComputedStyle(card);` +
			` const filtered = /opacity\\(([\\d.]+)\\)/.exec(look.filter);` +
			` return Number(look.opacity) * (filtered ? Number(filtered[1]) : 1); })()`,
	);

test("a person presents a walkthrough step by step, and leaving gives the pane back", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "semantic-presentation-vault");
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	const created = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "explaining the write path",
		body: {
			board: "tour",
			origin: "agent",
			create: {
				level: "system",
				nodes: [
					{ name: "Gateway", kind: "route" },
					{ name: "Writer", kind: "module" },
					{ name: "Ledger", kind: "datastore" },
					{ name: "Reports", kind: "datastore" },
				],
				edges: [
					{ from: "Gateway", to: "Writer", kind: "call", label: "hands it over" },
					{ from: "Writer", to: "Ledger", kind: "data", label: "writes" },
					{ from: "Ledger", to: "Reports", kind: "data", label: "feeds" },
				],
				views: [{ name: "The write", grammar: "architecture" }],
				walkthroughs: [
					{
						name: "Where writes go",
						beats: [
							{ heading: "All of it", body: "Four parts, one direction." },
							{ heading: "The gateway", body: "Everything enters here.", subjects: ["Gateway"] },
							{ heading: "The ledger", body: "Where it lands.", subjects: ["Ledger"] },
						],
					},
				],
			},
		},
	});
	expect(created.status).toBe(200);
	const before = readFileSync(join(vault, "tour.semantic.json"), "utf8");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=tour`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => pictureAtRest(browser.eval.bind(browser)),
		(atRest) => atRest,
		"the board to be drawn in its pane",
		WAIT,
	);
	const reader = await presented(browser);
	expect(reader.step).toBeNull();
	expect(reader.sidebar).toBe(true);

	// Presenting: the first step, in the frame, and the sidebar steps aside.
	await press(browser, "[data-slot='semantic-walkthrough-choice']");
	const first = await arrivedAt(browser, "0");
	expect(first.heading).toBe("All of it");
	expect(first.sidebar).toBe(false);

	// A key steps, wherever focus is; the camera glides there and lands.
	await browser.run(["press", "ArrowRight"]);
	await pollUntil(
		() => presented(browser),
		(state) => state.step === "1",
		"the second step to be asked for",
		WAIT,
	);
	const second = await arrivedAt(browser, "1");
	expect(second.heading).toBe("The gateway");
	expect(second.camera).not.toBe(first.camera);
	// What the step is about stands; the rest recedes, once the cross-fade is done.
	await pollUntil(
		() => opacityOfCard(browser, "Reports"),
		(opacity) => opacity > 0 && opacity < 1,
		"what the step is not about to recede",
		ARRIVAL,
	);
	expect(await opacityOfCard(browser, "Gateway")).toBe(1);

	// The controls step too.
	await press(browser, "[data-slot='semantic-presentation-next']");
	const third = await arrivedAt(browser, "2");
	expect(third.heading).toBe("The ledger");
	expect(third.camera).not.toBe(second.camera);

	// Escape leaves, and the pane is the reader's again, where they had it.
	await browser.run(["press", "Escape"]);
	const left = await pollUntil(
		() => presented(browser),
		(state) => state.step === null && state.sidebar && state.camera === reader.camera,
		"the pane to be given back as it was",
		ARRIVAL,
	);
	expect(left.heading).toBeNull();
	await pollUntil(
		() => opacityOfCard(browser, "Reports"),
		(opacity) => opacity === 1,
		"nothing to recede once the walkthrough is left",
		ARRIVAL,
	);

	// Nothing a person did in the browser wrote a board.
	expect(readFileSync(join(vault, "tour.semantic.json"), "utf8")).toBe(before);
	await canvas.assertRunning();
}, 60_000);
