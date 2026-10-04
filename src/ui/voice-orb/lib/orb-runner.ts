// What keeps the orb moving on a page: the canvas, its frames, and the theme.
// It runs one animation frame loop while the orb is lit or on its way to dark,
// and none while it is dark and meant to be. A person who asked for no motion
// gets the orb at rest in its mode, redrawn when the mode changes. It draws once
// more when the stage lands the orb in a room, so the room it left lets go of its
// light and the room it came to takes it up, even while nothing else moves.

import {
	createOrbDynamics,
	orbLight,
	orbMoves,
	restOrb,
	stepOrb,
	type OrbDynamics,
	type OrbMode,
} from "@/ui/voice-orb/lib/orb-dynamics";
import { readOrbColors, type OrbColors } from "@/ui/voice-orb/lib/orb-colors";
import { SIZE, paintOrb } from "@/ui/voice-orb/lib/orb-painter";
import { ORB_MOVED } from "@/ui/voice-orb/lib/orb-stage";

/** What the orb is told, read again on every frame from where the page keeps it. */
interface OrbFeed {
	readonly mode: { readonly current: OrbMode };
	/** The model's measured output level, 0..1, read by calling it. */
	readonly level: { readonly current: () => number };
}

/** How to keep the orb going, and how to let it go. */
interface OrbRunner {
	/** Draw again and, unless motion is off, run until the orb is dark. */
	readonly wake: () => void;
	readonly stop: () => void;
}

/** The part of the orb's run that changes from frame to frame. */
interface RunState {
	frame: number | null;
	last: number;
	colors: OrbColors;
	scale: number;
	/** The room the orb is lighting now: wherever it sits, which is not always the same place. */
	room: HTMLElement | null;
}

/** The step the first frame takes, when there was no frame before it. */
const FIRST_STEP_MS = 16.7;
/** The element whose room the orb lights, and the property it is told by. The dock and the voice box mark themselves. */
const LIT_HOST = "[data-lit-by-orb]";
const LIT_PROPERTY = "--lit";

/** Nothing to run: there is no canvas to draw on. */
function stay(): void {
	// A page that cannot draw has no orb to wake or stop.
}

const NO_RUNNER: OrbRunner = { wake: stay, stop: stay };

/**
 * Size the canvas for the screen it is on: one unit of drawing is one CSS pixel,
 * however many device pixels that is.
 * @param canvas The canvas.
 * @param context Its context.
 * @param state The run.
 */
function fitCanvas(
	canvas: HTMLCanvasElement,
	context: CanvasRenderingContext2D,
	state: RunState,
): void {
	const scale = Math.max(1, globalThis.devicePixelRatio);
	if (scale === state.scale) return;
	state.scale = scale;
	canvas.width = Math.round(SIZE * scale);
	canvas.height = Math.round(SIZE * scale);
	context.setTransform(scale, 0, 0, scale, 0, 0);
}

/**
 * Tell the room the orb sits in how much light the voice gives it, so the room can
 * answer. A room the orb has left is told it has none.
 * @param canvas The orb's canvas, inside the dock or the voice box, or in the air between them.
 * @param dyn The state.
 * @param state The run.
 */
function shareLight(canvas: HTMLCanvasElement, dyn: OrbDynamics, state: RunState): void {
	const room = canvas.closest<HTMLElement>(LIT_HOST);
	if (room !== state.room) {
		state.room?.style.removeProperty(LIT_PROPERTY);
		state.room = room;
	}
	room?.style.setProperty(LIT_PROPERTY, orbLight(dyn).toFixed(3));
}

/**
 * Run the orb on a canvas.
 * @param canvas The canvas.
 * @param feed What the orb is told.
 * @param reducedMotion Whether the person asked for no motion.
 * @returns How to wake it and how to stop it.
 */
function runOrb(canvas: HTMLCanvasElement, feed: OrbFeed, reducedMotion: boolean): OrbRunner {
	const context = canvas.getContext("2d");
	if (context === null) return NO_RUNNER;
	const dyn = createOrbDynamics();
	const state: RunState = {
		frame: null,
		last: 0,
		colors: readOrbColors(canvas),
		scale: 0,
		room: null,
	};
	/** Draw the orb as it stands. */
	const draw = (): void => {
		fitCanvas(canvas, context, state);
		paintOrb(context, dyn, state.colors);
		shareLight(canvas, dyn, state);
	};
	/**
	 * One frame: step on by the time that passed, draw, and ask for another while the orb moves.
	 * @param now The frame's time.
	 */
	const tick = (now: number): void => {
		state.frame = null;
		const step = state.last === 0 ? FIRST_STEP_MS : now - state.last;
		state.last = now;
		stepOrb(dyn, { mode: feed.mode.current, level: feed.level.current() }, step);
		draw();
		if (orbMoves(dyn, feed.mode.current)) state.frame = requestAnimationFrame(tick);
		else state.last = 0;
	};
	/** Draw again, and keep it going unless motion is off. */
	const wake = (): void => {
		if (reducedMotion) {
			restOrb(dyn, feed.mode.current);
			draw();
		} else if (state.frame === null) {
			state.frame = requestAnimationFrame(tick);
		}
	};
	const theme = new MutationObserver(() => {
		state.colors = readOrbColors(canvas);
		wake();
	});
	theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
	// The holder the stage moves the canvas with, which tells it when it has landed.
	const holder = canvas.parentElement;
	holder?.addEventListener(ORB_MOVED, wake);
	/** Stop watching the theme and the stage, and asking for frames. */
	const stop = (): void => {
		holder?.removeEventListener(ORB_MOVED, wake);
		theme.disconnect();
		if (state.frame !== null) cancelAnimationFrame(state.frame);
		state.frame = null;
	};
	return { wake, stop };
}

export { runOrb, type OrbFeed, type OrbRunner };
