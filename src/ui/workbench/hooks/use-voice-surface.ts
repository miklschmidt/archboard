// The voice and what a person can do to it, for the surfaces that are not the dock.
//
// The dock is handed its voice, but the voice box is drawn deep inside a pane, made
// once by the application and not again for every change of the voice's stage. So the
// application offers the voice through a context, and the box reads it where it is
// drawn: a stage changes the box and nothing between it and the application.

import { createContext, useContext } from "react";

import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";

/** The voice and the actions on it. */
interface VoiceSurface {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
}

/** The voice the application offers, or null where it offers none. */
const VoiceSurfaceContext = createContext<VoiceSurface | null>(null);

/**
 * The voice the application offers.
 * @returns The voice and the actions, or null outside a provider.
 */
function useVoiceSurface(): VoiceSurface | null {
	return useContext(VoiceSurfaceContext);
}

export { VoiceSurfaceContext, useVoiceSurface, type VoiceSurface };
