// The orb's stage, as a component reads it, and the two moves a surface makes on
// it: saying where the orb is wanted, and asking a Narrate key to launch it.

import { createContext, useContext, useLayoutEffect, useSyncExternalStore } from "react";

import type { OrbHome, OrbStage } from "#ui/workbench-client/orb/state/orb-stage.ts";

/** The stage the page's orb is drawn on, or null outside a provider. */
const OrbStageContext = createContext<OrbStage | null>(null);

/**
 * The page's orb stage.
 * @returns The stage.
 */
function useOrbStage(): OrbStage {
	const stage = useContext(OrbStageContext);
	if (stage === null) throw new Error("The voice orb is drawn inside an OrbStageProvider.");
	return stage;
}

/** Where the orb is wanted. */
interface OrbPlacement {
	readonly home: OrbHome;
	/** Whether the orb is lit: voice is on. */
	readonly shown: boolean;
	/** Whether the person asked for no motion: the orb then changes home without a flight. */
	readonly reducedMotion: boolean;
}

/**
 * Say where the orb is wanted, whenever that changes.
 * @param placement The home, whether the orb is lit, and the motion preference.
 */
function useOrbPlacement(placement: OrbPlacement): void {
	const stage = useOrbStage();
	const { home, shown, reducedMotion } = placement;
	useLayoutEffect(() => {
		stage.wish({ home, shown, fly: !reducedMotion });
	}, [stage, home, shown, reducedMotion]);
}

/**
 * Whether a home has a socket on the page for the orb: the voice box is on the page, and not
 * only wanted. A surface that would lose the voice to a home asks this, so that it gives the
 * voice up only to a home that is there.
 * @param home Which home.
 * @returns True for as long as the home offers a socket.
 */
function useOrbOffered(home: OrbHome): boolean {
	const stage = useOrbStage();
	return useSyncExternalStore(
		stage.subscribe,
		() => stage.offered(home),
		() => false,
	);
}

/**
 * How a Narrate key asks for a launch: the next orb that is lit leaves the key, lit from the
 * start of its flight, for the home it is wanted in. Voice started any other way is lit where it
 * is wanted. The key asks as it is pressed, before the voice it starts is lit, and names itself.
 * @returns The ask, the same function for as long as the stage lasts.
 */
function useOrbLaunch(): (pressed: Element) => void {
	return useOrbStage().launch;
}

export { OrbStageContext, useOrbLaunch, useOrbOffered, useOrbPlacement, useOrbStage };
