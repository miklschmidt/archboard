// Offers the voice and its actions to the surfaces drawn below the application.

import { useMemo, type JSX, type ReactNode } from "react";

import { VoiceSurfaceContext } from "@/ui/workbench/hooks/use-voice-surface";
import type { AgentActions, AgentVoiceView } from "@/ui/workbench/contracts";

/** Inputs for the provider. */
interface VoiceSurfaceProviderProps {
	readonly voice: AgentVoiceView;
	readonly actions: AgentActions;
	readonly children: ReactNode;
}

/**
 * The voice, for whatever is drawn inside.
 * @param props The voice, the actions and what is drawn.
 * @returns What is drawn, with the voice offered to it.
 */
function VoiceSurfaceProvider(props: VoiceSurfaceProviderProps): JSX.Element {
	const { voice, actions } = props;
	const surface = useMemo(() => ({ voice, actions }), [voice, actions]);
	return (
		<VoiceSurfaceContext.Provider value={surface}>{props.children}</VoiceSurfaceContext.Provider>
	);
}

export { VoiceSurfaceProvider, type VoiceSurfaceProviderProps };
