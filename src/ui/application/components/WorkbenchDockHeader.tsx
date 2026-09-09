// The dock header's compact controls over the focused pane's owners.

import { useSyncExternalStore, type JSX } from "react";

import { useVoiceView } from "@/ui/application/hooks/use-voice-view";
import type { WorkbenchFrameProps } from "@/ui/application/types/workbench-frame";
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
		<WorkbenchHeaderControls
			session={sessionView(state)}
			voice={voice}
			reducedMotion={props.reducedMotion}
			actions={owners.host.voice}
		/>
	);
}

export { WorkbenchDockHeader };
