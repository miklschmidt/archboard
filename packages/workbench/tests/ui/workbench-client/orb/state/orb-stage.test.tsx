// Where the one voice orb is drawn, and how it gets from one home to the other.
//
// What is guarded: there is one orb, the same canvas in either home, so what it has drawn of the
// voice goes with it; it is flown between homes over the page and lands exactly in its socket;
// the opposite wish turns a flight round from where the orb is, not from where it began; it is
// cut, never left in the air or lost, when motion is not wanted and when a home is not on screen;
// a socket that goes while the orb is in it, or flying to it, leaves the orb where it was, and the
// orb goes on from there to whichever home is offered next, with no stop in between; a dark orb
// waits in a home and not out of sight, fades where it is and moves to the home it is wanted in
// only once it is out of sight, and is lit where it is wanted and not flown there; a socket says
// whether the orb rests in it, which is how the stylesheet draws a seat only for an orb that is
// there; a surface can ask whether a home is on the page; and while the page is fullscreen, which
// paints nothing but the element presented, a flight crosses inside that element and a home
// outside it is not on screen. The third home, a Narrate key, has its own owner (narrate-home).
//
// This DOM lays nothing out, so each socket is given a box, and the frames a flight runs on are
// stepped by hand (tests/ui/support/orb/stage-harness.ts).

import { render } from "@testing-library/react";
import { expect, test } from "bun:test";
import type { JSX } from "react";

import { VOICE_MS } from "@archboard/timing";
import {
	OrbHost,
	OrbSlot,
	OrbStageProvider,
} from "#ui/workbench-client/orb/components/OrbStage.tsx";
import type { OrbHome } from "#ui/workbench-client/orb/state/orb-stage.ts";
import { useOrbOffered, useOrbPlacement } from "#ui/workbench-client/orb/hooks/use-orb-stage.ts";
import {
	fading,
	homed,
	homes,
	inTheAir,
	placed,
	presentFullscreen,
	onStagePage,
	whereIs,
} from "#tests/ui/support/orb/stage-harness.ts";

onStagePage();

test("the orb rests in the home it is wanted in, and it is the one holder in either", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.dataset["shown"]).toBe("true");
	stage.wish({ home: "dock", shown: true, fly: false });
	expect(whereIs(stage)).toBe("dock");
});

test("a dark orb fades where it is, and only once it is out of sight waits in the home it is wanted in", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	const ended = fading(stage);
	stage.wish({ home: "dock", shown: false, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.dataset["shown"]).toBe("false");

	ended();
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("an orb is flown to its other home over the page and lands exactly in the socket", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("dock");

	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	frames.step(1000);
	expect(inTheAir(stage)).toEqual({ x: 100, y: 600 });

	frames.step(1000 + VOICE_MS.flight / 2);
	const halfway = inTheAir(stage);
	expect(halfway.x).toBeGreaterThan(100);
	expect(halfway.x).toBeLessThan(600);

	frames.step(1000 + VOICE_MS.flight);
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.style.position).toBe("");
	expect(document.querySelector("[data-slot='voice-orb-layer']")).toBeNull();
	expect(frames.pending).toBe(0);
});

test("the opposite wish turns a flight round from where the orb is", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.wish({ home: "box", shown: true, fly: true });
	frames.step(0);
	frames.step(VOICE_MS.flight * 0.6);
	const turned = inTheAir(stage);

	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	expect(inTheAir(stage)).toEqual(turned);

	frames.step(5000);
	frames.step(5000 + VOICE_MS.flight);
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("an orb is cut and not flown when motion is not wanted or a home is not on screen", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });

	stage.wish({ home: "box", shown: true, fly: false });
	expect(whereIs(stage)).toBe("box");

	// The dock is behind something that has no box on the page.
	placed(dock, 0, 0, 0);
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("a socket that goes while the orb rests in it leaves the orb in the other home, cut when motion is not wanted", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	withdrawBox();
	expect(whereIs(stage)).toBe("dock");
});

test("a socket that goes while the orb flies to it sends the orb on from where it was", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.wish({ home: "box", shown: true, fly: true });
	frames.step(0);
	frames.step(VOICE_MS.flight * 0.5);
	const left = inTheAir(stage);

	withdrawBox();
	// Still in the air, where it was: it is not dropped in the dock, and it does not jump.
	expect(whereIs(stage)).toBe("air");
	expect(inTheAir(stage)).toEqual(left);

	frames.step(10_000);
	frames.step(10_000 + VOICE_MS.flight);
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("a box that moves to another pane takes the orb on from where it was, and the orb never stops in the dock", () => {
	const { stage, frames, dock, box } = homes();
	const elsewhere = placed(document.createElement("div"), 900, 300, 64);
	document.body.append(elsewhere);
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");

	// The old box goes and the new one is offered in the same commit.
	withdrawBox();
	stage.offer("box", homed(elsewhere, "box"));
	expect(whereIs(stage)).toBe("air");
	frames.step(0);
	expect(inTheAir(stage)).toEqual({ x: 600, y: 700 });
	frames.step(VOICE_MS.flight);
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.parentElement).toBe(elsewhere);
});

test("a dark orb in a socket that goes waits in the home that is left, and is lit where it is wanted next", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	const withdrawBox = stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: false });
	stage.wish({ home: "dock", shown: false, fly: true });
	withdrawBox();
	expect(whereIs(stage)).toBe("dock");

	// Voice starts again with the box wanted: the orb is dark, so it is not launched out of the
	// dock's circle. It is lit in the box.
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(stage.holder.dataset["shown"]).toBe("true");
	expect(frames.pending).toBe(0);
});

test("a flight carries an orb that is seen: a dark one, and one only just lit, are lit where they are wanted", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	expect(whereIs(stage)).toBe("dock");
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(frames.pending).toBe(0);

	// Lit in the dock, and asked for in the box before its fade-in has shown anything.
	stage.wish({ home: "dock", shown: false, fly: false });
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.holder.style.opacity = "0.1";
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	expect(frames.pending).toBe(0);
});

test("a socket says whether the orb rests in it, in the air neither does, and the one it lands in does at once", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	expect([dock.hasAttribute("data-occupied"), box.hasAttribute("data-occupied")]).toEqual([
		true,
		false,
	]);

	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	expect([dock.hasAttribute("data-occupied"), box.hasAttribute("data-occupied")]).toEqual([
		false,
		false,
	]);

	frames.step(0);
	frames.step(VOICE_MS.flight);
	expect([dock.hasAttribute("data-occupied"), box.hasAttribute("data-occupied")]).toEqual([
		false,
		true,
	]);
});

test("a dark orb waits in the first home that is offered, and out of sight only while there is none", () => {
	const { stage, dock } = homes();
	expect(whereIs(stage)).toBe("garage");
	stage.offer("dock", homed(dock, "dock"));
	expect(whereIs(stage)).toBe("dock");
	expect(stage.holder.dataset["shown"]).toBe("false");
});

test("a home says whether it has a socket, and who hears of a socket coming or going is told", () => {
	const { stage, dock, box } = homes();
	let told = 0;
	const stopHearing = stage.subscribe(() => {
		told += 1;
	});
	expect(stage.offered("box")).toBe(false);
	const withdraw = stage.offer("box", homed(box, "box"));
	expect(stage.offered("box")).toBe(true);
	expect(stage.offered("dock")).toBe(false);
	withdraw();
	expect(stage.offered("box")).toBe(false);
	expect(told).toBe(2);

	stopHearing();
	stage.offer("dock", homed(dock, "dock"));
	expect(told).toBe(2);
});

test("an orb wanted in a home that is not there yet is in the other, and goes when the home comes", () => {
	const { stage, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.wish({ home: "box", shown: true, fly: false });
	expect(whereIs(stage)).toBe("dock");
	stage.offer("box", homed(box, "box"));
	expect(whereIs(stage)).toBe("box");
});

/**
 * The surfaces of a page that has the orb: both homes, and the one orb drawn.
 * @param props Where the orb is wanted.
 * @param props.home The home.
 * @param props.shown Whether it is lit.
 * @returns The surfaces.
 */
function Surfaces(props: { readonly home: OrbHome; readonly shown: boolean }): JSX.Element {
	useOrbPlacement({ home: props.home, shown: props.shown, reducedMotion: true });
	return (
		<>
			<OrbSlot home="dock" data-testid="dock" />
			<OrbSlot home="box" data-testid="box" />
			<OrbHost mode="listening" level={silence} reducedMotion />
		</>
	);
}

/**
 * The voice's level, which is none.
 * @returns Silence.
 */
function silence(): number {
	return 0;
}

/**
 * The orbs the page draws.
 * @returns Their canvases.
 */
function canvases(): HTMLCanvasElement[] {
	return [...document.querySelectorAll("canvas")];
}

test("the page draws one canvas, and it is the same canvas in whichever home it is in", () => {
	const view = render(
		<OrbStageProvider>
			<Surfaces home="dock" shown />
		</OrbStageProvider>,
	);
	expect(canvases()).toHaveLength(1);
	const [canvas] = canvases();
	if (canvas === undefined) throw new Error("The page draws no orb.");
	expect(view.getByTestId("dock").contains(canvas)).toBe(true);

	view.rerender(
		<OrbStageProvider>
			<Surfaces home="box" shown />
		</OrbStageProvider>,
	);
	expect(canvases()).toEqual([canvas]);
	expect(view.getByTestId("box").contains(canvas)).toBe(true);
	expect(view.getByTestId("dock").contains(canvas)).toBe(false);
});

/**
 * What a surface that asks whether the box is on the page sees.
 * @returns The answer, in a node a test can read.
 */
function AsksForTheBox(): JSX.Element {
	return <output data-testid="asked">{String(useOrbOffered("box"))}</output>;
}

test("a surface that asks for a home is told when its socket is on the page and when it is gone", () => {
	const view = render(
		<OrbStageProvider>
			<AsksForTheBox />
		</OrbStageProvider>,
	);
	expect(view.getByTestId("asked").textContent).toBe("false");

	view.rerender(
		<OrbStageProvider>
			<AsksForTheBox />
			<OrbSlot home="box" />
		</OrbStageProvider>,
	);
	expect(view.getByTestId("asked").textContent).toBe("true");

	view.rerender(
		<OrbStageProvider>
			<AsksForTheBox />
		</OrbStageProvider>,
	);
	expect(view.getByTestId("asked").textContent).toBe("false");
});

test("while the page is fullscreen a flight crosses inside the element presented, the only one the browser paints", () => {
	const { stage, frames, dock, box } = homes();
	const presented = document.createElement("div");
	document.body.append(presented);
	presented.append(dock, box);
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	presentFullscreen(presented);

	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");
	expect(stage.holder.parentElement?.parentElement).toBe(presented);
	frames.step(0);
	frames.step(VOICE_MS.flight);
	expect(whereIs(stage)).toBe("box");
});

test("a home outside the element presented is not on screen, so the orb is cut to and from it and not flown", () => {
	const { stage, frames, dock, box } = homes();
	const presented = document.createElement("div");
	document.body.append(presented);
	presented.append(box);
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	presentFullscreen(presented);

	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("box");
	stage.wish({ home: "dock", shown: true, fly: true });
	expect(whereIs(stage)).toBe("dock");
	expect(frames.pending).toBe(0);
});

test("a flight in the air when the page goes fullscreen lands where it was going", () => {
	const { stage, frames, dock, box } = homes();
	stage.offer("dock", homed(dock, "dock"));
	stage.offer("box", homed(box, "box"));
	stage.wish({ home: "dock", shown: true, fly: true });
	stage.wish({ home: "box", shown: true, fly: true });
	expect(whereIs(stage)).toBe("air");

	presentFullscreen(document.body);
	document.dispatchEvent(new Event("fullscreenchange"));
	expect(whereIs(stage)).toBe("box");
	expect(frames.pending).toBe(0);
});
