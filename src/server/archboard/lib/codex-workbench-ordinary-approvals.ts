import type { ApprovalOwnerView, CodexApprovalBroker } from "@/runtime/codex-approvals";
import {
	parseTabSessionId,
	type BrowserOrdinaryApprovalActions,
	type TabSessionId,
} from "@/server/codex-workbench";

/** How an approval's link names the tab session it is shown to. */
const TAB_SESSION_LINK_PREFIX = "tab:";

/**
 * The link of an approval shown to one tab session.
 * @param tabSessionId The tab session.
 * @returns The link.
 */
function tabSessionLink(tabSessionId: TabSessionId): string {
	return `${TAB_SESSION_LINK_PREFIX}${tabSessionId}`;
}

/**
 * The tab session an approval's link names.
 * @param link The link, or null when the approval has none.
 * @returns The tab session, or null when the link names none.
 */
function tabSessionOfLink(link: string | null): TabSessionId | null {
	return link?.startsWith(TAB_SESSION_LINK_PREFIX) === true
		? parseTabSessionId(link.slice(TAB_SESSION_LINK_PREFIX.length))
		: null;
}

/**
 * The approvals one tab session may be shown: those of the threads it started that are still
 * awaiting an answer, and those whose terminal has not yet been delivered.
 * @param approvals The broker.
 * @param tabSessionId The tab session.
 * @returns The views, in the broker's own order.
 */
function visibleApprovalViews(
	approvals: CodexApprovalBroker,
	tabSessionId: TabSessionId,
): readonly ApprovalOwnerView[] {
	return approvals
		.inspectViews()
		.filter(
			(view) =>
				view.snapshot.binding.link === tabSessionLink(tabSessionId) &&
				(view.snapshot.state === "staged" ||
					view.snapshot.state === "pending" ||
					view.terminalDelivery !== null),
		);
}

/**
 * Cancel every approval a tab session was still to answer, because the session ended: no pane of
 * the tab came back within its grace, so nobody is left to answer them. Each is retired at once,
 * since no browser of the session will show its terminal either.
 * @param approvals The broker.
 * @param tabSessionId The tab session that ended.
 */
async function cancelTabSessionApprovals(
	approvals: CodexApprovalBroker,
	tabSessionId: TabSessionId,
): Promise<void> {
	const link = tabSessionLink(tabSessionId);
	const open = approvals
		.inspect()
		.filter(
			(snapshot) =>
				snapshot.binding.link === link &&
				(snapshot.state === "staged" || snapshot.state === "pending"),
		);
	await Promise.all(
		open.map(async (snapshot) => {
			try {
				await approvals.cancel(snapshot.requestId, "browser tab session ended");
			} catch {
				// Something else settled it first; the broker reports its own write failures.
				return;
			}
			if (approvals.get(snapshot.requestId) !== undefined) {
				approvals.acknowledge(snapshot.requestId);
			}
		}),
	);
}

/**
 * Bind all seven ordinary approval families to one exact pane lifecycle.
 * @param approvals The broker every action reads and answers through.
 * @returns The actions.
 */
function createServerOrdinaryApprovalActions(
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
		 * Every settled approval whose terminal no pane has shown yet, and the tab session it is
		 * shown to.
		 * @returns Their request ids and tab sessions.
		 */
		unpresentedTerminals: () =>
			approvals
				.inspectViews()
				.filter((view) => view.terminalDelivery === "after_publish")
				.map((view) => ({
					requestId: view.request.requestId,
					tabSessionId: tabSessionOfLink(view.snapshot.binding.link),
				})),
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
	};
	return Object.freeze(actions);
}

export {
	cancelTabSessionApprovals,
	createServerOrdinaryApprovalActions,
	tabSessionLink,
	tabSessionOfLink,
	visibleApprovalViews,
};
