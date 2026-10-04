import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

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
import { addressShowing, seedSemanticBoard, stageState } from "./support/semantic-page.ts";
import { serverPath } from "./support/navigator-support.ts";

// Where the voice is, in the real shell, with the page's own demonstration of it (`?voiceDemo`)
// in place of a Codex session there is not here.
//
// While subtitles are on, the voice is not in the agent dock: it is in the voice box over the
// picture, where its words are read, and the dock's key ends voice. Turning subtitles off flies
// the one orb back to the circle at the head of the dock and takes the box away, and turning
// them on flies it out again. What this owner holds is what a person sees come out of that: one
// orb, resting exactly in the socket of the home it is in, never left in the air, with the box
// taking no pointer input from the picture except at its two controls, and keyboard focus following
// the subtitles control from the surface that loses it to the one that takes it, pressed twice at once.

/** The subtitles control in the voice box. */
const SUBTITLES_IN_BOX = '[data-slot="voice-box"] [data-slot="voice-subtitles-toggle"]';

/** Short on purpose: a flight is under a second, and every wait here names itself. */
const WAIT = { timeoutMs: 8_000 } as const;

/** Where the voice is, as the page shows it. */
interface VoiceWhere {
	/** Whether the voice box is on the page. */
	readonly box: boolean;
	/** The home the orb rests in, or null while it is in the air. */
	readonly home: string | null;
	/** How far the orb's middle is from its socket's, in pixels. */
	readonly off: number;
	/** The dock's key: the circle while the orb is at home in the dock, the key while the box has it. */
	readonly form: string | null;
	readonly keyName: string | null;
	/** How many orbs the page draws, wherever they are. */
	readonly orbs: number;
	/** The surface that holds keyboard focus: the voice box, the dock, or neither. */
	readonly focus: string | null;
	/** Whether the box's own words let the picture under them take the pointer. */
	readonly wordsClickThrough: boolean;
	/** Whether the box's subtitles control takes the pointer. */
	readonly controlClickable: boolean;
}

/** What the page says of where the voice is. */
const WHERE = `(() => {
	const centre = (element) => {
		const box = element.getBoundingClientRect();
		return [box.x + box.width / 2, box.y + box.height / 2];
	};
	const holder = document.querySelector('[data-slot="voice-orb-holder"]');
	const socket = holder?.parentElement?.getAttribute('data-slot') === 'voice-orb-socket' ? holder.parentElement : null;
	const [hx, hy] = holder ? centre(holder) : [Number.NaN, Number.NaN];
	const [sx, sy] = socket ? centre(socket) : [Number.NaN, Number.NaN];
	const key = document.querySelector('[data-slot="voice-circle"]');
	const words = document.querySelector('[data-slot="voice-box"] [data-slot="voice-subtitles"]');
	const control = document.querySelector('[data-slot="voice-box"] [data-slot="voice-subtitles-toggle"]');
	const under = (element) => {
		const [x, y] = centre(element);
		return document.elementFromPoint(x, y);
	};
	return {
		box: document.querySelector('[data-slot="voice-box"]') !== null,
		home: socket?.getAttribute('data-home') ?? null,
		off: socket ? Math.round(Math.hypot(hx - sx, hy - sy) * 10) / 10 : -1,
		form: key?.getAttribute('data-form') ?? null,
		keyName: key?.getAttribute('aria-label') ?? null,
		orbs: document.querySelectorAll('[data-slot="voice-orb"]').length,
		focus: document.activeElement?.closest('[data-slot="voice-box"], [data-slot="agent-dock"]')?.getAttribute('data-slot') ?? null,
		wordsClickThrough: words ? !under(words)?.closest('[data-slot="voice-box"]') : true,
		controlClickable: control ? under(control) === control || control.contains(under(control)) : true,
	};
})()`;

/**
 * Where the voice is.
 * @param browser The page.
 * @returns What the page says.
 */
const voiceWhere = (browser: AgentBrowserSession): Promise<VoiceWhere> =>
	browser.eval<VoiceWhere>(WHERE);

/**
 * Click the subtitles control in one surface, where a script can: the keyboard has its own check below.
 * @param browser The page.
 * @param surface The surface that has it.
 * @returns True when the control was there to click.
 */
const clickSubtitles = (browser: AgentBrowserSession, surface: "voice-box" | "agent-dock") =>
	browser.eval<boolean>(
		`(() => { const button = document.querySelector('[data-slot="${surface}"] [data-slot="voice-subtitles-toggle"]');` +
			` if (!button) return false; button.click(); return true; })()`,
	);

test("the voice is in the box while subtitles are on, and the one orb flies between the box and the dock", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "voice-box-vault");
	mkdirSync(vault, { recursive: true });
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	await seedSemanticBoard(createJsonRequester(server), "pipeline");

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${addressShowing(server.base, "pipeline")}&voiceDemo`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser.eval.bind(browser)),
		(state) => state === "drawn",
		"the board to be drawn before the voice is looked at",
		WAIT,
	);

	// Subtitles start on: the voice is in the box, the dock is calm and its key ends voice.
	const boxed = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1,
		"the orb to rest in the voice box's socket",
		WAIT,
	);
	expect(boxed.orbs).toBe(1);
	expect(boxed.form).toBe("key");
	expect(boxed.keyName).toBe("End voice");
	// The box lets the picture under its words take the pointer, and takes it at its control.
	expect(boxed.wordsClickThrough).toBeTrue();
	expect(boxed.controlClickable).toBeTrue();

	// Turn subtitles off in the box: the orb flies home to the dock's circle and the box goes.
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	const docked = await pollUntil(
		() => voiceWhere(browser),
		(where) => !where.box && where.home === "dock" && where.off < 1,
		"the orb to be home in the dock's circle and the box to be gone",
		WAIT,
	);
	expect(docked.orbs).toBe(1);
	expect(docked.form).toBe("circle");

	// And on again, from the dock's voice line: the orb flies out to the box.
	expect(await clickSubtitles(browser, "agent-dock")).toBeTrue();
	const again = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1,
		"the orb to fly back to the voice box",
		WAIT,
	);
	expect(again.orbs).toBe(1);
	expect(again.form).toBe("key");

	// From the keyboard: Enter on the box's control hands focus to the dock's, and Enter there, at
	// once, hands it back to the box's, which is still leaving or has only just gone.
	await browser.run(["focus", SUBTITLES_IN_BOX]);
	expect((await voiceWhere(browser)).focus).toBe("voice-box");
	await browser.run(["press", "Enter"]);
	expect((await voiceWhere(browser)).focus).toBe("agent-dock");
	await browser.run(["press", "Enter"]);
	const boxAgain = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1,
		"the orb to fly back to the voice box once more",
		WAIT,
	);
	expect(boxAgain.focus).toBe("voice-box");
	expect(boxAgain.orbs).toBe(1);

	await server.assertRunning();
}, 40_000);
