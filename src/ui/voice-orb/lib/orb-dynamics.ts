// How the voice orb moves. The frame loop steps this state and the painter
// reads it, so what looks like light following a voice is a few numbers that
// ease toward where the voice is. Nothing here touches the page.
//
// The model's measured output level is the only input from the voice. Everything
// the eye reads as detail comes from it: a quick follower for the syllables, a
// slow one for the sentence, a spark for a hard onset, and a ridge of past values
// that rolls a loud moment back through the lines.

import {
	VOICE_ATTACK_MS,
	VOICE_EXTINGUISH_MS,
	VOICE_HUSH_MS,
	VOICE_IGNITE_MS,
	VOICE_PULSE_MS,
	VOICE_PULSE_REST_MS,
	VOICE_RELEASE_MS,
	VOICE_RING_TURN_MS,
	VOICE_ROW_STEP_MS,
	VOICE_SPARK_MS,
	VOICE_SWELL_MS,
} from "@/shared/timing/voice";

/** What the orb shows, from the voice's stage. */
type OrbMode = "off" | "starting" | "listening" | "speaking" | "muted" | "ending";

/** What the orb is given each frame. */
interface OrbInput {
	readonly mode: OrbMode;
	/** The model's measured output level, 0..1. */
	readonly level: number;
}

/** A value that eases to a target with no kink at either end: a critically damped spring. */
interface Spring {
	x: number;
	v: number;
}

/** How many lines the ridge has. */
const ROWS = 11;

/** The longest step the state takes at once, so a stalled tab does not jump on return. */
const MAX_STEP_MS = 50;
/** One frame at 60 Hz, which a rise in the level is measured against. */
const FRAME_MS = 16.7;
/** How many full-scale levels one frame's rise must be, to bite. */
const SPARK_GAIN = 7;
/** The level that is as loud as the orb draws. Speech sits well under full scale. */
const FULL_LEVEL = 0.2;
/** How far the spark must rise before a ring leaves, and how lit the orb must be for it to. */
const PULSE_SPARK = 0.45;
const PULSE_PRESENCE = 0.95;
/** The most rings in the air at once. */
const MAX_PULSES = 3;
/** The state at which a critically damped spring has settled, in time constants. */
const SETTLE_CONSTANTS = 6;
/** How much faster the ring's sheen turns while the voice is at its fullest. */
const SHEEN_GAIN = 14;
/** A full turn. */
const TAU = Math.PI * 2;

/** How lit the orb is for each mode: ringed and waiting, or ringed and alive. */
const PRESENCE: Readonly<Record<OrbMode, number>> = {
	off: 0,
	ending: 0,
	starting: 0.6,
	listening: 1,
	speaking: 1,
	muted: 1,
};

/** Everything the painter reads. */
interface OrbDynamics {
	/** The mode the last frame was in, to notice the moment voice connects. */
	mode: OrbMode;
	/** How lit the orb is: the ring draws to 0.6 and the lines rise from there. */
	readonly presence: Spring;
	/** How hushed it is: 1 when muted. */
	readonly hush: Spring;
	/** How much it is waiting on the connection: 1 while starting. */
	readonly pending: Spring;
	/** The quick follower of the level, 0..1. */
	voice: number;
	/** The slow follower, 0..1. */
	swell: number;
	/** The bite of a hard onset, 0..1. */
	spark: number;
	/** The level of the last frame. */
	previous: number;
	/** The time the orb has run, in milliseconds. */
	clock: number;
	/** How far the ring's sheen has turned, in radians. It turns faster while the voice is loud. */
	turn: number;
	sinceRow: number;
	sincePulse: number;
	/** The voice a ridge step ago, line by line: the front line first. */
	readonly rows: Float32Array;
	/** How far each ring in the air has gone, 0..1. */
	readonly pulses: number[];
}

/**
 * A new orb, dark.
 * @returns The state.
 */
function createOrbDynamics(): OrbDynamics {
	return {
		mode: "off",
		presence: { x: 0, v: 0 },
		hush: { x: 0, v: 0 },
		pending: { x: 0, v: 0 },
		voice: 0,
		swell: 0,
		spark: 0,
		previous: 0,
		clock: 0,
		turn: 0,
		sinceRow: 0,
		sincePulse: VOICE_PULSE_REST_MS,
		rows: new Float32Array(ROWS),
		pulses: [],
	};
}

/**
 * Ease a spring toward a target. The closed form of a critically damped spring,
 * so it is exact at any step and cannot overshoot.
 * @param spring The spring.
 * @param target Where it goes.
 * @param settleMs How long it takes to settle.
 * @param dtMs The step.
 */
function easeSpring(spring: Spring, target: number, settleMs: number, dtMs: number): void {
	const omega = SETTLE_CONSTANTS / (settleMs / 1000);
	const dt = dtMs / 1000;
	const delta = spring.x - target;
	const carried = (spring.v + omega * delta) * dt;
	const decay = Math.exp(-omega * dt);
	spring.x = target + (delta + carried) * decay;
	spring.v = (spring.v - omega * carried) * decay;
}

/**
 * The level the orb draws: the model's output, bent so that speech reaches the
 * top of the lines and a whisper still lifts them.
 * @param level The measured level, 0..1.
 * @returns A number in 0..1.
 */
function drawnLevel(level: number): number {
	if (!Number.isFinite(level) || level <= 0) return 0;
	return Math.min(1, Math.sqrt(level / FULL_LEVEL));
}

/**
 * The level the orb hears in a mode: the model's, while it can be heard.
 * @param input The mode and the level.
 * @returns A number in 0..1.
 */
function heard(input: OrbInput): number {
	const audible = input.mode === "listening" || input.mode === "speaking";
	return audible ? drawnLevel(input.level) : 0;
}

/**
 * Follow the level: fast up, slow down, with a slow swell under it and a spark
 * where it rises hard.
 * @param dyn The state.
 * @param level The level now.
 * @param dtMs The step.
 */
function followLevel(dyn: OrbDynamics, level: number, dtMs: number): void {
	const tau = level > dyn.voice ? VOICE_ATTACK_MS : VOICE_RELEASE_MS;
	dyn.voice += (level - dyn.voice) * (1 - Math.exp(-dtMs / tau));
	dyn.swell += (dyn.voice - dyn.swell) * (1 - Math.exp(-dtMs / VOICE_SWELL_MS));
	const rise = (Math.max(0, level - dyn.previous) * FRAME_MS) / dtMs;
	dyn.spark = Math.max(
		dyn.spark * Math.exp(-dtMs / VOICE_SPARK_MS),
		Math.min(1, rise * SPARK_GAIN),
	);
	dyn.previous = level;
}

/**
 * Carry the ridge back a step when one has passed: every line takes what the
 * line in front of it showed, and the front line takes the voice now.
 * @param dyn The state.
 * @param dtMs The step.
 */
function rollRows(dyn: OrbDynamics, dtMs: number): void {
	dyn.sinceRow += dtMs;
	if (dyn.sinceRow < VOICE_ROW_STEP_MS) return;
	dyn.sinceRow %= VOICE_ROW_STEP_MS;
	dyn.rows.copyWithin(1, 0, ROWS - 1);
	dyn.rows[0] = dyn.voice;
}

/**
 * Send a ring when the voice bites hard enough and one is allowed.
 * @param dyn The state.
 * @param dtMs The step.
 */
function launchPulse(dyn: OrbDynamics, dtMs: number): void {
	dyn.sincePulse += dtMs;
	const allowed = dyn.sincePulse >= VOICE_PULSE_REST_MS && dyn.pulses.length < MAX_PULSES;
	if (!allowed || dyn.spark <= PULSE_SPARK || dyn.presence.x <= PULSE_PRESENCE) return;
	dyn.pulses.push(0);
	dyn.sincePulse = 0;
}

/**
 * Let the rings in the air widen, and take back the ones that have faded.
 * @param dyn The state.
 * @param dtMs The step.
 */
function ageRings(dyn: OrbDynamics, dtMs: number): void {
	for (let index = dyn.pulses.length - 1; index >= 0; index -= 1) {
		const age = (dyn.pulses[index] ?? 1) + dtMs / VOICE_PULSE_MS;
		if (age >= 1) dyn.pulses.splice(index, 1);
		else dyn.pulses[index] = age;
	}
}

/**
 * Send a ring of light the moment voice is connected, so that arriving is felt
 * as well as seen: the mode leaves starting for one that is lit.
 * @param dyn The state.
 * @param mode The mode now.
 */
function noticeMode(dyn: OrbDynamics, mode: OrbMode): void {
	if (dyn.mode === "starting" && PRESENCE[mode] === 1) {
		dyn.pulses.push(0);
		dyn.sincePulse = 0;
	}
	dyn.mode = mode;
}

/**
 * Move the orb on by one frame.
 * @param dyn The state.
 * @param input The mode and the level.
 * @param stepMs The time since the last frame.
 */
function stepOrb(dyn: OrbDynamics, input: OrbInput, stepMs: number): void {
	const dt = Math.min(Math.max(stepMs, 1), MAX_STEP_MS);
	noticeMode(dyn, input.mode);
	const target = PRESENCE[input.mode];
	easeSpring(
		dyn.presence,
		target,
		target > dyn.presence.x ? VOICE_IGNITE_MS : VOICE_EXTINGUISH_MS,
		dt,
	);
	easeSpring(dyn.hush, input.mode === "muted" ? 1 : 0, VOICE_HUSH_MS, dt);
	easeSpring(dyn.pending, input.mode === "starting" ? 1 : 0, VOICE_HUSH_MS, dt);
	followLevel(dyn, heard(input), dt);
	rollRows(dyn, dt);
	launchPulse(dyn, dt);
	ageRings(dyn, dt);
	dyn.clock += dt;
	dyn.turn += (dt / VOICE_RING_TURN_MS) * TAU * (1 + SHEEN_GAIN * dyn.swell);
}

/**
 * Put the orb where a mode rests, with no motion: for a person who asked for none.
 * @param dyn The state.
 * @param mode The mode.
 */
function restOrb(dyn: OrbDynamics, mode: OrbMode): void {
	const resting = mode === "speaking" ? 0.5 : 0;
	dyn.mode = mode;
	dyn.presence.x = PRESENCE[mode];
	dyn.hush.x = mode === "muted" ? 1 : 0;
	dyn.pending.x = mode === "starting" ? 1 : 0;
	dyn.presence.v = 0;
	dyn.hush.v = 0;
	dyn.pending.v = 0;
	dyn.voice = resting;
	dyn.swell = resting;
	dyn.spark = 0;
	dyn.rows.fill(resting);
	dyn.pulses.length = 0;
}

/**
 * How much light the orb gives the room around it: the sentence's swell with the
 * syllables on top, and nothing while it is hushed.
 * @param dyn The state.
 * @returns A number in 0..1.
 */
function orbLight(dyn: OrbDynamics): number {
	const spoken = 0.65 * dyn.swell + 0.35 * dyn.voice;
	return Math.min(1, spoken) * Math.max(0, 1 - dyn.hush.x) * Math.min(1, dyn.presence.x);
}

/**
 * Whether the orb still has anything to draw or anywhere to go: lit, or on its way.
 * @param dyn The state.
 * @param mode The mode it is heading to.
 * @returns False once it is dark, still and meant to be.
 */
function orbMoves(dyn: OrbDynamics, mode: OrbMode): boolean {
	const dark = mode === "off" || mode === "ending";
	return !dark || dyn.presence.x > 0.002 || dyn.pulses.length > 0;
}

export {
	ROWS,
	TAU,
	createOrbDynamics,
	orbLight,
	orbMoves,
	restOrb,
	stepOrb,
	type OrbDynamics,
	type OrbInput,
	type OrbMode,
};
