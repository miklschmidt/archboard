// The runtime's renderer: the workbench over the runtime's view and actions,
// with the queue, approvals and thread-link controllers composed in. Where
// the runtime already implements an action, the controller that owns the
// richer settlement wins, so nothing is dispatched twice:
//   - queue: the queue controller (target capture, pending and settlement);
//   - approvals: the approvals controller (choice resolution, invalid results);
//   - thread link: the thread-link controller (settlement feeds agent settings);
//   - composer, stop, retry, intent, copy, voice: the runtime's own;
//   - activity: the shell's rendered `doing` lines, handed in through context.

import { useContext, useMemo, useSyncExternalStore } from "react";

import {
	WorkbenchActivityContext,
	WorkbenchOwnersContext,
} from "@/ui/application/state/workbench-context";
import type { WorkbenchOwners } from "@/ui/application/lib/workbench-owners";
import { Workbench } from "@/ui/workbench";
import type { WorkbenchActions, WorkbenchView } from "@/ui/workbench/contracts";
import type { WorkbenchRuntimeRenderContext } from "@/ui/workbench-runtime";

/**
 * The runtime's renderer with the controllers composed in.
 * @param context The runtime's view, actions and status.
 * @returns The workbench.
 */
function WorkbenchRenderer(context: WorkbenchRuntimeRenderContext): React.JSX.Element {
	const owners = useContext(WorkbenchOwnersContext);
	if (owners === null) {
		throw new Error("The workbench renderer needs its owners in context.");
	}
	return <ComposedWorkbench owners={owners} context={context} />;
}

/** Inputs for the composed workbench. */
interface ComposedWorkbenchProps {
	owners: WorkbenchOwners;
	context: WorkbenchRuntimeRenderContext;
}

/**
 * The workbench with the controllers' state and actions composed in.
 * @param props The owners and the runtime's context.
 * @returns The workbench.
 */
function ComposedWorkbench(props: ComposedWorkbenchProps): React.JSX.Element {
	const { owners, context } = props;
	const queueCommand = useSyncExternalStore(
		owners.queueCommand.subscribe,
		owners.queueCommand.getSnapshot,
		owners.queueCommand.getSnapshot,
	);
	const decisions = useSyncExternalStore(
		owners.approvalDecisions.subscribe,
		owners.approvalDecisions.getSnapshot,
		owners.approvalDecisions.getSnapshot,
	);
	const activity = useContext(WorkbenchActivityContext);
	const view = useMemo<WorkbenchView>(
		() => ({
			...context.view,
			busyApprovals: decisions.busy,
			approvalErrors: decisions.errors,
			queueCommand,
			activity,
		}),
		[context.view, decisions, queueCommand, activity],
	);
	const actions = useMemo<WorkbenchActions>(
		() => ({
			...context.actions,
			queue: owners.queue.panelActions,
			respondToApproval: owners.approvals.panelActions.respondToApproval,
			respondToDynamicApproval: owners.approvals.panelActions.respondToDynamicApproval,
			threadLink: owners.threadLinkActions,
		}),
		[context.actions, owners],
	);
	return <Workbench view={view} actions={actions} />;
}

export { WorkbenchRenderer };
