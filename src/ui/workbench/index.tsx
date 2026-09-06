// The agent workbench: three columns under the dock header. The session
// column on the left, the official assistant-ui thread in the centre with the
// Archboard intent controls inside its composer, and the dense side panels on
// the right. The shell mounts this into its dock; the runtime adapter wraps it
// in the assistant-ui runtime provider and supplies the view.

import { useMemo } from "react";

import type { WorkbenchActions, WorkbenchView } from "@/ui/workbench/contracts";
import {
	ComposerIntentContext,
	ComposerIntentFooter,
	type ComposerIntentBarProps,
} from "@/ui/workbench/lib/composer-intent";
import { SessionState } from "@/ui/workbench/lib/session-states";
import { SidePanel } from "@/ui/workbench/lib/side-panel";
import { SessionColumn } from "@/ui/workbench/lib/status-strip";
import { activeTurnId } from "@/ui/workbench/session-projection";
import { Thread, type ThreadComponents } from "@/ui/workbench-thread/thread";

/** Inputs for the workbench. */
interface WorkbenchProps {
	view: WorkbenchView;
	actions: WorkbenchActions;
}

/** The official thread with the intent row in its composer footer slot. */
const THREAD_COMPONENTS: ThreadComponents = { ComposerFooter: ComposerIntentFooter };

/**
 * The workbench.
 * @param props The view and the actions.
 * @returns The dock body.
 */
function Workbench(props: WorkbenchProps): React.JSX.Element {
	const { view, actions } = props;
	const { session } = view;
	const snapshot = session.kind === "ready" ? session.snapshot : null;
	const intent = useMemo<ComposerIntentBarProps | null>(
		() =>
			snapshot === null
				? null
				: {
						composer: view.composer,
						activeTurnId: activeTurnId(snapshot),
						canCompose: snapshot.threadLink.canAcceptDirectInput,
						actions,
					},
		[snapshot, view.composer, actions],
	);
	if (session.kind !== "ready") {
		return (
			<section aria-label="Agent workbench" className="flex h-full min-h-0 flex-col">
				<SessionState session={session} actions={actions} />
			</section>
		);
	}
	return (
		<section aria-label="Agent workbench" className="bg-background flex h-full min-h-0">
			<SessionColumn snapshot={session.snapshot} actions={actions} />
			<div className="flex min-w-0 flex-1 flex-col">
				<ComposerIntentContext.Provider value={intent}>
					<Thread components={THREAD_COMPONENTS} />
				</ComposerIntentContext.Provider>
			</div>
			<SidePanel snapshot={session.snapshot} view={view} actions={actions} />
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
