// The workbench pieces that stay reachable when the dock is collapsed and in
// fullscreen: compact voice controls, the small output wave, and the count of
// approvals waiting. The shell places this in its dock header.

import { Badge } from "@/ui/components/badge";
import { VoiceControlsCompact } from "@/ui/voice-controls";
import { VoiceOutputWave } from "@/ui/voice-wave";
import type { WorkbenchActions, WorkbenchView } from "@/ui/workbench/contracts";

/** Inputs for the header controls. */
interface WorkbenchHeaderControlsProps {
	view: WorkbenchView;
	actions: WorkbenchActions;
}

/**
 * How many approvals wait for a decision, from whichever session view is shown.
 * @param view The workbench view.
 * @returns The count, zero when the session is not ready.
 */
function waitingApprovals(view: WorkbenchView): number {
	if (view.session.kind !== "ready") {
		return 0;
	}
	const { snapshot } = view.session;
	const pending = snapshot.approvals.filter(
		(approval) => approval.lifecycle.state === "pending" || approval.lifecycle.state === "staged",
	).length;
	return (
		pending + snapshot.dynamicApprovals.filter((approval) => approval.state === "pending").length
	);
}

/**
 * The header controls.
 * @param props The view and the actions.
 * @returns A compact row.
 */
function WorkbenchHeaderControls(props: WorkbenchHeaderControlsProps): React.JSX.Element {
	const { view, actions } = props;
	const waiting = waitingApprovals(view);
	const live =
		view.voice.controls.sessionState === "active" ||
		view.voice.controls.sessionState === "recovering";
	return (
		<div className="flex items-center gap-2">
			{waiting === 0 ? null : (
				<Badge variant="default" aria-label={`${waiting} approvals waiting`}>
					{waiting}
				</Badge>
			)}
			<VoiceOutputWave
				state={view.voice.wave.state}
				level={view.voice.wave.level}
				active={live}
				reducedMotion={view.reducedMotion}
				size="icon"
			/>
			<VoiceControlsCompact view={view.voice.controls} actions={actions.voice} />
		</div>
	);
}

export { WorkbenchHeaderControls, type WorkbenchHeaderControlsProps };
