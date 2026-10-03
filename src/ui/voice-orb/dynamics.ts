// The orb's motion state, as a second entrypoint of the module: the pure part
// that decides how lit the orb is and how its lines move, so a test can step
// it by hand without a canvas.

export {
	createOrbDynamics,
	orbMoves,
	restOrb,
	stepOrb,
	type OrbDynamics,
	type OrbInput,
	type OrbMode,
} from "@/ui/voice-orb/lib/orb-dynamics";
