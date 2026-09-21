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
import { WAIT } from "./support/drilling.ts";
import { serverPath } from "./support/navigator-support.ts";
import { pictureAtRest } from "./support/semantic-page.ts";

// A walkthrough step asked of a pane by the server, in a real browser: the round
// trip a narrating voice agent depends on (TASK-251). The request crosses the
// pane's socket, the pane opens the presentation and really glides, and the
// server answers only after the pane's own report says the glide has landed. A
// person's hand on the keys is then told apart from the narrator's request.

/** What a present request answers with. */
interface Presented {
	readonly success: boolean;
	readonly outcome: {
		readonly kind: string;
		readonly reason?: string;
		readonly presentation?: {
			readonly beat: number;
			readonly of: number;
			readonly arrived: boolean;
		};
	};
}

/** What the page says about the presentation at one moment. */
interface OnScreen {
	readonly step: string | null;
	readonly moving: boolean;
	readonly heading: string | null;
}

/**
 * Where the pane is in its presentation.
 * @param browser The page.
 * @returns The step, whether anything is still moving, and the caption's heading.
 */
const onScreen = (browser: AgentBrowserSession): Promise<OnScreen> =>
	browser.eval<OnScreen>(
		`(() => {` +
			` const stage = document.querySelector("[data-slot='semantic-board-stage']");` +
			` const surface = document.querySelector("[data-slot='semantic-board-surface']");` +
			` return {` +
			`  step: stage?.getAttribute("data-presentation-step") ?? null,` +
			`  moving: !surface || surface.hasAttribute("data-camera-motion") || surface.hasAttribute("data-picture-motion"),` +
			`  heading: document.querySelector("[data-slot='semantic-presentation-heading']")?.textContent ?? null,` +
			` }; })()`,
	);

test("a step the server asks for is answered once it has landed, and a person's step is told apart", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "semantic-narration-vault");
	mkdirSync(join(vault, ".archboard"), { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);

	const created = await request<{ success: boolean }>("/api/semantic-boards/create", {
		method: "POST",
		doing: "explaining the write path",
		body: {
			board: "talk",
			origin: "agent",
			create: {
				level: "system",
				nodes: [
					{ name: "Gateway", kind: "route" },
					{ name: "Writer", kind: "module" },
					{ name: "Ledger", kind: "datastore" },
				],
				edges: [
					{ from: "Gateway", to: "Writer", kind: "call" },
					{ from: "Writer", to: "Ledger", kind: "data" },
				],
				walkthroughs: [
					{
						name: "Where writes go",
						beats: [
							{ heading: "All of it", body: "Three parts, one direction." },
							{ heading: "The gateway", body: "Everything enters here.", subjects: ["Gateway"] },
							{ heading: "The ledger", body: "Where it lands.", subjects: ["Ledger"] },
						],
					},
				],
			},
		},
	});
	expect(created.status).toBe(200);
	const file = join(vault, "talk.semantic.json");
	const before = readFileSync(file, "utf8");
	const board = JSON.parse(before) as {
		variants: { content: { walkthroughs: { id: string }[] } }[];
	};
	const walkthrough = board.variants[0]?.content.walkthroughs[0]?.id;
	expect(typeof walkthrough).toBe("string");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${canvas.base}/?paneA=talk`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => pictureAtRest(browser.eval.bind(browser)),
		(atRest) => atRest,
		"the board to be drawn in its pane",
		WAIT,
	);
	const panes = await request<{ panes: { paneId: string }[] }>("/api/panes");
	const pane = panes.body.panes[0]?.paneId;
	expect(typeof pane).toBe("string");

	// Nobody chose the walkthrough: the request opens the presentation on its
	// second step, and by the time it is answered the glide has landed.
	const asked = await request<Presented>("/api/panes/present", {
		method: "POST",
		body: { pane, walkthrough, beat: 1 },
	});
	expect(asked.body.outcome).toMatchObject({
		kind: "arrived",
		presentation: { beat: 1, of: 3, arrived: true },
	});
	expect(await onScreen(browser)).toEqual({ step: "1", moving: false, heading: "The gateway" });

	// A person steps by hand while the narrator asks for the first step again:
	// whichever lands, the server is never told a step arrived that is not the
	// one on screen.
	await browser.run(["press", "ArrowRight"]);
	await pollUntil(
		() => onScreen(browser),
		(state) => state.step === "2" && !state.moving,
		"the person's step to land",
		{ timeoutMs: 8_000 },
	);
	const again = await request<Presented>("/api/panes/present", {
		method: "POST",
		body: { pane, walkthrough, beat: 0 },
	});
	expect(again.body.outcome.kind).toBe("arrived");
	expect(await onScreen(browser)).toMatchObject({ step: "0", moving: false });

	// Asked to leave, the pane leaves, and says so.
	const left = await request<Presented>("/api/panes/present", {
		method: "POST",
		body: { pane, walkthrough: null },
	});
	expect(left.body.outcome.kind).toBe("left");
	expect((await onScreen(browser)).step).toBeNull();

	// A pane that is not there is refused rather than waited for.
	const nobody = await request<Presented>("/api/panes/present", {
		method: "POST",
		body: { pane: "no-such-pane", walkthrough, beat: 0 },
	});
	expect(nobody.status).toBe(409);
	expect(nobody.body.outcome).toMatchObject({ kind: "refused", reason: "no_pane" });

	// Narrating wrote nothing.
	expect(readFileSync(file, "utf8")).toBe(before);
	await canvas.assertRunning();
}, 60_000);
