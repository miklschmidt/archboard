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
import { roleAction } from "./support/opener-settings-interaction.ts";
import { press } from "./support/drilling.ts";
import {
	A_SMALL_PIPELINE,
	addressShowing,
	seedSemanticBoard,
	stageState,
} from "./support/semantic-page.ts";
import { serverPath } from "./support/navigator-support.ts";

// Where the voice is, in the real shell, with the page's own demonstration of it (`?voiceDemo`)
// in place of a Codex session there is not here.
//
// While subtitles are on, the voice is not in the agent dock: it is in the voice box over the
// picture, where its words are read, and the dock's key ends voice. Turning subtitles off flies
// the one orb back to the circle at the head of the dock and takes the box away, and turning
// them on flies it out again. What this owner holds is what a person sees come out of that: one
// orb, resting exactly in the socket of the home it is in, never left in the air, and seen as one
// shared element: it leaves from where it was seen, the dock draws no seat for it while it is in the
// air, and the box draws none of its own. The page never grows past the window, not even for a frame.
// The box takes no pointer input from the picture except at its two controls, and keyboard focus
// follows the subtitles control from the surface that loses it to the one that takes it, pressed
// twice at once. Voice starting with subtitles on is lit in the box and not launched out of the Talk key.
//
// A presented walkthrough carries the voice at the foot of its own box, and the box keeps one height
// whether the voice is in it or not, so the picture does not move with the voice. A fullscreen
// presentation has no dock to take the voice back, so the box keeps it there whatever the person
// wants of subtitles, and the bar holds the key that ends it.

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
	/** Where the orb's middle is, or null while it is nowhere on the page. */
	readonly at: readonly [number, number] | null;
	/** How much of the orb shows: a flight carries an orb that is seen, and a fresh one has not faded in yet. */
	readonly opacity: number;
	/** Whether the box's socket draws a seat of its own: the plate is the orb's. */
	readonly boxDrawsSeat: boolean;
}

/** What the page saw of the orb and of itself on one frame. */
interface Seen {
	/** How far the page's scrollable size is past the window, in pixels. */
	readonly over: number;
	/** Whether the orb is in the layer it flies in. */
	readonly air: boolean;
	readonly at: readonly [number, number] | null;
	readonly opacity: number | null;
	/** The dock's key: the circle while the orb is at home in the dock, the key while it is not. */
	readonly form: string | null;
	/** How much of the dock's plate is drawn. */
	readonly seat: number | null;
	/** The home the orb rests in, or null while it is in the air. */
	readonly home: string | null;
	/** What the voice is doing, as the dock says. */
	readonly state: string | null;
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
	const seat = document.querySelector('[data-slot="voice-box"] [data-slot="voice-orb-socket"]');
	const seatStyle = seat ? getComputedStyle(seat) : null;
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
		at: holder && !Number.isNaN(hx) ? [hx, hy] : null,
		opacity: holder ? Number(getComputedStyle(holder).opacity) : 0,
		boxDrawsSeat: seatStyle ? Number.parseFloat(seatStyle.borderTopWidth) > 0 || seatStyle.boxShadow !== 'none' || seatStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' : false,
	};
})()`;

/** Watch the page a frame at a time, from now on: what it did while the orb moved is read afterwards. */
const WATCH = `(() => {
	const seen = [];
	window.__voiceSeen = seen;
	(function frame() {
		const page = document.scrollingElement;
		const holder = document.querySelector('[data-slot="voice-orb-holder"]');
		const box = holder?.getBoundingClientRect();
		const key = document.querySelector('[data-slot="voice-circle"]');
		const plate = key?.querySelector('[data-part="plate"]');
		seen.push({
			over: Math.max(page.scrollHeight - innerHeight, page.scrollWidth - innerWidth),
			air: holder?.parentElement?.getAttribute('data-slot') === 'voice-orb-layer',
			at: box && box.width ? [box.x + box.width / 2, box.y + box.height / 2] : null,
			opacity: holder ? Number(getComputedStyle(holder).opacity) : null,
			form: key?.getAttribute('data-form') ?? null,
			seat: plate ? Number(getComputedStyle(plate).opacity) : null,
			home: holder?.parentElement?.getAttribute('data-home') ?? null,
			state: key?.getAttribute('data-voice-state') ?? null,
		});
		requestAnimationFrame(frame);
	})();
	return true;
})()`;

/**
 * Everything the page has seen since it was watched.
 * @param browser The page.
 * @returns The frames, oldest first.
 */
const seenSoFar = (browser: AgentBrowserSession): Promise<Seen[]> =>
	browser.eval<Seen[]>("window.__voiceSeen");

/**
 * How far apart two places are.
 * @param from One place.
 * @param to Another.
 * @returns The distance in pixels.
 */
const apart = (from: readonly [number, number], to: readonly [number, number]): number =>
	Math.hypot(from[0] - to[0], from[1] - to[1]);

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
	await browser.eval(WATCH);

	// Subtitles start on: the voice is in the box, the dock is calm and its key ends voice.
	const boxed = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1 && where.opacity === 1,
		"the orb to rest in the voice box's socket, with all of it showing",
		WAIT,
	);
	expect(boxed.orbs).toBe(1);
	expect(boxed.form).toBe("key");
	expect(boxed.keyName).toBe("End voice");
	// The box lets the picture under its words take the pointer, and takes it at its control.
	expect(boxed.wordsClickThrough).toBeTrue();
	expect(boxed.controlClickable).toBeTrue();
	// The plate is the orb's, so the box has none of its own for an orb that has left to leave behind.
	expect(boxed.boxDrawsSeat).toBeFalse();

	// Turn subtitles off in the box: the orb flies home to the dock's circle and the box goes.
	const toDock = (await seenSoFar(browser)).length;
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	const docked = await pollUntil(
		() => voiceWhere(browser),
		(where) => !where.box && where.home === "dock" && where.off < 1,
		"the orb to be home in the dock's circle and the box to be gone",
		WAIT,
	);
	expect(docked.orbs).toBe(1);
	expect(docked.form).toBe("circle");
	// One shared element: it left from where the box had it, and the dock drew no circle for it
	// until it landed, so that no orb was seen at both ends.
	const flightToDock = (await seenSoFar(browser)).slice(toDock);
	const leavesBox = flightToDock.find((frame) => frame.air);
	expect(leavesBox?.at && boxed.at && apart(leavesBox.at, boxed.at)).toBeLessThan(24);
	const bound = flightToDock.filter((frame) => frame.air && frame.form === "circle");
	expect(bound.length).toBeGreaterThan(10);
	expect(Math.max(...bound.slice(-10).map((frame) => frame.seat ?? 1))).toBe(0);

	// And on again, from the dock's voice line: the orb flies out to the box.
	const toBox = (await seenSoFar(browser)).length;
	expect(await clickSubtitles(browser, "agent-dock")).toBeTrue();
	const again = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1,
		"the orb to fly back to the voice box",
		WAIT,
	);
	expect(again.orbs).toBe(1);
	expect(again.form).toBe("key");
	// It left the dock's circle from where the circle was, and not from where the key turned out to be.
	const leavesDock = (await seenSoFar(browser)).slice(toBox).find((frame) => frame.air);
	expect(leavesDock?.at && docked.at && apart(leavesDock.at, docked.at)).toBeLessThan(24);

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

	// The page was never larger than the window, on any frame of any of it.
	expect(Math.max(...(await seenSoFar(browser)).map((frame) => frame.over))).toBe(0);

	await server.assertRunning();
}, 40_000);

test("voice starting with subtitles on is lit in the box, and the orb is not launched out of the Talk key", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "voice-start-vault");
	mkdirSync(vault, { recursive: true });
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	await seedSemanticBoard(createJsonRequester(server), "pipeline");

	// The cycle begins at its start when the page opens: voice is off for a few seconds, then it starts.
	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${addressShowing(server.base, "pipeline")}&voiceDemo=cycle`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await browser.eval(WATCH);
	await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1,
		"the voice to start and the orb to rest in the voice box",
		{ timeoutMs: 15_000 },
	);

	const seen = await seenSoFar(browser);
	// The watch began while voice was off, or what follows proves nothing.
	expect(seen[0]?.state).toBe("off");
	// Nothing was launched: the orb was never in the air, and it showed nothing at the Talk key.
	expect(seen.some((frame) => frame.air)).toBeFalse();
	expect(
		Math.max(...seen.filter((frame) => frame.home === "dock").map((frame) => frame.opacity ?? 0)),
	).toBeLessThan(0.05);
	expect(Math.max(...seen.map((frame) => frame.over))).toBe(0);
	await server.assertRunning();
}, 40_000);

/** What the page says of a presented walkthrough's box and the voice at its foot. */
interface Presented {
	/** Whether the page is fullscreen. */
	readonly fullscreen: boolean;
	/** Where the voice box is drawn: `foot` inside the walkthrough's box, `free` over the picture, or null. */
	readonly place: string | null;
	/** Whether the orb rests inside the walkthrough's box. */
	readonly orbInBox: boolean;
	/** The walkthrough box's height in pixels, or 0 while nothing is presented. */
	readonly height: number;
	/** What the key that narrates says while it can be seen, or null while the voice has its place. */
	readonly narrate: string | null;
	/** What the presentation bar's voice key says, or null outside a presentation. */
	readonly bar: string | null;
	/** Whether the box's words show: `true` or `false`, or null with no box. */
	readonly words: string | null;
}

/** What the page says of the walkthrough's box. */
const PRESENTED = `(() => {
	const box = document.querySelector('[data-slot="semantic-presentation"]');
	const voice = document.querySelector('[data-slot="voice-box"]');
	const holder = document.querySelector('[data-slot="voice-orb-holder"]');
	const narrate = box?.querySelector('[data-slot="semantic-presentation-narrate"]');
	const key = document.querySelector('[data-slot="presentation-bar"] [data-voice-controls]');
	return {
		fullscreen: document.fullscreenElement !== null,
		place: voice?.getAttribute('data-place') ?? null,
		orbInBox: !!box && !!holder && box.contains(holder),
		height: box ? Math.round(box.getBoundingClientRect().height) : 0,
		narrate: narrate && getComputedStyle(narrate).visibility !== 'hidden' ? narrate.textContent.trim() : null,
		bar: key?.textContent?.trim() ?? null,
		words: voice?.querySelector('[data-slot="voice-subtitles"]')?.getAttribute('data-showing') ?? null,
	};
})()`;

/**
 * What the page says of the walkthrough's box.
 * @param browser The page.
 * @returns What the page says.
 */
const presentedNow = (browser: AgentBrowserSession): Promise<Presented> =>
	browser.eval<Presented>(PRESENTED);

test("a presented walkthrough carries the voice at the foot of its box, in the pane and in fullscreen", async () => {
	await using resources = new AsyncDisposableStack();
	const { ownerRoot } = browserTestRoots();
	const vault = join(ownerRoot, "voice-foot-vault");
	mkdirSync(vault, { recursive: true });
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	await seedSemanticBoard(createJsonRequester(server), "pipeline", {
		...A_SMALL_PIPELINE,
		walkthroughs: [
			{
				name: "The feed",
				beats: [
					{ heading: "It comes in", body: "Ingest takes the feed." },
					{ heading: "It is kept", body: "Warehouse keeps the rows." },
				],
			},
		],
	});

	const browser = resources.use(await createAgentBrowser());
	await browser.run(["open", `${addressShowing(server.base, "pipeline")}&voiceDemo`]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => stageState(browser.eval.bind(browser)),
		(state) => state === "drawn",
		"the board to be drawn before a walkthrough is presented",
		WAIT,
	);
	await browser.eval(WATCH);

	// Presenting while the voice box floats over the picture: the orb flies into the foot of the box.
	await press(browser, "[data-slot='semantic-walkthrough-choice']");
	const inFoot = await pollUntil(
		() => presentedNow(browser),
		(now) => now.place === "foot" && now.orbInBox,
		"the voice to move into the foot of the walkthrough's box",
		WAIT,
	);
	const there = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1 && where.opacity === 1,
		"the orb to rest in the foot's socket, with all of it showing",
		WAIT,
	);
	expect(there.orbs).toBe(1);
	expect(inFoot.narrate).toBeNull();

	// Subtitles off: the orb goes home to the dock, the foot keeps its place with the key that narrates
	// (which says why it cannot while a real voice is on, as the stage owners hold), and the box does
	// not change height, so the picture does not move with the voice.
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	const docked = await pollUntil(
		() => voiceWhere(browser),
		(where) => !where.box && where.home === "dock" && where.off < 1,
		"the orb to go home to the dock",
		WAIT,
	);
	expect(docked.orbs).toBe(1);
	const withoutBox = await pollUntil(
		() => presentedNow(browser),
		(now) => now.place === null && now.narrate !== null,
		"the foot to hold the key that narrates",
		WAIT,
	);
	expect(withoutBox.height).toBe(inFoot.height);
	expect(withoutBox.narrate).toContain("Narrate");

	// And on again, from the dock: back into the foot.
	expect(await clickSubtitles(browser, "agent-dock")).toBeTrue();
	await pollUntil(
		() => presentedNow(browser),
		(now) => now.place === "foot" && now.orbInBox && now.narrate === null,
		"the orb to fly back into the foot",
		WAIT,
	);

	// Fullscreen has no dock: the box keeps the voice there, and the bar's key ends it.
	await roleAction(browser, "button", "Present fullscreen");
	const full = await pollUntil(
		() => presentedNow(browser),
		(now) => now.fullscreen && now.place === "foot" && now.orbInBox && now.bar !== null,
		"the walkthrough's box to carry the voice in fullscreen, with the voice key in the bar",
		WAIT,
	);
	expect(full.bar).toBe("End voice");

	// What the person wants of subtitles decides only whether there are words: the voice stays in the box.
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	const quiet = await pollUntil(
		() => presentedNow(browser),
		(now) => now.words === "false",
		"the words to go while the voice stays in the box",
		WAIT,
	);
	expect(quiet.place).toBe("foot");
	expect(quiet.orbInBox).toBeTrue();
	expect((await voiceWhere(browser)).orbs).toBe(1);

	// Leaving the walkthrough leaves the voice in fullscreen, in the box over the picture. (Escape is
	// the browser's own there: it leaves fullscreen first.)
	await roleAction(browser, "button", "Leave the walkthrough");
	await pollUntil(
		() => presentedNow(browser),
		(now) => now.place === "free" && now.height === 0,
		"the voice to be in the box over the picture once the walkthrough is left",
		WAIT,
	);

	// Leaving fullscreen with subtitles off puts the orb back in the dock's circle.
	await roleAction(browser, "button", "Exit presentation");
	await pollUntil(
		() => voiceWhere(browser),
		(where) => !where.box && where.home === "dock" && where.off < 1,
		"the orb to be home in the dock once the presentation is left",
		WAIT,
	);

	expect(Math.max(...(await seenSoFar(browser)).map((frame) => frame.over))).toBe(0);
	await server.assertRunning();
}, 60_000);
