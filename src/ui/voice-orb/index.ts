// The voice orb: the picture of the voice, a ring round a lens of ruled lines that
// move with the model's output level. It is one canvas, drawn once, that rests in
// one of two homes (the circle in the agent dock, or the voice box over a pane's
// picture) and flies between them.

export { VoiceOrb, type VoiceOrbProps } from "@/ui/voice-orb/components/VoiceOrb";
export {
	OrbHost,
	OrbSlot,
	OrbStageProvider,
	type OrbSlotProps,
} from "@/ui/voice-orb/components/OrbStage";
export {
	useOrbOffered,
	useOrbPlacement,
	type OrbPlacement,
} from "@/ui/voice-orb/hooks/use-orb-stage";
export {
	createOrbStage,
	type OrbFrames,
	type OrbHome,
	type OrbStage,
	type OrbWish,
} from "@/ui/voice-orb/lib/orb-stage";
export type { OrbMode } from "@/ui/voice-orb/lib/orb-dynamics";
