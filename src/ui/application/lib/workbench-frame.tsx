// The workbench's three places in the shell, each over the focused pane's
// owners: the dock body (the runtime provider and the workbench), the dock
// header (compact voice controls, wave and waiting approvals), and the
// presentation bar's voice controls.

import { useSyncExternalStore } from "react";

import { useVoiceView } from "@/ui/application/lib/use-voice-view";
import {
	WorkbenchActivityContext,
	WorkbenchOwnersContext,
} from "@/ui/application/lib/workbench-context";
import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";
import { WorkbenchRenderer } from "@/ui/application/lib/workbench-renderer";
import { VoiceControlsCompact } from "@/ui/voice-controls";
import { WorkbenchHeaderControls } from "@/ui/workbench/header-controls";
import { WorkbenchRuntimeProvider, sessionView } from "@/ui/workbench-runtime";

/** Inputs shared by the three places. */
interface WorkbenchFrameProps {
	owners: WorkbenchOwners;
	reducedMotion: boolean;
}

/** Inputs for the dock body, which also carries the pane's recent activity. */
interface WorkbenchDockBodyProps extends WorkbenchFrameProps {
	/** The recent `doing` lines, rendered by the shell, or null. */
	activity: React.ReactNode;
}

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

/**
 * The dock header's compact controls.
 * @param props The owners and the motion preference.
 * @returns The controls.
 */
function WorkbenchDockHeader(props: WorkbenchFrameProps): React.JSX.Element {
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

export {
	PresentationVoiceControls,
	WorkbenchDockBody,
	WorkbenchDockHeader,
	type WorkbenchDockBodyProps,
	type WorkbenchFrameProps,
};
