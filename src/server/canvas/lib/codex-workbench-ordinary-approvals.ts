import type { ApprovalOwnerView, CodexApprovalBroker } from "@/runtime/codex-approvals";
import type { BrowserOrdinaryApprovalActions } from "@/server/codex-workbench";

/**
 * The approvals a pane may be shown: the ones still awaiting an answer, and
 * the ones whose terminal has not yet been delivered.
 * @param approvals The broker.
 * @returns The views, in the broker's own order.
 */
function visibleApprovalViews(approvals: CodexApprovalBroker): readonly ApprovalOwnerView[] {
	return approvals
		.inspectViews()
		.filter(
			(view) =>
				view.snapshot.state === "staged" ||
				view.snapshot.state === "pending" ||
				view.terminalDelivery !== null,
		);
}

/**
 * How one browser disconnect is worded to the agent, so the cancellation the
 * agent sees names why its approval went unanswered.
 * @param reason Why the browser stopped listening.
 * @returns The wording.
 */
function disconnectWording(
	reason: Parameters<NonNullable<BrowserOrdinaryApprovalActions["onBrowserDisconnect"]>>[1],
): string {
	if (reason === "gateway_shutdown") {
		return "host shutdown";
	}
	if (reason === "child_disconnected") {
		return "child disconnected";
	}
	return "browser disconnected";
}

/**
 * Bind all seven ordinary approval families to one exact pane lifecycle.
 * @param approvals The broker every action reads and answers through.
 * @returns The actions.
 */
function createCanvasOrdinaryApprovalActions(
	approvals: CodexApprovalBroker,
): BrowserOrdinaryApprovalActions {
	const actions: BrowserOrdinaryApprovalActions = {
		/**
		 * The approval under one request id, only while it is still awaiting an
		 * answer; anything else is nothing for the pane to act on.
		 * @param requestId The request.
		 * @returns The view, or null.
		 */
		pending: (requestId) => {
			try {
				if (approvals.get(requestId)?.state !== "pending") {
					return null;
				}
				return approvals.view(requestId);
			} catch {
				return null;
			}
		},
		/**
		 * Answer one approval on the person's behalf.
		 * @param command Which approval, and the answer.
		 * @returns How the broker settled it.
		 */
		resolve: async (command) => {
			const settlement = await approvals.resolve({
				requestId: command.requestId,
				approvalId: command.approvalId,
				response: command.response,
			});
			return { outcome: settlement.outcome };
		},
		/**
		 * Retire one settled approval, the pane having shown its terminal.
		 * @param requestId The request.
		 * @returns Whether the broker still held it.
		 */
		acknowledge: (requestId) => approvals.acknowledge(requestId),
		/**
		 * Every settled approval whose terminal the pane has not shown yet.
		 * @returns Their request ids.
		 */
		unpresentedTerminals: () =>
			approvals
				.inspectViews()
				.filter((view) => view.terminalDelivery === "after_publish")
				.map((view) => view.request.requestId),
		/**
		 * Retire the approvals a pane has now shown, ignoring any another pane
		 * or lifecycle boundary already retired.
		 * @param requestIds What the pane showed.
		 */
		acknowledgePublished: (requestIds) => {
			for (const requestId of new Set(requestIds)) {
				try {
					const view = approvals.view(requestId);
					if (view.terminalDelivery === "after_publish") {
						approvals.acknowledge(requestId);
					}
				} catch {
					// Another lifecycle boundary may already have acknowledged the terminal.
				}
			}
		},
		/**
		 * Cancel the approvals only this pane could have answered, so nothing is
		 * left waiting on a browser that has gone.
		 * @param context The pane, its child epoch, and the link it was on.
		 * @param reason Why the browser stopped listening.
		 */
		onBrowserDisconnect: async (context, reason) => {
			if (context.link.state !== "executable") {
				return;
			}
			const authoredReason = disconnectWording(reason);
			const exactPaneLink = `pane:${context.paneId}`;
			const pending = approvals
				.inspect()
				.filter(
					(snapshot) =>
						snapshot.state === "pending" &&
						snapshot.child === context.childId &&
						snapshot.epoch === context.epoch &&
						snapshot.threadId === context.link.threadId &&
						snapshot.binding.link === exactPaneLink,
				);
			await Promise.all(
				pending.map(async (snapshot) => {
					await approvals.cancel(snapshot.requestId, authoredReason);
					if (approvals.get(snapshot.requestId) !== undefined) {
						approvals.acknowledge(snapshot.requestId);
					}
				}),
			);
		},
	};
	return Object.freeze(actions);
}

export { createCanvasOrdinaryApprovalActions, visibleApprovalViews };
