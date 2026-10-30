import { expect, test } from "bun:test";

import { createAgentBrowser, pollUntil } from "./support/agent-browser.ts";
import { askToSpeak } from "./support/codex-live-voice.ts";
import { stepBrowserMotion } from "./support/motion-clock.ts";
import { seedCanonicalModel, modelAddress, modelDrawn } from "./support/canonical-page.ts";
import {
	SUBTITLES_IN_BOX,
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

// Where the voice is, in the real shell, with a real voice session started by Talk over the fake
// Codex and stand-in browser media (support/voice-box-page.ts).
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
// The voice in a presented walkthrough's box is held by voice-box-presented.test.ts.

test("the voice is in the box while subtitles are on, and the one orb flies between the box and the dock", async () => {
	await using resources = new AsyncDisposableStack();
	const { server, fixture } = await startVoiceServer(resources, "voice-box-vault");
	const model = await seedCanonicalModel(server.vault, "pipeline");

	const browser = await stepBrowserMotion(resources.use(await createAgentBrowser()));
	await openForVoice(browser, modelAddress(server.base, model));
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() => modelDrawn(browser.eval.bind(browser)),
		Boolean,
		"the board to be drawn before the voice is looked at",
		WAIT,
	);
	await browser.eval(WATCH);
	await talk(browser);

	// Subtitles start on: the voice is in the box, the dock is calm and its key ends voice.
	await pollUntil(
		() => voiceWhere(browser),
		(where) => where.box && where.home === "box" && where.off < 1 && where.opacity === 1,
		"the orb to rest in the voice box's socket, with all of it showing",
		WAIT,
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

	// The voice speaks again, so that its words are in the box when the pointer is tried on them.
	await askToSpeak(fixture);
	const boxed = await pollUntil(
		() => voiceWhere(browser),
		(where) => where.words && where.box && where.home === "box" && where.off < 1,
		"the voice's words to show in the box, with the orb at rest in it",
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

	// The page was never larger than the window, on any frame of any of it. The keyboard's handoff
	// opens the tooltip of the dock's control while the dock is still growing to show it.
	expect(Math.max(...(await seenSoFar(browser)).map((frame) => frame.over))).toBe(0);

	await server.assertRunning();
}, 40_000);
