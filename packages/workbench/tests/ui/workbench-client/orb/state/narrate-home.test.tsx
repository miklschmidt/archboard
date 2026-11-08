// The orb's third home: the gold circle of a presented walkthrough's Narrate key.
//
// What is guarded: a dark orb waits in the key while one is on the page, and a lit one never falls
// back to it; the newest key is the home's, and the one before it is the home's again once it goes;
// a press of Narrate launches the next orb that is lit out of the key that was pressed, lit from the
// start of its flight, to the box or, with subtitles off, the dock; the launch is cut when motion is not wanted,
// spent with that lighting and lost with its key, so voice started by Talk is lit where it is
// wanted; as voice ends in the box the orb flies home to the key while it is lit, stays lit in the
// air if voice is off before it lands, and fades in the key's seat; and while the page is
// fullscreen a launch waits in its key for a home on screen and crosses inside the element
// presented.

import { expect, test } from "bun:test";

import { VOICE_MS } from "@archboard/timing";
import {
	homed,
	homes,
	inTheAir,
	narrateKey,
	presentFullscreen,
	onStagePage,
	whereIs,
} from "#tests/ui/support/orb/stage-harness.ts";

onStagePage();

test("a dark orb waits in the Narrate key, a lit one never falls back to it, and the newest key is the home's", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const key = narrateKey();
	const withdrawKey = stage.offer("narrate", key);
	expect(whereIs(stage)).toBe("narrate");
	expect(key.hasAttribute("data-occupied")).toBe(true);

	// Voice started by Talk: the dark orb is lit where it is wanted, and not launched out of the key.
	stage.offer("box", homed(box, "box"));
	expect(whereIs(stage)).toBe("narrate");
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(key.hasAttribute("data-occupied")).toBe(false);
	stage.wish({ home: "dock", shown: true, fly: false });
	expect(whereIs(stage)).toBe("dock");

	// A second presented pane's key is the home's while it is on the page, and the first is again once it goes.
	stage.wish({ home: "dock", shown: false, fly: true });
	const second = narrateKey(500, 650);
	const withdrawSecond = stage.offer("narrate", second);
	expect(stage.holder.parentElement).toBe(second);
	withdrawSecond();
	expect(stage.holder.parentElement).toBe(key);
	withdrawKey();
	expect(whereIs(stage)).toBe("dock");
});

test("a press of the older of two Narrate keys launches the orb out of that key, and brings it back there", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	const first = narrateKey();
	stage.offer("narrate", first);
	const second = narrateKey(500, 650);
	stage.offer("narrate", second);
	expect(stage.holder.parentElement).toBe(second);

	// The dark orb moves into the key that was pressed, and leaves it lit.
	stage.launch(first);
	expect(stage.holder.parentElement).toBe(first);
	stage.wish({ home: "box", shown: true, fly: true });
	frames.step(0);
	expect(inTheAir(stage)).toEqual({ x: 900, y: 650 });
	frames.step(VOICE_MS.flight);
	expect(whereIs(stage)).toBe("box");

	// As voice ends, it flies back to the key it left.
	stage.wish({ home: "narrate", shown: true, fly: true });
	frames.step(0);
	frames.step(VOICE_MS.flight);
	expect(stage.holder.parentElement).toBe(first);
	expect(first.hasAttribute("data-occupied")).toBe(true);
});

test("a press of Narrate launches the orb voice lights out of the key, lit from the start of its flight", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const key = narrateKey();
	stage.offer("narrate", key);
	stage.launch(key);

	// The dock wishes the orb in itself until it hears of the box, which comes in the same moment.
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	expect(stage.holder.dataset["shown"]).toBe("true");
	expect(stage.holder.hasAttribute("data-launched")).toBe(true);
	expect(key.hasAttribute("data-occupied")).toBe(false);
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: true });
	frames.step(0);
	expect(inTheAir(stage)).toEqual({ x: 900, y: 650 });
	frames.step(VOICE_MS.flight);
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.hasAttribute("data-launched")).toBe(false);

	// The launch is spent: voice started again by Talk is lit where it is wanted.
	stage.wish({ home: "dock", shown: false, fly: true });
	expect(whereIs(stage)).toBe("narrate");
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(frames.pending).toBe(0);
});

test("with subtitles off a launch flies out of the key to the dock", () => {
	const { stage, frames, dock } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const key = narrateKey();
	stage.offer("narrate", key);
	stage.launch(key);
	stage.wish({ home: "dock", shown: true, fly: true });
	frames.step(0);
	expect(inTheAir(stage)).toEqual({ x: 900, y: 650 });
	frames.step(VOICE_MS.flight);
	expect(whereIs(stage)).toBe("dock");
	expect(stage.holder.dataset["shown"]).toBe("true");
	expect(key.hasAttribute("data-occupied")).toBe(false);
});

test("a launch is cut when motion is not wanted, and is lost when its key goes", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	const key = narrateKey();
	const withdrawKey = stage.offer("narrate", key);
	stage.launch(key);
	stage.wish({ home: "box", shown: true, fly: false });
	expect(whereIs(stage)).toBe("box");
	expect(frames.pending).toBe(0);

	stage.wish({ home: "dock", shown: false, fly: true });
	stage.launch(key);
	withdrawKey();
	stage.offer("narrate", narrateKey(500, 650));
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(frames.pending).toBe(0);
});

test("as voice ends in the box the orb flies home to the Narrate key while it is lit, and fades there", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	const key = narrateKey();
	stage.offer("narrate", key);
	stage.wish({ home: "box", shown: true, fly: false });
	stage.wish({ home: "box", shown: true, fly: true });

	stage.wish({ home: "narrate", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	frames.step(0);
	expect(inTheAir(stage)).toEqual({ x: 600, y: 700 });

	// Voice is off before the orb is home, and the dock wishes it in itself: the orb is bound for the
	// key it waits in, so it stays lit in the air, and lands in the key's seat before it fades.
	stage.wish({ home: "dock", shown: false, fly: true });
	frames.step(VOICE_MS.flight / 2);
	expect(whereIs(stage)).toBe("air");
	expect(stage.holder.dataset["shown"]).toBe("true");
	frames.step(VOICE_MS.flight);
	expect(whereIs(stage)).toBe("narrate");
	expect(key.hasAttribute("data-occupied")).toBe(true);
	expect(stage.holder.dataset["shown"]).toBe("false");
	expect(frames.pending).toBe(0);
});

test("while the page is fullscreen a launch waits in its key for a home on screen, and crosses inside the element presented", () => {
	const { stage, frames, dock, box } = homes();
	const presented = document.createElement("div");
	document.body.append(presented);
	const key = narrateKey();
	presented.append(box, key);
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("narrate", key);
	presentFullscreen(presented);
	stage.launch(key);

	// The dock is outside the element presented, so the orb is not launched for it.
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("narrate");
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	expect(stage.holder.parentElement?.parentElement).toBe(presented);
	frames.step(0);
	frames.step(VOICE_MS.flight);
	expect(whereIs(stage)).toBe("box");
});
