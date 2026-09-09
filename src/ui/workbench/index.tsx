// The agent workbench: three columns under the dock header. The session
// column on the left, the official assistant-ui thread in the centre with the
// Archboard intent controls inside its composer, and the dense side panels on
// the right. The shell mounts this into its dock; the runtime adapter wraps it
// in the assistant-ui runtime provider and supplies the view.

import { useMemo, type JSX } from "react";

import type { WorkbenchActions, WorkbenchView } from "@/ui/workbench/contracts";
import {
	ComposerIntentContext,
	ComposerIntentFooter,
	type ComposerIntentBarProps,
} from "@/ui/workbench/components/ComposerIntentBar";
import { SessionState } from "@/ui/workbench/components/SessionState";
import { SidePanel } from "@/ui/workbench/components/SidePanel";
import { SessionColumn } from "@/ui/workbench/components/SessionColumn";
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
function Workbench(props: WorkbenchProps): JSX.Element {
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
				<SessionState session={session} actions={actions} activity={view.activity} />
			</section>
		);
	}
	return (
		<section aria-label="Agent workbench" className="bg-background flex h-full min-h-0">
			<SessionColumn snapshot={session.snapshot} activity={view.activity} actions={actions} />
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
