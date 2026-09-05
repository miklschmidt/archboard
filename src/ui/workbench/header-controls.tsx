// The workbench pieces that stay reachable when the dock is collapsed and in
// fullscreen: compact voice controls, the small output wave, and the count of
// approvals waiting. The shell places this in its dock header; the host hands
// it the session view, the voice view and the voice actions alone.

import { Badge } from "@/ui/components/badge";
import { VoiceControlsCompact } from "@/ui/voice-controls";
import type { VoiceControlsActions } from "@/ui/voice-controls/contracts";
import { VoiceOutputWave } from "@/ui/voice-wave";
import type { WorkbenchSessionView, WorkbenchVoiceView } from "@/ui/workbench/contracts";

/** Inputs for the header controls. */
interface WorkbenchHeaderControlsProps {
	session: WorkbenchSessionView;
	voice: WorkbenchVoiceView;
	reducedMotion: boolean;
	actions: VoiceControlsActions;
}

/**
 * How many approvals wait for a decision, from whichever session view is shown.
 * @param session The session view.
 * @returns The count, zero when the session is not ready.
 */
function waitingApprovals(session: WorkbenchSessionView): number {
	if (session.kind !== "ready") {
		return 0;
	}
	const { snapshot } = session;
	const pending = snapshot.approvals.filter(
		(approval) => approval.lifecycle.state === "pending" || approval.lifecycle.state === "staged",
	).length;
	return (
		pending + snapshot.dynamicApprovals.filter((approval) => approval.state === "pending").length
	);
}

/**
 * The header controls.
 * @param props The session view, the voice view and the voice actions.
 * @returns A compact row.
 */
function WorkbenchHeaderControls(props: WorkbenchHeaderControlsProps): React.JSX.Element {
	const { voice, actions } = props;
	const waiting = waitingApprovals(props.session);
	const live =
		voice.controls.sessionState === "active" || voice.controls.sessionState === "recovering";
	return (
		<div className="flex items-center gap-2">
			{waiting === 0 ? null : (
				<Badge variant="default" aria-label={`${waiting} approvals waiting`}>
					{waiting}
				</Badge>
			)}
			<VoiceOutputWave
				state={voice.wave.state}
				level={voice.wave.level}
				active={live}
				reducedMotion={props.reducedMotion}
				size="icon"
			/>
			<VoiceControlsCompact view={voice.controls} actions={actions} />
		</div>
	);
}

export { WorkbenchHeaderControls, type WorkbenchHeaderControlsProps };
