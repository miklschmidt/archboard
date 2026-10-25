// The agent dock's list of a tab's workhorses (ADR 0050). What is guarded: it names the shown
// checkout and every workhorse with a thread, once each, in label order; it marks a running
// turn, an approval and a question by the workhorse that asked; and the coordinator's own
// approvals mark no workhorse.

import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "@archboard/codex-app-server/identity";
import { parseTabSessionId, type TabSessionId } from "#server/rules/tab-session/tab-session.ts";
import { readWorkhorseList } from "#server/projections/browser-state/workhorse-list.ts";
import {
	tabSessionLink,
	workhorseApprovalLink,
} from "#server/services/actions/ordinary-approvals.ts";
import type { WorkhorseListInput } from "#server/projections/browser-state/workhorse-list.ts";

const TAB = parseTabSessionId("tab-one") as TabSessionId;
const { decoder } = createIdentityAuthorities().identity;

/**
 * A workhorse of the tab as the list reads it.
 * @param checkout Its checkout.
 * @param thread Its thread, or null before it started one.
 * @param turn The turn it runs, or null while none runs.
 * @returns The workhorse.
 */
function workhorse(checkout: string, thread: string | null, turn: string | null = null) {
	const threadId = thread === null ? null : decoder.adoptThreadId(thread);
	return {
		checkout,
		components: { workhorse: { snapshot: () => ({ threadId }) } },
		state: {
			activeTurn:
				threadId === null || turn === null ? null : { threadId, turnId: decoder.adoptTurnId(turn) },
		},
	};
}

/**
 * The list of a tab with these workhorses and approvals.
 * @param shown The shown checkout.
 * @param workhorses Its workhorses.
 * @param approvals What the approval broker holds.
 * @returns The list.
 */
function listOf(
	shown: string,
	workhorses: ReturnType<typeof workhorse>[],
	approvals: { link: string; family: string; state: string }[] = [],
) {
	const labels = new Map([
		["/work/payments", "acme/payments"],
		["/work/payments-fix", "acme/payments"],
		["/work/docs", "acme/docs"],
	]);
	return readWorkhorseList({
		tabSessionId: TAB,
		session: { workhorses: new Map(workhorses.map((each) => [each.checkout, each])) },
		approvals: {
			inspect: () =>
				approvals.map(({ link, family, state }) => ({ binding: { link }, family, state })),
		},
		shown,
		checkoutLabel: (checkout: string) => labels.get(checkout) ?? checkout.slice("/work/".length),
	} as unknown as WorkhorseListInput);
}

test("the list names the shown checkout and each workhorse with a thread, by label then checkout", () => {
	const list = listOf("/work/notes", [
		workhorse("/work/payments-fix", "thread-fix"),
		workhorse("/work/payments", "thread-payments"),
		workhorse("/work/docs", "thread-docs"),
		workhorse("/work/zeta", "thread-zeta"),
		// Built for a queue read, with no thread yet: nothing to pick.
		workhorse("/work/shop", null),
	]);

	expect(list.shown).toBe("/work/notes");
	expect(list.entries.map(({ checkout, label, live }) => [checkout, label, live])).toEqual([
		["/work/docs", "acme/docs", true],
		// Two checkouts of one label sort by path.
		["/work/payments", "acme/payments", true],
		["/work/payments-fix", "acme/payments", true],
		["/work/notes", "notes", false],
		["/work/zeta", "zeta", true],
	]);
});

test("the shown checkout is listed once, live once its workhorse has a thread", () => {
	const list = listOf("/work/payments", [workhorse("/work/payments", "thread-payments")]);

	expect(list.entries).toEqual([
		{
			checkout: "/work/payments",
			label: "acme/payments",
			live: true,
			running: false,
			waitingForApproval: false,
			waitingForUser: false,
		},
	]);
});

test("an entry is marked by its own running turn, approval and question, and never by the coordinator's", () => {
	const list = listOf(
		"/work/payments",
		[
			workhorse("/work/payments", "thread-payments", "turn-payments"),
			workhorse("/work/docs", "thread-docs"),
			workhorse("/work/zeta", "thread-zeta"),
		],
		[
			{
				link: workhorseApprovalLink(TAB, "/work/payments"),
				family: "command_execution",
				state: "pending",
			},
			{ link: workhorseApprovalLink(TAB, "/work/docs"), family: "user_input", state: "staged" },
			{ link: workhorseApprovalLink(TAB, "/work/docs"), family: "elicitation", state: "pending" },
			// Answered already: nobody waits on it.
			{ link: workhorseApprovalLink(TAB, "/work/zeta"), family: "file_change", state: "settled" },
			// The coordinator's speaks for the whole tab.
			{ link: tabSessionLink(TAB), family: "command_execution", state: "pending" },
		],
	);

	const marks = Object.fromEntries(
		list.entries.map(({ checkout, running, waitingForApproval, waitingForUser }) => [
			checkout,
			{ running, waitingForApproval, waitingForUser },
		]),
	);
	expect(marks).toEqual({
		"/work/payments": { running: true, waitingForApproval: true, waitingForUser: false },
		"/work/docs": { running: false, waitingForApproval: false, waitingForUser: true },
		"/work/zeta": { running: false, waitingForApproval: false, waitingForUser: false },
	});
});
