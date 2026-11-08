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
	apart,
	clickSubtitles,
	openForVoice,
	seenSoFar,
	startVoiceServer,
	talk,
	voiceWhere,
} from "./support/voice-box-page.ts";

// The voice of a presented walkthrough, in the real shell, with a real voice session started by
// Talk over the fake Codex and stand-in browser media (support/voice-box-page.ts).
//
// A presented walkthrough stands in a column beside the picture, and the voice box stays where the
// stage lays it, low over the picture, as it floats while nothing is presented. The column keeps the
// key that narrates, which says why it cannot while a voice is on. The key's gold circle is a home of
// the one orb: the dark orb waits there while voice is off, Narrate launches it out of the key into
// the box, the key is the hang-up key while the orb is in the box, and a voice that ends there sends
// the orb home to the key. A fullscreen presentation has no
// dock to take the voice back, so the box keeps it there whatever the person wants of subtitles,
// which decide only whether there are words, and the bar holds the key that ends it. A fullscreen
// page paints only the element presented, so on no frame may a lit orb be outside it.

/** What the page says of a presented walkthrough and the voice over its picture. */
interface Presented {
	/** Whether the page is fullscreen. */
	readonly fullscreen: boolean;
	/** Where the voice box is drawn: `over` the picture, `column` in the walkthrough's column, `elsewhere`, or null. */
	readonly box: "over" | "column" | "elsewhere" | null;
	/** Whether the orb rests in the voice box. */
	readonly orbInBox: boolean;
	/** Whether a walkthrough's column is on the page. */
	readonly presented: boolean;
	/**
	 * The column's key that narrates: `offered`, `held` while it cannot, `hang-up` while the orb is in
	 * the voice box and the key ends the voice, or null without one.
	 */
	readonly narrate: "offered" | "held" | "hang-up" | null;
	/** What the presentation bar's voice key is, `talk` or `live`, or null outside a presentation. */
	readonly bar: string | null;
	/** Whether the box's words show: `true` or `false`, or null with no box. */
	readonly words: string | null;
	/** Whether the orb rests in the Narrate key's gold circle: `occupied`, `empty`, or null without a key. */
	readonly seat: "occupied" | "empty" | null;
}

/** What the page says of the walkthrough and the voice. */
const PRESENTED = `(() => {
	const column = document.querySelector('[data-slot="semantic-presentation"]');
	const voice = [...document.querySelectorAll('[data-slot="voice-box"]:not([data-leaving])')].find(element => element.checkVisibility());
	const holder = document.querySelector('[data-slot="voice-orb-holder"]');
	const narrate = column?.querySelector('[data-slot="semantic-presentation-narrate"]');
	const key = document.querySelector('[data-slot="presentation-bar"] [data-voice-key]');
	const seat = narrate?.querySelector('[data-slot="voice-orb-socket"]');
	const where = !voice ? null
		: voice.closest('[data-slot="semantic-stage-overlay"]') ? 'over'
		: column?.contains(voice) ? 'column' : 'elsewhere';
	return {
		fullscreen: document.fullscreenElement !== null,
		box: where,
		orbInBox: !!voice && !!holder && voice.contains(holder),
		presented: column !== null,
		narrate: !narrate ? null
			: narrate.getAttribute('data-hang-up') === 'true' ? 'hang-up'
			: narrate.getAttribute('aria-disabled') === 'true' ? 'held' : 'offered',
		bar: key?.getAttribute('data-voice-key') ?? null,
		words: voice?.querySelector('[data-slot="voice-subtitles"]')?.getAttribute('data-showing') ?? null,
		seat: !seat ? null : seat.hasAttribute('data-occupied') ? 'occupied' : 'empty',
	};
})()`;

/**
 * What the page says of the walkthrough and the voice.
 * @param browser The page.
 * @returns What the page says.
 */
const presentedNow = (browser: AgentBrowserSession): Promise<Presented> =>
	browser.eval<Presented>(PRESENTED);

/** A model with a walkthrough of two steps, for the tests of the voice over a presented one. */
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

test("a presented walkthrough leaves the voice box low over its picture, in the pane and in fullscreen", async () => {
	await using resources = new AsyncDisposableStack();
	const { server, fixture } = await startVoiceServer(resources, "voice-over-vault");
	const model = await seedCanonicalModel(server.vault, "pipeline", TOUR);

	const browser = await stepBrowserMotion(resources.use(await createAgentBrowser()));
	await openForVoice(browser, modelAddress(server.base, model));
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => modelDrawn(browser.eval.bind(browser)),
		Boolean,
		"the model to be drawn before a walkthrough is presented",
		WAIT,
	);
	await browser.eval(WATCH);
	await talk(browser);
	await pollUntil(
		() => presentedNow(browser),
		(now) => now.box === "over" && !now.presented,
		"the voice box to float over the picture once voice has started",
		WAIT,
	);

	// Presenting while the voice box floats over the picture: the steps stand in the column, and the
	// box stays over the picture with the orb in it. The column's key is the hang-up key.
	await startModelWalkthrough(browser, model.walkthroughs[0]!.id);
	const over = await pollUntil(
		() => presentedNow(browser),
		(now) => now.presented && now.box === "over" && now.orbInBox,
		"the voice box to stay over the picture of the presented walkthrough",
		WAIT,
	);
	expect(over.narrate).toBe("hang-up");
	const there = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1 && where.opacity === 1,
		"the orb to rest in the box's socket, with all of it showing",
		WAIT,
	);
	expect(there.orbs).toBe(1);

	// Subtitles off: the orb goes home to the dock, and the column keeps its key.
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	const docked = await pollUntil(
		() => voiceWhere(browser),
		(where) => !where.box && where.home === "dock" && where.off < 1,
		"the orb to go home to the dock",
		WAIT,
	);
	expect(docked.orbs).toBe(1);
	const withoutBox = await presentedNow(browser);
	expect(withoutBox).toMatchObject({ box: null, presented: true, narrate: "held" });

	// And on again, from the dock: back over the picture. Then off again, so that fullscreen is
	// entered with the orb in a dock that fullscreen is about to hide.
	expect(await clickSubtitles(browser, "agent-dock")).toBeTrue();
	await pollUntil(
		() => presentedNow(browser),
		(now) => now.box === "over" && now.orbInBox,
		"the orb to fly back into the box over the picture",
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
		(now) => now.fullscreen && now.box === "over" && now.orbInBox && now.bar !== null,
		"the box over the picture to carry the voice in fullscreen, with the voice key in the bar",
		WAIT,
	);
	expect(full.bar).toBe("live");
	expect((await voiceWhere(browser)).orbs).toBe(1);
	// Subtitles are still off: the box holds the voice and says nothing.
	await wordsStay(browser, fixture, "false");

	// What the person wants of subtitles decides only whether there are words, and the voice stays.
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	await wordsStay(browser, fixture, "true");
	expect((await presentedNow(browser)).box).toBe("over");
	expect(await clickSubtitles(browser, "voice-box")).toBeTrue();
	await wordsStay(browser, fixture, "false");
	const quiet = await presentedNow(browser);
	expect(quiet.box).toBe("over");
	expect(quiet.orbInBox).toBeTrue();
	// All of it is the one session Talk started in the dock: fullscreen started no other.
	expect(voiceStarts(fixture)).toBe(1);

	// Leaving the walkthrough leaves the voice in fullscreen, in the box over the picture. (Escape is
	// the browser's own there: it leaves fullscreen first.)
	await roleAction(browser, "button", "Leave the walkthrough");
	await pollUntil(
		() => presentedNow(browser),
		(now) => now.box === "over" && !now.presented,
		"the voice to stay in the box over the picture once the walkthrough is left",
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

/** The column's key that narrates. */
const NARRATE = '[data-slot="semantic-presentation"] [data-slot="semantic-presentation-narrate"]';

/** Where the middle of the Narrate key's gold circle is. */
const SEAT_AT = `(() => {
	const box = document.querySelector('${NARRATE} [data-slot="voice-orb-socket"]').getBoundingClientRect();
	return [box.x + box.width / 2, box.y + box.height / 2];
})()`;

test("Narrate launches the orb out of its key into the voice box, and hanging up there sends it home to the key", async () => {
	await using resources = new AsyncDisposableStack();
	const { server } = await startVoiceServer(resources, "voice-narrate-vault");
	const model = await seedCanonicalModel(server.vault, "pipeline", TOUR);

	const browser = await stepBrowserMotion(resources.use(await createAgentBrowser()));
	await openForVoice(browser, modelAddress(server.base, model));
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => modelDrawn(browser.eval.bind(browser)),
		Boolean,
		"the model to be drawn before a walkthrough is presented",
		WAIT,
	);
	await startModelWalkthrough(browser, model.walkthroughs[0]!.id);

	// Voice is off: the dark orb waits in the key's gold circle.
	await pollUntil(
		() => presentedNow(browser),
		(now) => now.narrate === "offered" && now.seat === "occupied",
		"the dark orb to wait in the Narrate key",
		WAIT,
	);
	expect((await voiceWhere(browser)).home).toBe("narrate");
	const seat = await browser.eval<[number, number]>(SEAT_AT);

	// Narrate: the orb leaves the key lit and rests in the box over the picture, and the key's seat is empty.
	await browser.eval(WATCH);
	await browser.run(["click", NARRATE]);
	const boxed = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1 && where.opacity === 1,
		"the orb to rest in the box's socket, with all of it showing",
		WAIT,
	);
	expect(boxed.orbs).toBe(1);
	expect(await presentedNow(browser)).toMatchObject({
		box: "over",
		seat: "empty",
		narrate: "hang-up",
	});
	const launch = (await seenSoFar(browser)).filter((frame) => frame.air && frame.at !== null);
	// It was flown, and it left from the key's circle.
	expect(launch.length).toBeGreaterThan(0);
	expect(apart(launch[0]!.at!, seat)).toBeLessThan(2);

	// The key hangs up: the orb flies out of the box, and rests in the key's circle once voice is off.
	await browser.eval(WATCH);
	await browser.run(["click", NARRATE]);
	const home = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.home === "narrate" && where.off < 1 && where.opacity === 0,
		"the orb to rest in the Narrate key, dark",
		WAIT,
	);
	expect(home.orbs).toBe(1);
	expect(await presentedNow(browser)).toMatchObject({ seat: "occupied", narrate: "offered" });
	const back = (await seenSoFar(browser)).filter((frame) => frame.air && frame.at !== null);
	expect(back.length).toBeGreaterThan(0);
	await server.assertRunning();
}, 60_000);
