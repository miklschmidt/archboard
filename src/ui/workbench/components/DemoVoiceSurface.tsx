// DEMONSTRATION: the voice the surfaces below the application read when the page is
// opened with `?voiceDemo`, in place of the voice session there is not.

import type { JSX, ReactNode } from "react";

import { VoiceSurfaceProvider } from "@/ui/workbench/components/VoiceSurfaceProvider";
import type { AgentActions } from "@/ui/workbench/contracts";
import { useDemoVoice } from "@/ui/workbench/hooks/use-voice-demo";

/**
 * Offer the demonstration's voice to whatever is drawn inside.
 * @param props The actions it is offered with, and what is drawn.
 * @param props.actions The agent's actions, which do nothing to a voice that is not there.
 * @param props.children What is drawn.
 * @returns What is drawn, with the demonstration's voice offered to it.
 */
function DemoVoiceSurface(props: {
	readonly actions: AgentActions;
	readonly children: ReactNode;
}): JSX.Element {
	const voice = useDemoVoice();
	return (
		<VoiceSurfaceProvider voice={voice} actions={props.actions}>
			{props.children}
		</VoiceSurfaceProvider>
	);
}

export { DemoVoiceSurface };
