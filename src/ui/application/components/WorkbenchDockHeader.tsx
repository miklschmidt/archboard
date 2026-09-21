// The dock header's compact controls over the focused pane's owners.

import { useSyncExternalStore, type JSX } from "react";

import { useVoiceView } from "@/ui/application/hooks/use-voice-view";
import type { WorkbenchFrameProps } from "@/ui/application/types/workbench-frame";
import { SubtitlesToggle } from "@/ui/voice-subtitles";
import { WorkbenchHeaderControls } from "@/ui/workbench/WorkbenchHeaderControls";
import { sessionView } from "@/ui/workbench-runtime";

/**
 * The dock header's compact controls.
 * @param props The owners and the motion preference.
 * @returns The controls.
 */
function WorkbenchDockHeader(props: WorkbenchFrameProps): JSX.Element {
	const { owners } = props;
	const { transport } = owners;
	const state = useSyncExternalStore(transport.subscribe, transport.state, transport.state);
	const voice = useVoiceView(owners);
	return (
		<div className="flex items-center gap-1">
			<SubtitlesToggle />
			<WorkbenchHeaderControls
				session={sessionView(state)}
				voice={voice}
				reducedMotion={props.reducedMotion}
				actions={owners.host.voice}
			/>
		</div>
	);
}

export { WorkbenchDockHeader };
