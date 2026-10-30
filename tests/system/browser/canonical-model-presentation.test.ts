import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { readArchitectureModel } from "@archboard/board/store-read";
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
import { WAIT, press } from "./support/drilling.ts";
import { serverPath } from "./support/navigator-support.ts";
import { seedCanonicalModel, startModelWalkthrough } from "./support/canonical-page.ts";
import { stepBrowserMotion } from "./support/motion-clock.ts";

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
			` const stage = document.querySelector("[data-slot='model-walkthrough']") ?? document.querySelector("[data-slot='model-reading']");` +
			` const surface = stage?.querySelector("[data-slot='semantic-board-surface']");` +
			` const sidebar = document.querySelector("[data-slot='semantic-sidebar']");` +
			` return {` +
			`  step: stage?.querySelector("[data-slot='semantic-presentation']")?.getAttribute("data-step") ?? null,` +
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
		`(() => { const stage = document.querySelector("[data-slot='model-walkthrough']") ?? document.querySelector("[data-slot='model-reading']"); const card = [...stage.querySelectorAll("[data-slot='semantic-board-surface'] [data-semantic-kind='node']")]` +
			`.find((group) => group.textContent.includes(${JSON.stringify(words)}));` +
			` if (!card) return -1;` +
			// What a reader sees: the card's own opacity, under any opacity filter over it.
			` const look = getComputedStyle(card);` +
			` const filtered = /opacity\\(([\\d.]+)\\)/.exec(look.filter);` +
			` return Number(look.opacity) * (filtered ? Number(filtered[1]) : 1); })()`,
	);

/**
 * Watch the box hand a step over, a frame at a time, from now on: the shown step's heading as it
 * fades in, and the gold of the rail as it travels. What a real browser did is read afterwards.
 */
const WATCH_HAND_OVER = `(() => {
	const log = [];
	window.__handOver = log;
	(function frame() {
		const heading = document.querySelector("[data-slot='semantic-presentation-heading']");
		const gold = document.querySelector("[data-slot='semantic-presentation-rail'] [data-mark='gold']");
		log.push({
			text: heading?.textContent ?? null,
			opacity: heading ? Number(getComputedStyle(heading).opacity) : null,
			gold: gold ? new DOMMatrix(getComputedStyle(gold).transform).m41 : null,
		});
		requestAnimationFrame(frame);
	})();
	return true;
})()`;

/** What the sampler saw of the hand-over. */
interface HandOverFrame {
	readonly text: string | null;
	readonly opacity: number | null;
	readonly gold: number | null;
}

test("a person presents a walkthrough step by step, and leaving gives the pane back", async () => {
	await using resources = new AsyncDisposableStack();
	const vault = vaultIn(join(browserTestRoots().ownerRoot, "model-presentation"));
	const model = await seedCanonicalModel(vault, "Write path", {
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
		walkthroughs: [
			{
				name: "Where writes go",
				beats: [
					{ heading: "All of it", body: "Four parts, one direction." },
					{ heading: "The gateway", body: "Everything enters here." },
					{ heading: "The ledger", body: "Where it lands." },
				],
			},
		],
	});
	const tourPath = join(vault, "tour-0.walkthrough.json");
	const tour = JSON.parse(readFileSync(tourPath, "utf8"));
	tour.beats[1].reading.selection = [model.modules.find((module) => module.name === "Gateway")!.id];
	tour.beats[2].reading.selection = [model.modules.find((module) => module.name === "Ledger")!.id];
	writeFileSync(tourPath, JSON.stringify(tour));
	const before = await readArchitectureModel(vault);
	if (!before.success) throw new Error(JSON.stringify(before));
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);

	const browser = await stepBrowserMotion(resources.use(await createAgentBrowser()));
	await browser.run(["open", `${server.base}/?modelA=${model.manifest.id}`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => presented(browser),
		(state) => state.arrived && state.camera !== "",
		"the board to be drawn in its pane",
		WAIT,
	);
	const reader = await presented(browser);
	expect(reader.step).toBeNull();
	expect(reader.sidebar).toBe(true);

	// Presenting: the first step, in the frame, and the sidebar steps aside.
	await startModelWalkthrough(browser, model.walkthroughs[0]!.id);
	const first = await arrivedAt(browser, "0");
	expect(first.heading).toBe("All of it");
	expect(first.sidebar).toBe(false);

	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const key = document.querySelector('[data-slot="semantic-presentation-narrate"]');` +
					` if (!key) return false; const box = key.getBoundingClientRect();` +
					` const at = document.elementFromPoint(box.x + 40, box.y + box.height / 2);` +
					` return at !== null && key.contains(at); })()`,
			),
		Boolean,
		"the key that narrates to take the pointer at its foot",
		WAIT,
	);

	// A key steps, wherever focus is; the camera glides there and lands.
	await browser.eval(WATCH_HAND_OVER);
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
	// The box handed the step over rather than swapping it: the new heading faded in through frames
	// that were part way, and the gold of the rail travelled across, never going back.
	const handed = await pollUntil(
		() => browser.eval<HandOverFrame[]>("window.__handOver"),
		(frames) => frames.some((frame) => frame.text === "The gateway" && frame.opacity === 1),
		"the new heading to be all the way in",
		ARRIVAL,
	);
	const arriving = handed.filter((frame) => frame.text === "The gateway");
	expect(arriving.some((frame) => (frame.opacity ?? 0) > 0.05 && (frame.opacity ?? 1) < 0.95)).toBe(
		true,
	);
	const gold = handed.map((frame) => frame.gold ?? 0);
	const far = Math.max(...gold);
	expect(far).toBeGreaterThan(0);
	expect(gold.some((place) => place > 1 && place < far - 1)).toBe(true);
	expect(gold.every((place, at) => at === 0 || place >= (gold[at - 1] ?? 0) - 0.5)).toBe(true);
	// And what was shown has gone, not only faded: it can be neither seen nor reached.
	expect(
		await browser.eval<boolean>(
			`getComputedStyle(document.querySelector("[data-slot='presentation-slides'] > [data-place='before']")).visibility === "hidden"`,
		),
	).toBe(true);
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
	const after = await readArchitectureModel(vault);
	if (!after.success) throw new Error(JSON.stringify(after));
	expect(after.revision).toEqual(before.revision);
	await server.assertRunning();
}, 60_000);
