// The voice key a fullscreen presentation's bar carries (TASK-392). It reads the voice the surfaces
// below the application read, so the bar's key and the voice box over the picture always say the
// same thing.

import type { JSX } from "react";

import { TalkControl, useVoiceSurface } from "@/ui/workbench";

/**
 * The key that starts and ends voice, for the presentation's bar.
 * @returns The key, or null where no voice is offered.
 */
function PresentationVoiceKey(): JSX.Element | null {
	const surface = useVoiceSurface();
	return surface === null ? null : <TalkControl voice={surface.voice} actions={surface.actions} />;
}

export { PresentationVoiceKey };
