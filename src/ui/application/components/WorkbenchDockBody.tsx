// The dock body: the one runtime over the focused pane's transport, rendering
// the workbench.

import { WorkbenchRenderer } from "@/ui/application/components/WorkbenchRenderer";
import { useVoiceView } from "@/ui/application/hooks/use-voice-view";
import {
	WorkbenchActivityContext,
	WorkbenchOwnersContext,
} from "@/ui/application/state/workbench-context";
import type { WorkbenchDockBodyProps } from "@/ui/application/types/workbench-frame";
import { WorkbenchRuntimeProvider } from "@/ui/workbench-runtime";

/**
 * The dock body: the one runtime over the transport, rendering the workbench.
 * @param props The owners, the motion preference and the activity.
 * @returns The provider around the renderer.
 */
function WorkbenchDockBody(props: WorkbenchDockBodyProps): React.JSX.Element {
	const { owners } = props;
	const voice = useVoiceView(owners);
	return (
		<WorkbenchOwnersContext.Provider value={owners}>
			<WorkbenchActivityContext.Provider value={props.activity}>
				<WorkbenchRuntimeProvider
					transport={owners.transport}
					host={owners.host}
					voice={voice}
					reducedMotion={props.reducedMotion}
					render={WorkbenchRenderer}
				/>
			</WorkbenchActivityContext.Provider>
		</WorkbenchOwnersContext.Provider>
	);
}

export { WorkbenchDockBody };
