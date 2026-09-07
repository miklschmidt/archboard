import type {
	BrowserActionContext,
	BrowserActionResult,
	CodexWorkbenchGatewayOptions,
} from "@/server/codex-workbench/lib/contract";
import type {
	BrowserActionDispatch,
	OwnedBrowserCommand,
} from "@/server/codex-workbench/lib/browser-command";

/**
 * The one action that carries out each browser command, which is what makes
 * the dispatch total: a command with no action here is not a command this
 * gateway serves.
 * @param options The workbench owners.
 * @returns The dispatch table.
 */
function createBrowserActionDispatch(options: CodexWorkbenchGatewayOptions): BrowserActionDispatch {
	const { account, threadLinks, text, queue, ordinaryApprovals, dynamicApprovals, realtime } =
		options.actions;
	return {
		/**
		 * Sign in.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		accountLogin: (command, context) => account.login(command, context),
		/**
		 * Abandon a sign-in that is waiting.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		accountLoginCancel: (command, context) => account.loginCancel(command, context),
		/**
		 * Sign out.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		accountLogout: (command, context) => account.logout(command, context),
		/**
		 * Bind the pane to a new thread.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		threadLinkCreate: (command, context) => threadLinks.create(command, context),
		/**
		 * Re-read the pane's thread link.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		threadLinkRefresh: (command, context) => threadLinks.refresh(command, context),
		/**
		 * Bind the pane to an existing thread.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		threadLinkAttach: (command, context) => threadLinks.attach(command, context),
		/**
		 * Move the pane's binding to another thread.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		threadLinkRelink: (command, context) => threadLinks.relink(command, context),
		/**
		 * Start a turn.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		start: (command, context) => text.start(command, context),
		/**
		 * Steer the turn that is running.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		steer: (command, context) => text.steer(command, context),
		/**
		 * Interrupt the turn that is running.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		interrupt: (command, context) => text.interrupt(command, context),
		/**
		 * Add a queued turn.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		queueAdd: (command, context) => queue.add(command, context),
		/**
		 * Change a queued turn.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		queueUpdate: (command, context) => queue.update(command, context),
		/**
		 * Drop a queued turn.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		queueDelete: (command, context) => queue.delete(command, context),
		/**
		 * Reorder the queue.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		queueReorder: (command, context) => queue.reorder(command, context),
		/**
		 * Run the queue.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		queueStart: (command, context) => queue.start(command, context),
		/**
		 * Answer an ordinary approval.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		approvalRespond: (command, context) => ordinaryApprovals.resolve(command, context),
		/**
		 * Answer a coordination approval.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		dynamicApprovalRespond: (command, context) => dynamicApprovals.resolve(command, context),
		/**
		 * Start the voice session.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		realtimeStart: (command, context) => realtime.start(command, context),
		/**
		 * Send text into the voice session.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		realtimeAppendText: (command, context) => realtime.appendText(command, context),
		/**
		 * Stop the voice session.
		 * @param command The command.
		 * @param context The lease's authority.
		 * @returns What became of it.
		 */
		realtimeStop: (command, context) => realtime.stop(command, context),
	};
}

/**
 * Carry out one command through the action that owns it.
 * @param dispatch The dispatch table.
 * @param command The command.
 * @param context The lease's authority.
 * @returns What the action reported.
 */
function invokeBrowserAction(
	dispatch: BrowserActionDispatch,
	command: OwnedBrowserCommand,
	context: BrowserActionContext,
): Promise<BrowserActionResult> {
	const action: (value: never, owner: BrowserActionContext) => Promise<BrowserActionResult> =
		dispatch[command.command];
	return action(command as never, context);
}

export { createBrowserActionDispatch, invokeBrowserAction };
