// The presentation bar's voice controls over the focused pane's owners.

import { useVoiceView } from "@/ui/application/hooks/use-voice-view";
import type { WorkbenchFrameProps } from "@/ui/application/types/workbench-frame";
import { VoiceControlsCompact } from "@/ui/voice-controls";

/**
 * The presentation bar's voice controls.
 * @param props The owners.
 * @returns The compact controls.
 */
function PresentationVoiceControls(props: Pick<WorkbenchFrameProps, "owners">): React.JSX.Element {
	const { owners } = props;
	const voice = useVoiceView(owners);
	return <VoiceControlsCompact view={voice.controls} actions={owners.host.voice} />;
}

export { PresentationVoiceControls };
