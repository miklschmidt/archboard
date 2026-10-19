// The agent dock's list of a tab session's workhorses (ADR 0050, TASK-472.11).
//
// The dock shows one workhorse's conversation, the shown one, and lists every live workhorse of the
// tab by repository and checkout so the person can pick another. A workhorse is live once it has a
// thread: a message, a delegation or New conversation started one. The shown checkout is
// listed even before that, as not live, because it is where a typed message goes. Each entry says
// whether a turn runs and whether the workhorse waits for the person: for an approval, or for an
// answer to a question it asked. What the coordinator asks marks no entry, because every pane of
// the tab shows it whatever conversation is shown.

import type { ApprovalFamily, CodexApprovalBroker } from "#runtime/services/approvals/contract.ts";
import { BROWSER_WORKHORSE_LIMIT } from "#shared/schemas/browser/session.ts";
import { type BrowserWorkhorses } from "#shared/schemas/browser/snapshot.ts";
import type { TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import type { CodexWorkbenchTabSession } from "#server/protocol/generation/session-contract.ts";
import type { CodexWorkbenchWorkhorse } from "#server/services/sessions/workhorses.ts";
import { workhorseApprovalLink } from "#server/services/actions/ordinary-approvals.ts";

/** One entry of the list. */
type WorkhorseEntry = BrowserWorkhorses["entries"][number];

/** The families of approval that ask the person a question rather than for leave. */
const QUESTION_FAMILIES: ReadonlySet<ApprovalFamily> = new Set(["user_input", "elicitation"]);

/** What the list is read from. */
interface WorkhorseListInput {
	readonly tabSessionId: TabSessionId;
	readonly session: Pick<CodexWorkbenchTabSession, "workhorses">;
	readonly approvals: Pick<CodexApprovalBroker, "inspect">;
	/** The checkout whose conversation the tab shows. */
	readonly shown: string;
	/** The repository a checkout is listed under, or null when the navigator lists it nowhere. */
	readonly repositoryOf: (checkout: string) => string | null;
}

/**
 * The checkouts of a tab session's live workhorses: those that have a thread.
 * @param session The tab session.
 * @returns The checkouts, in the order the workhorses were built.
 */
function liveWorkhorseCheckouts(
	session: Pick<CodexWorkbenchTabSession, "workhorses">,
): readonly string[] {
	return [...session.workhorses.values()]
		.filter((workhorse) => workhorse.components.workhorse.snapshot().threadId !== null)
		.map(({ checkout }) => checkout);
}

/**
 * Whether a workhorse waits for the person: for an approval, or for an answer to a question.
 * @param input What the list is read from.
 * @param checkout The workhorse's checkout.
 * @returns Both marks.
 */
function waitingMarks(
	input: WorkhorseListInput,
	checkout: string,
): Pick<WorkhorseEntry, "waitingForApproval" | "waitingForUser"> {
	const link = workhorseApprovalLink(input.tabSessionId, checkout);
	const open = input.approvals
		.inspect()
		.filter(
			(snapshot) =>
				snapshot.binding.link === link &&
				(snapshot.state === "staged" || snapshot.state === "pending"),
		);
	return {
		waitingForApproval: open.some((snapshot) => !QUESTION_FAMILIES.has(snapshot.family)),
		waitingForUser: open.some((snapshot) => QUESTION_FAMILIES.has(snapshot.family)),
	};
}

/**
 * One checkout's entry.
 * @param input What the list is read from.
 * @param checkout The checkout.
 * @param workhorse Its live workhorse, or undefined for the shown checkout before its first message.
 * @returns The entry.
 */
function entryOf(
	input: WorkhorseListInput,
	checkout: string,
	workhorse: CodexWorkbenchWorkhorse | undefined,
): WorkhorseEntry {
	return {
		checkout,
		repository: input.repositoryOf(checkout),
		live: workhorse !== undefined,
		running: workhorse?.state.activeTurn != null,
		...waitingMarks(input, checkout),
	};
}

/**
 * The order of two texts by code unit, the same on every machine.
 * @param left One text.
 * @param right The other.
 * @returns Their order.
 */
function compareText(left: string, right: string): number {
	if (left === right) {
		return 0;
	}
	return left < right ? -1 : 1;
}

/**
 * The order the list is read in: by repository, a checkout listed under none by its own path, and
 * the checkouts of one repository by path.
 * @param left One entry.
 * @param right The other.
 * @returns Their order.
 */
function byRepositoryThenCheckout(left: WorkhorseEntry, right: WorkhorseEntry): number {
	return (
		compareText(left.repository ?? left.checkout, right.repository ?? right.checkout) ||
		compareText(left.checkout, right.checkout)
	);
}

/**
 * The checkouts the list names: the shown one, then the live ones newest first, as many as it
 * holds. A tab works in far fewer checkouts than that; the bound keeps a snapshot one the browser
 * contract can carry.
 * @param live The checkouts of the live workhorses, oldest first.
 * @param shown The shown checkout.
 * @returns The checkouts to list.
 */
function listedCheckouts(live: readonly string[], shown: string): readonly string[] {
	return [...new Set([shown, ...live.toReversed()])].slice(0, BROWSER_WORKHORSE_LIMIT);
}

/**
 * The list of a tab session's workhorses, and the shown one.
 * @param input What the list is read from.
 * @returns The list.
 */
function readWorkhorseList(input: WorkhorseListInput): BrowserWorkhorses {
	const live = new Set(liveWorkhorseCheckouts(input.session));
	const entries = listedCheckouts([...live], input.shown)
		.map((checkout) =>
			entryOf(
				input,
				checkout,
				live.has(checkout) ? input.session.workhorses.get(checkout) : undefined,
			),
		)
		.toSorted(byRepositoryThenCheckout);
	return { kind: "codex_workhorses", shown: input.shown, entries };
}

export { liveWorkhorseCheckouts, readWorkhorseList, type WorkhorseListInput };
