// What the picture lights because of where a person's attention is.
//
// Poking a part asks what it is wired to, and the picture answers: the part, its
// relationships and the parts at their other ends stay as drawn, and the rest
// recedes. A part that is picked lights its connections for as long as it is
// picked. The pointer resting on another part lights that one's more lightly,
// and gives the pick back when it goes. A row of the sidebar's list lights the
// relationship it is about while it is pointed at. A trace asked of the picked
// part lights, beyond its connections, everything it reaches in one direction,
// each further hop more faintly. With nothing poked, a step through a chosen
// design question lights its whole answer, and the connections of the subject
// the person is at (ADR 0059), so letting go of a pick brings that light back.
//
// The light is attention only. It stands down while a presented step or a group
// says what the picture is about, while the picture is leaving, and for a part
// with nothing drawn to light.

import { useMemo, type PointerEvent } from "react";

import type { SemanticAtlas } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";
import type { Peeked, Trace } from "#ui/components/semantic-board-canvas/Peek.tsx";
import { useRestingPart } from "#ui/hooks/semantic-board-canvas/use-resting-part.ts";
import type { VariantReading } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import {
	litByAnswer,
	litInPicture,
	withReach,
	type AnswerStep,
	type Wiring,
} from "#ui/rules/semantic-board-canvas/board/connections.ts";
import type { GroupSelection } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { Departure } from "#ui/clients/semantic-board-canvas/picture/picture-departure.ts";
import { reachOf } from "#ui/rules/semantic-board-canvas/board/reach.ts";
import type { ProbeMode } from "#ui/clients/semantic-board-canvas/subjects/subjects.ts";

/** What decides the lighting. */
interface LightingInputs {
	/** What the board says about the variant the picture draws, or null while that is not known. */
	readonly reading: VariantReading | null;
	/** Where every subject of the picture ended up: only a drawn relationship has anything to light. */
	readonly atlas: SemanticAtlas;
	/** The subject picked out, or null. */
	readonly selection: string | null;
	/** What the sidebar is asking the picture to show. */
	readonly peeked: Peeked;
	/** What a presented step's veil leaves standing, or null for no veil. */
	readonly veil: ReadonlySet<string> | null;
	/** The step of a presented walkthrough on screen, or null or undefined while none is presented. */
	readonly presenting: number | null | undefined;
	/** Whether a group is selected. */
	readonly group: GroupSelection | null;
	/** Where the person is in the chosen design question's answer, or null while none is chosen. */
	readonly answer: AnswerStep | null;
	/** Where the reader went, while the picture is on its way out. */
	readonly departure: Departure | null;
}

/** What the picture lights, and what moves it. */
interface Lighting {
	/** Every subject the light leaves standing, a trace's reach included; null for none. */
	readonly light: ReadonlySet<string> | null;
	/** What is left standing on the picture: a presented step's veil when there is one, else the light. */
	readonly standing: ReadonlySet<string> | null;
	/** How many hops beyond the first each subject a trace reached is, or null without a trace. */
	readonly reach: ReadonlyMap<string, number> | null;
	/** How strongly the light answers, or null for no light. */
	readonly mode: ProbeMode | null;
	/**
	 * The pointer moved over the picture while no gesture is under way.
	 * @param event The move.
	 */
	readonly onHover: (event: PointerEvent<HTMLElement>) => void;
	/** The pointer left the picture, or the picture moved under it. */
	readonly release: () => void;
}

/**
 * Whether something else says what the picture is about: a presented walkthrough,
 * a group, or the picture leaving.
 * @param inputs What decides the lighting.
 * @returns True when the light stands down.
 */
function standsDown(inputs: LightingInputs): boolean {
	return (
		inputs.veil !== null ||
		(inputs.presenting ?? null) !== null ||
		inputs.group !== null ||
		inputs.departure !== null
	);
}

/**
 * The trace asked for, when it is about the part that is picked out.
 * @param inputs What decides the lighting.
 * @returns The trace, or null.
 */
function traceOf(inputs: LightingInputs): Trace | null {
	const { trace } = inputs.peeked;
	return trace !== null && trace.part === inputs.selection ? trace : null;
}

/**
 * The part the light is about: what the sidebar points at, else the part a trace
 * was asked of or the one the pointer rests on, else the pick; none while
 * something else says what the picture is about.
 * @param inputs What decides the lighting.
 * @param trace The trace asked for the picked part, or null.
 * @param resting The part the pointer rests on, or null.
 * @returns The part, or null.
 */
function pokedBy(
	inputs: LightingInputs,
	trace: Trace | null,
	resting: string | null,
): string | null {
	if (standsDown(inputs)) {
		return null;
	}
	return inputs.peeked.row ?? (trace === null ? resting : null) ?? inputs.selection;
}

/**
 * The step through the chosen question's answer, while the light is the
 * question's: nothing is poked and nothing else says what the picture is about.
 * @param inputs What decides the lighting.
 * @param poked The part the light is about, or null.
 * @returns The step, or null.
 */
function answerLit(inputs: LightingInputs, poked: string | null): AnswerStep | null {
	return poked !== null || standsDown(inputs) ? null : inputs.answer;
}

/**
 * The parts and relationships the board says the variant holds.
 * @param reading What the board says about the variant, or null.
 * @returns Them, or null while that is not known.
 */
function wiringOf(reading: VariantReading | null): Wiring | null {
	return reading?.variant?.content ?? null;
}

/**
 * How strongly the light answers.
 * @param lit What is lit, or null for no light.
 * @param poked The part the light is about, or null for a chosen question's answer.
 * @param selection The pick.
 * @returns "pick" for the part picked out or a chosen question's answer, "hover" for anything else, or null.
 */
function modeOf(
	lit: ReadonlySet<string> | null,
	poked: string | null,
	selection: string | null,
): ProbeMode | null {
	if (lit === null) {
		return null;
	}
	return poked === selection ? "pick" : "hover";
}

/**
 * What a trace reached beyond the first hop, with how many hops each is.
 * @param wiring What the variant says, or null while that is not known.
 * @param trace The trace asked for, or null.
 * @param on Whether the light is about the part the trace was asked of.
 * @returns The subjects and their hops, or null without anything beyond.
 */
function reachBeyond(
	wiring: Wiring | null,
	trace: Trace | null,
	on: boolean,
): ReadonlyMap<string, number> | null {
	if (wiring === null || trace === null || !on) {
		return null;
	}
	const far = [...reachOf(wiring, trace.part, trace.way).hops].filter(([, hops]) => hops >= 2);
	return far.length === 0 ? null : new Map(far);
}

/**
 * What the picture lights.
 * @param inputs What the board says, the picture's atlas, the pick, what the sidebar asks, and what else says what the picture is about.
 * @returns What is lit, how strongly, and the handlers that move it.
 */
function useLighting(inputs: LightingInputs): Lighting {
	const { reading, atlas, selection, veil } = inputs;
	const { part, onHover, release } = useRestingPart(atlas);
	const trace = traceOf(inputs);
	const poked = pokedBy(inputs, trace, part);
	const wiring = wiringOf(reading);
	const answer = answerLit(inputs, poked);
	const lit = useMemo(
		() => litInPicture(wiring, atlas, poked) ?? litByAnswer(wiring, atlas, answer),
		[wiring, atlas, poked, answer],
	);
	const reach = useMemo(
		() => (lit === null ? null : reachBeyond(wiring, trace, poked === selection)),
		[lit, wiring, trace, poked, selection],
	);
	const light = useMemo(
		() => (lit === null || reach === null || wiring === null ? lit : withReach(wiring, lit, reach)),
		[lit, reach, wiring],
	);
	return {
		light,
		standing: veil ?? light,
		reach,
		mode: modeOf(lit, poked, selection),
		onHover,
		release,
	};
}

export { useLighting, type Lighting };
