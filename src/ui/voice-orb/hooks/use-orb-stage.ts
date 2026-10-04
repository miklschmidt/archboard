// The orb's stage, as a component reads it, and the one move a surface makes on
// it: saying where the orb is wanted.

import { createContext, useContext, useLayoutEffect } from "react";

import type { OrbHome, OrbStage } from "@/ui/voice-orb/lib/orb-stage";

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

export { OrbStageContext, useOrbPlacement, useOrbStage, type OrbPlacement };
