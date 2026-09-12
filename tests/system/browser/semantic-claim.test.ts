import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
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
import { addressShowing, seedSemanticBoard, stageState } from "./support/semantic-page.ts";
import { serverPath } from "./support/navigator-support.ts";

// What a person sees while an agent has the board, in the real shell (ADR 0022).
//
// The claim is not a lock the person has to discover by being refused: the pane
// says who has the board and why, offers the one control that ends it, and the
// board keeps drawing meanwhile — reading is never what a claim stops. And when
// the person does end it, the agent is told once, on its next write, rather
// than having its work rolled back.

/** Short on purpose: every wait here names itself well inside the owner's budget. */
const WAIT = { timeoutMs: 6_000 } as const;

/** The strip across the stage that says an agent has the board. */
const BANNER = "[data-slot='claim-banner']";

/**
 * What the claim banner says, or null when there is no banner.
 * @param browser The page.
 * @returns Its text.
 */
const bannerText = (browser: AgentBrowserSession): Promise<string | null> =>
	browser.eval<string | null>(`document.querySelector("${BANNER}")?.textContent ?? null`);

/**
 * Press the one control a person has over somebody else's claim.
 * @param browser The page.
 * @returns True when the control was there to press.
 */
const takeBackControl = (browser: AgentBrowserSession): Promise<boolean> =>
	browser.eval<boolean>(
		`(() => { const button = document.querySelector("${BANNER} button");` +
			` if (!button) return false; button.click(); return true; })()`,
	);

test("a claimed board says who has it, keeps drawing, and gives the person one way back", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "claim-vault");
	mkdirSync(vault, { recursive: true });
	const canvas = await startOwnedCanvas({ serverPath, vault, env: canvasTestEnvironment() });
	resources.defer(() => canvas.dispose());
	registerCanvasBase(canvas.base);
	const request = createJsonRequester(canvas);
	await seedSemanticBoard(request, "pipeline");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", addressShowing(canvas.base, "pipeline")]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser.eval.bind(browser)),
		(state) => state === "drawn",
		"the board to be drawn before anybody claims it",
		WAIT,
	);
	// Nothing is claimed, so nothing says anything: a banner nobody needs is a
	// banner that would stop meaning anything when it appeared.
	expect(await bannerText(browser)).toBeNull();

	const reason = "redrawing the payment path";
	const claimed = await request<{ success: boolean }>("/api/semantic-boards/claim?board=pipeline", {
		method: "POST",
		body: { reason },
	});
	expect(claimed.status).toBe(200);

	// The pane learns it from the server rather than by being refused something.
	const text = await pollUntil(
		() => bannerText(browser),
		(shown) => shown !== null && shown.includes(reason),
		"the pane to say who has the board and why",
		WAIT,
	);
	expect(text).toContain("Agent claimed this board");
	expect(text).toContain("read-only");
	// Reading is not what a claim stops: the picture is still there.
	expect(await stageState(browser.eval.bind(browser))).toBe("drawn");

	// The agent writes under its claim while the person watches, and the board
	// on screen follows it: a claim is one writer, not a frozen picture.
	const wrote = await request<{ version: number }>("/api/semantic-boards/edit?expectVersion=1", {
		method: "POST",
		doing: "adding the ledger",
		body: { board: "pipeline", edit: { nodes: [{ name: "Ledger", kind: "datastore" }] } },
	});
	expect(wrote.status).toBe(200);
	await pollUntil(
		() =>
			browser.eval<string>(
				`document.querySelector("[data-slot='semantic-board-surface']")?.textContent ?? ""`,
			),
		(drawn) => drawn.includes("Ledger"),
		"the claimed board's new version to reach the pane",
		WAIT,
	);

	// One control, pressed the way a person presses it.
	expect(await takeBackControl(browser)).toBeTrue();
	await pollUntil(
		() => bannerText(browser),
		(shown) => shown === null,
		"the banner to go once the person has the board back",
		WAIT,
	);

	// The agent is told once, on its next write, and told what it means: the
	// claim is gone and nothing it wrote was undone.
	const refused = await request<{ code: string; error: string }>(
		"/api/semantic-boards/claim?board=pipeline",
		{ method: "POST", body: { reason: "carrying on" } },
	);
	expect(refused.status).toBe(409);
	expect(refused.body.code).toBe("CLAIM_REVOKED");
	expect(refused.body.error).toContain("nothing was undone");
	// Everything the claim wrote is still on the board.
	const read = await request<{ board: { version: number } }>(
		"/api/semantic-boards/board?board=pipeline",
	);
	expect(read.body.board.version).toBe(2);

	await canvas.assertRunning();
}, 40_000);
