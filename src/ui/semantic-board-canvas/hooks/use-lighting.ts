// What the picture lights because of where a person's attention is.
//
// Poking a part asks what it is wired to, and the picture answers: the part, its
// relationships and the parts at their other ends stay as drawn, and the rest
// recedes. A part that is picked lights its connections for as long as it is
// picked. The pointer resting on another part lights that one's more lightly,
// and gives the pick back when it goes.
//
// The light is attention only. It stands down while a presented step or a group
// says what the picture is about, while the picture is leaving, and for a part
// with nothing drawn to light.

import { useMemo, type PointerEvent } from "react";

import type { SemanticAtlas } from "@/ui/semantic-board-canvas/api/semantic-boards";
import { useRestingPart } from "@/ui/semantic-board-canvas/hooks/use-resting-part";
import type { VariantReading } from "@/ui/semantic-board-canvas/lib/board-document";
import { litInPicture } from "@/ui/semantic-board-canvas/lib/connections";
import type { GroupSelection } from "@/ui/semantic-board-canvas/lib/groups";
import type { Departure } from "@/ui/semantic-board-canvas/lib/picture-departure";
import type { ProbeMode } from "@/ui/semantic-board-canvas/lib/subjects";

/** What decides the lighting. */
interface LightingInputs {
	/** What the board says about the variant the picture draws, or null while that is not known. */
	readonly reading: VariantReading | null;
	/** Where every subject of the picture ended up: only a drawn relationship has anything to light. */
	readonly atlas: SemanticAtlas;
	/** The subject picked out, or null. */
	readonly selection: string | null;
	/** What a presented step's veil leaves standing, or null for no veil. */
	readonly veil: ReadonlySet<string> | null;
	/** The step of a presented walkthrough on screen, or null or undefined while none is presented. */
	readonly presenting: number | null | undefined;
	/** Whether a group is selected. */
	readonly group: GroupSelection | null;
	/** Where the reader went, while the picture is on its way out. */
	readonly departure: Departure | null;
}

/** What the picture lights, and what moves it. */
interface Lighting {
	/** The subjects the light leaves standing; null for none. */
	readonly lit: ReadonlySet<string> | null;
	/** What is left standing on the picture: a presented step's veil when there is one, else the light. */
	readonly standing: ReadonlySet<string> | null;
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
 * The part the light is about: the one the pointer rests on, else the pick,
 * and none while something else says what the picture is about.
 * @param inputs What decides the lighting.
 * @param resting The part the pointer rests on, or null.
 * @returns The part, or null.
 */
function pokedBy(inputs: LightingInputs, resting: string | null): string | null {
	return standsDown(inputs) ? null : (resting ?? inputs.selection);
}

/**
 * How strongly the light answers.
 * @param lit What is lit, or null for no light.
 * @param poked The part the light is about.
 * @param selection The pick.
 * @returns "pick" for the part picked out, "hover" for one the pointer rests on, or null.
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
 * What the picture lights.
 * @param inputs What the board says, the picture's atlas, the pick, and what else says what the picture is about.
 * @returns What is lit, how strongly, and the handlers that move it.
 */
function useLighting(inputs: LightingInputs): Lighting {
	const { reading, atlas, selection, veil } = inputs;
	const { part, onHover, release } = useRestingPart(atlas);
	const poked = pokedBy(inputs, part);
	const content = reading?.variant?.content ?? null;
	const lit = useMemo(() => litInPicture(content, atlas, poked), [content, atlas, poked]);
	return { lit, standing: veil ?? lit, mode: modeOf(lit, poked, selection), onHover, release };
}

export { useLighting, type Lighting };
