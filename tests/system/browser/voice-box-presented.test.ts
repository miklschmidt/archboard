import { expect, test } from "bun:test";

import {
	createAgentBrowser,
	pollUntil,
	type AgentBrowserSession,
} from "./support/agent-browser.ts";
import type { ProductionFixture } from "../server-state/support/codex-production.ts";
import { askToSpeak, lineSaid, voiceStarts } from "./support/codex-live-voice.ts";
import { roleAction } from "./support/opener-settings-interaction.ts";
import { stepBrowserMotion } from "./support/motion-clock.ts";
import {
	startModelWalkthrough,
	SMALL_PIPELINE,
	modelAddress,
	seedCanonicalModel,
	modelDrawn,
} from "./support/canonical-page.ts";
import {
	WAIT,
	WATCH,
	clickSubtitles,
	openForVoice,
	seenSoFar,
	startVoiceServer,
	talk,
	voiceWhere,
} from "./support/voice-box-page.ts";

// The voice in the box of a presented walkthrough, in the real shell, with a real voice session
// started by Talk over the fake Codex and stand-in browser media (support/voice-box-page.ts).
//
// A presented walkthrough carries the voice at the foot of its own box, and the box keeps one height
// whether the voice is in it or not, so the picture does not move with the voice. A fullscreen
// presentation has no dock to take the voice back, so the box keeps it there whatever the person
// wants of subtitles, which decide only whether there are words, and the bar holds the key that ends
// it. A fullscreen page paints only the element presented, so on no frame may a lit orb be outside it.
// The key that narrates, at the foot while the voice is off, takes the pointer through the empty
// layer that the shell lays over it.

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
	/** Whether the key that narrates can be seen: it gives way while the voice has its place. */
	readonly narrateShown: boolean;
	/** What the presentation bar's voice key is, `talk` or `live`, or null outside a presentation. */
	readonly bar: string | null;
	/** Whether the box's words show: `true` or `false`, or null with no box. */
	readonly words: string | null;
}

/** What the page says of the walkthrough's box. */
const PRESENTED = `(() => {
	const box = document.querySelector('[data-slot="semantic-presentation"]');
	const voice = [...document.querySelectorAll('[data-slot="voice-box"]')].find(element => element.checkVisibility());
	const holder = document.querySelector('[data-slot="voice-orb-holder"]');
	const narrate = box?.querySelector('[data-slot="semantic-presentation-narrate"]');
	const key = document.querySelector('[data-slot="presentation-bar"] [data-voice-key]');
	return {
		fullscreen: document.fullscreenElement !== null,
		place: voice?.getAttribute('data-place') ?? null,
		orbInBox: !!box && !!holder && box.contains(holder),
		height: box ? Math.round(box.getBoundingClientRect().height) : 0,
		narrateShown: !!narrate && getComputedStyle(narrate).visibility !== 'hidden',
		bar: key?.getAttribute('data-voice-key') ?? null,
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

/** A board with a walkthrough of two steps, for the tests of the box a presented one has. */
const TOUR = {
	...SMALL_PIPELINE,
	walkthroughs: [
		{
			name: "The feed",
			beats: [
				{ heading: "It comes in", body: "Ingest takes the feed." },
				{ heading: "It is kept", body: "Warehouse keeps the rows." },
			],
		},
	],
};

/**
 * Have the voice say a line, and hold the box's words to what they are told to do while it does:
 * words show only for what is said after subtitles are turned on, so without a line said now one
 * look at the words proves nothing about them.
 * @param browser The page.
 * @param fixture The fake Codex, whose voice says the line.
 * @param showing What the words do: `true` once they show, `false` for the whole line.
 */
async function wordsStay(
	browser: AgentBrowserSession,
	fixture: ProductionFixture,
	showing: "true" | "false",
): Promise<void> {
	const line = await askToSpeak(fixture);
	if (showing === "true") {
		await pollUntil(
			() => presentedNow(browser),
			(now) => now.words === "true",
			"the voice's words to show",
			WAIT,
		);
		return;
	}
	// A word that shows stays for the linger, so a look until the last word is out sees any of them.
	const looks: (string | null)[] = [];
	await pollUntil(
		async () => {
			looks.push((await presentedNow(browser)).words);
			return lineSaid(fixture, line);
		},
		Boolean,
		"the voice to say its whole line",
		WAIT,
	);
	// Every look found the box, and its words hidden.
	expect(looks.filter((words) => words !== "false")).toEqual([]);
}

test("a presented walkthrough carries the voice at the foot of its box, in the pane and in fullscreen", async () => {
	await using resources = new AsyncDisposableStack();
	const { server, fixture } = await startVoiceServer(resources, "voice-foot-vault");
	const model = await seedCanonicalModel(server.vault, "pipeline", TOUR);

	const browser = await stepBrowserMotion(resources.use(await createAgentBrowser()));
	await openForVoice(browser, modelAddress(server.base, model));
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => modelDrawn(browser.eval.bind(browser)),
		Boolean,
		"the board to be drawn before a walkthrough is presented",
		WAIT,
	);
	await browser.eval(WATCH);
	await talk(browser);
	await pollUntil(
		() => presentedNow(browser),
		(now) => now.place === "free",
		"the voice box to float over the picture once voice has started",
		WAIT,
	);

	// Presenting while the voice box floats over the picture: the orb flies into the foot of the box.
	await startModelWalkthrough(browser, model.walkthroughs[0]!.id);
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
	expect(inFoot.narrateShown).toBeFalse();

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
		(now) => now.place === null && now.narrateShown,
		"the foot to hold the key that narrates",
		WAIT,
	);
	expect(withoutBox.height).toBe(inFoot.height);

	// And on again, from the dock: back into the foot. Then off again, so that fullscreen is entered
	// with the orb in a dock that fullscreen is about to hide.
	expect(await clickSubtitles(browser, "agent-dock")).toBeTrue();
	await pollUntil(
		() => presentedNow(browser),
		(now) => now.place === "foot" && now.orbInBox && !now.narrateShown,
		"the orb to fly back into the foot",
		WAIT,
	);
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	await pollUntil(
		() => voiceWhere(browser),
		(where) => !where.box && where.home === "dock" && where.off < 1,
		"the orb to be home in the dock again",
		WAIT,
	);

	// Fullscreen has no dock: the box takes the voice there whatever the person wants of subtitles,
	// and the bar's key ends it.
	await roleAction(browser, "button", "Present fullscreen");
	const full = await pollUntil(
		() => presentedNow(browser),
		(now) => now.fullscreen && now.place === "foot" && now.orbInBox && now.bar !== null,
		"the walkthrough's box to carry the voice in fullscreen, with the voice key in the bar",
		WAIT,
	);
	expect(full.bar).toBe("live");
	expect((await voiceWhere(browser)).orbs).toBe(1);
	// Subtitles are still off: the box holds the voice and says nothing.
	await wordsStay(browser, fixture, "false");

	// What the person wants of subtitles decides only whether there are words, and the voice stays.
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	await wordsStay(browser, fixture, "true");
	expect((await presentedNow(browser)).place).toBe("foot");
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	await wordsStay(browser, fixture, "false");
	const quiet = await presentedNow(browser);
	expect(quiet.place).toBe("foot");
	expect(quiet.orbInBox).toBeTrue();
	// All of it is the one session Talk started in the dock: fullscreen started no other.
	expect(voiceStarts(fixture)).toBe(1);

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

	// On no frame of any of it was a lit orb where the page does not paint, and the page never grew.
	const frames = await seenSoFar(browser);
	expect(frames.some((frame) => frame.hidden)).toBeFalse();
	expect(Math.max(...frames.map((frame) => frame.over))).toBe(0);
	await server.assertRunning();
}, 90_000);
