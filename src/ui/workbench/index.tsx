// The agent workbench: the official assistant-ui thread as the primary area,
// the lifecycle strip above it, the Archboard intent controls beneath it, and
// the dense side panel. The shell mounts this into its dock; the runtime
// adapter wraps it in the assistant-ui runtime provider and supplies the view.

import type { WorkbenchActions, WorkbenchView } from "@/ui/workbench/contracts";
import { ComposerIntentBar } from "@/ui/workbench/lib/composer-intent";
import { SessionState } from "@/ui/workbench/lib/session-states";
import { SidePanel } from "@/ui/workbench/lib/side-panel";
import { StatusStrip } from "@/ui/workbench/lib/status-strip";
import { activeTurnId } from "@/ui/workbench/session-projection";
import { Thread } from "@/ui/workbench-thread/thread";

/** Inputs for the workbench. */
interface WorkbenchProps {
	view: WorkbenchView;
	actions: WorkbenchActions;
}

/**
 * The workbench.
 * @param props The view and the actions.
 * @returns The dock body.
 */
function Workbench(props: WorkbenchProps): React.JSX.Element {
	const { view, actions } = props;
	if (view.session.kind !== "ready") {
		return (
			<section aria-label="Agent workbench" className="flex h-full min-h-0 flex-col">
				<SessionState session={view.session} actions={actions} />
			</section>
		);
	}
	const { snapshot } = view.session;
	return (
		<section aria-label="Agent workbench" className="flex h-full min-h-0">
			<div className="flex min-w-0 flex-1 flex-col">
				<StatusStrip snapshot={snapshot} actions={actions} />
				<div className="min-h-0 flex-1">
					<Thread />
				</div>
				<ComposerIntentBar
					composer={view.composer}
					activeTurnId={activeTurnId(snapshot)}
					canCompose={snapshot.threadLink.canAcceptDirectInput}
					actions={actions}
				/>
			</div>
			<SidePanel snapshot={snapshot} view={view} actions={actions} />
		</section>
	);
}

export { Workbench, type WorkbenchProps };
export {
	IDLE_QUEUE_COMMAND,
	NO_APPROVAL_ERRORS,
	type ApprovalChoice,
	type ComposerIntent,
	type DynamicApprovalVerdict,
	type WorkbenchActions,
	type WorkbenchComposerView,
	type WorkbenchQueueActions,
	type WorkbenchQueueCommandView,
	type WorkbenchSessionView,
	type WorkbenchThreadLinkActions,
	type WorkbenchView,
	type WorkbenchVoiceView,
} from "@/ui/workbench/contracts";
