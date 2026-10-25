import type {
	ApprovalOwnerView,
	CodexApprovalBroker,
} from "#runtime/services/approvals/contract.ts";
import {
	parseTabSessionId,
	parseWorkhorseLinkKey,
	workhorseLinkKey,
	type TabSessionId,
} from "#server/rules/tab-session/tab-session.ts";
import { type BrowserOrdinaryApprovalActions } from "#server/protocol/gateway/contract.ts";

/** How an approval's link names the tab session it is shown to. */
const TAB_SESSION_LINK_PREFIX = "tab:";

/** How an approval's link names the workhorse that asked it, by the workhorse's link key. */
const WORKHORSE_LINK_PREFIX = "workhorse:";

/**
 * The link of an approval shown to every chat of one tab session, as its coordinator's are.
 * @param tabSessionId The tab session.
 * @returns The link.
 */
function tabSessionLink(tabSessionId: TabSessionId): string {
	return `${TAB_SESSION_LINK_PREFIX}${tabSessionId}`;
}

/**
 * The link of an approval one workhorse asked, shown to the chats of its checkout (ADR 0050).
 * @param tabSessionId The workhorse's tab session.
 * @param checkout The checkout it works in.
 * @returns The link.
 */
function workhorseApprovalLink(tabSessionId: TabSessionId, checkout: string): string {
	return `${WORKHORSE_LINK_PREFIX}${workhorseLinkKey(tabSessionId, checkout)}`;
}

/**
 * The tab session an approval's link names, whether a workhorse of it or its coordinator asked.
 * @param link The link, or null when the approval has none.
 * @returns The tab session, or null when the link names none.
 */
function tabSessionOfLink(link: string | null): TabSessionId | null {
	if (link === null) {
		return null;
	}
	if (link.startsWith(TAB_SESSION_LINK_PREFIX)) {
		return parseTabSessionId(link.slice(TAB_SESSION_LINK_PREFIX.length));
	}
	if (!link.startsWith(WORKHORSE_LINK_PREFIX)) {
		return null;
	}
	return parseWorkhorseLinkKey(link.slice(WORKHORSE_LINK_PREFIX.length))?.tabSessionId ?? null;
}

/**
 * The checkout whose chats an approval's link is shown to: the workhorse's that asked it.
 * @param link The link, or null when the approval has none.
 * @returns The checkout, or null when every chat of its tab session is shown it.
 */
function checkoutOfLink(link: string | null): string | null {
	if (link === null || !link.startsWith(WORKHORSE_LINK_PREFIX)) {
		return null;
	}
	return parseWorkhorseLinkKey(link.slice(WORKHORSE_LINK_PREFIX.length))?.checkout ?? null;
}

/**
 * The approvals a chat may be shown: those its tab's coordinator asked and those the workhorse of
 * its checkout asked, while they await an answer or their terminal has not yet been delivered.
 * @param approvals The broker.
 * @param tabSessionId The chat's tab session.
 * @param checkout The checkout the chat's tab shows.
 * @returns The views, in the broker's own order.
 */
function visibleApprovalViews(
	approvals: CodexApprovalBroker,
	tabSessionId: TabSessionId,
	checkout: string,
): readonly ApprovalOwnerView[] {
	const links = new Set([
		tabSessionLink(tabSessionId),
		workhorseApprovalLink(tabSessionId, checkout),
	]);
	return approvals
		.inspectViews()
		.filter(
			(view) =>
				links.has(view.snapshot.binding.link ?? "") &&
				(view.snapshot.state === "staged" ||
					view.snapshot.state === "pending" ||
					view.terminalDelivery !== null),
		);
}

/**
 * Cancel every approval a tab session was still to answer, because the session ended: no chat of
 * the tab came back within its grace, so nobody is left to answer them. Each is retired at once,
 * since no browser of the session will show its terminal either.
 * @param approvals The broker.
 * @param tabSessionId The tab session that ended.
 */
async function cancelTabSessionApprovals(
	approvals: CodexApprovalBroker,
	tabSessionId: TabSessionId,
): Promise<void> {
	const open = approvals
		.inspect()
		.filter(
			(snapshot) =>
				tabSessionOfLink(snapshot.binding.link) === tabSessionId &&
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
 * Bind all seven ordinary approval families to one exact chat lifecycle.
 * @param approvals The broker every action reads and answers through.
 * @returns The actions.
 */
function createServerOrdinaryApprovalActions(
	approvals: CodexApprovalBroker,
): BrowserOrdinaryApprovalActions {
	const actions: BrowserOrdinaryApprovalActions = {
		/**
		 * The approval under one request id, only while it is still awaiting an
		 * answer; anything else is nothing for the chat to act on.
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
		 * Retire one settled approval, the chat having shown its terminal.
		 * @param requestId The request.
		 * @returns Whether the broker still held it.
		 */
		acknowledge: (requestId) => approvals.acknowledge(requestId),
		/**
		 * Every settled approval whose terminal no chat has shown yet, and the chats it is shown
		 * to: its tab session's, and of a workhorse's only those of its checkout.
		 * @returns Their request ids, tab sessions and checkouts.
		 */
		unpresentedTerminals: () =>
			approvals
				.inspectViews()
				.filter((view) => view.terminalDelivery === "after_publish")
				.map((view) => ({
					requestId: view.request.requestId,
					tabSessionId: tabSessionOfLink(view.snapshot.binding.link),
					checkout: checkoutOfLink(view.snapshot.binding.link),
				})),
		/**
		 * Retire the approvals a chat has now shown, ignoring any another chat
		 * or lifecycle boundary already retired.
		 * @param requestIds What the chat showed.
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
	workhorseApprovalLink,
};
