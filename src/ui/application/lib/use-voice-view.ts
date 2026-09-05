// The voice presentation over the focused pane's voice session adapter: the
// controls' view from the adapter's published view, and the wave from the
// measured model output level. The level re-renders only this hook's caller.

import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";
import { useVoiceLevel, useVoiceSession } from "@/ui/voice-session/use-voice-session";
import { voiceControlsView } from "@/ui/voice-session";
import type { WorkbenchVoiceView } from "@/ui/workbench";

/**
 * The voice view over the owners' adapter. Not memoised: the adapter's wave
 * reads its phase and level directly, and both subscriptions below are what
 * re-render the caller when either changes.
 * @param owners The owners.
 * @returns The controls' view and the wave's inputs.
 */
function useVoiceView(owners: WorkbenchOwners): WorkbenchVoiceView {
	const { voice } = owners;
	const view = useVoiceSession(voice);
	useVoiceLevel(voice);
	const wave = voice.wave();
	return { controls: voiceControlsView(view), wave: { state: wave.state, level: wave.level } };
}

export { useVoiceView };
