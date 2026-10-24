// The dock's list of the tab session's workhorses (ADR 0050): it is there only
// while there are two or more to pick from, it marks the shown one, it says in
// words what each waits on, and a pick names the checkout picked. The keyboard
// reaches each as a button of a toggle group, which the browser owner drives.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { act, fireEvent, render } from "@testing-library/react";
import { afterAll, beforeAll, expect, test } from "bun:test";

import type { BrowserWorkhorses } from "@archboard/agent-workbench/contract";
import { ConversationList } from "#ui/components/panel/ConversationList.tsx";

beforeAll(() => {
	GlobalRegistrator.register();
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });
});

afterAll(async () => {
	await GlobalRegistrator.unregister();
});

const SHOP = "/work/shop";
const WORKTREE = "/work/shop-feature";

/**
 * One workhorse at rest.
 * @param checkout Its checkout.
 * @returns The entry.
 */
function idle(checkout: string): BrowserWorkhorses["entries"][number] {
	return {
		checkout,
		repository: "github.com/acme/shop",
		live: true,
		running: false,
		waitingForApproval: false,
		waitingForUser: false,
	};
}

/** Checkouts picked, in order. */
const picked: string[] = [];

/**
 * Keep a pick.
 * @param checkout The checkout picked.
 */
function keepPick(checkout: string): void {
	picked.push(checkout);
}

const ALONE: BrowserWorkhorses = { kind: "codex_workhorses", shown: SHOP, entries: [idle(SHOP)] };

const TWO: BrowserWorkhorses = {
	kind: "codex_workhorses",
	shown: SHOP,
	entries: [idle(SHOP), { ...idle(WORKTREE), waitingForApproval: true }],
};

/**
 * Press a button.
 * @param button The button.
 */
function press(button: HTMLElement): void {
	act(() => {
		fireEvent.click(button);
	});
}

/**
 * The list's two buttons, in order.
 * @param buttons Every button drawn.
 * @returns The first and the second.
 */
function twoOf(buttons: readonly HTMLElement[]): readonly [HTMLElement, HTMLElement] {
	const [first, second] = buttons;
	if (first === undefined || second === undefined) throw new Error("The list has fewer than two.");
	return [first, second];
}

test("one workhorse lists nothing, since there is nothing to pick", () => {
	const view = render(<ConversationList workhorses={ALONE} onPick={keepPick} />);
	expect(view.queryByRole("group", { name: "Conversations" })).toBeNull();
	view.unmount();
});

test("the list marks the shown checkout, says what one waits on, and a pick names its checkout", () => {
	picked.length = 0;
	const view = render(<ConversationList workhorses={TWO} onPick={keepPick} />);
	const group = view.getByRole("group", { name: "Conversations" });
	const [shown, other] = twoOf(view.getAllByRole("button"));
	expect(group.contains(shown)).toBe(true);
	expect(shown.getAttribute("aria-pressed")).toBe("true");
	expect(other.getAttribute("aria-pressed")).toBe("false");
	// The other names its checkout's directory, which tells two checkouts of one repository apart.
	expect(other.textContent).toContain("shop-feature");
	expect(other.textContent).not.toBe(shown.textContent);

	press(other);
	expect(picked).toEqual([WORKTREE]);
	// Pressing the shown one keeps it: nothing is picked.
	press(shown);
	expect(picked).toEqual([WORKTREE]);
	view.unmount();
});

/**
 * Two workhorses at rest but for what the second waits on.
 * @param wait What the second waits on.
 * @returns The list.
 */
function secondWaiting(wait: Partial<BrowserWorkhorses["entries"][number]>): BrowserWorkhorses {
	return { ...TWO, entries: [idle(SHOP), { ...idle(WORKTREE), ...wait }] };
}

/**
 * The words of the second workhorse while it waits on something, or on nothing.
 * @param wait What it waits on.
 * @returns Its words.
 */
function wordsWhile(wait: Partial<BrowserWorkhorses["entries"][number]>): string | null {
	const view = render(<ConversationList workhorses={secondWaiting(wait)} onPick={keepPick} />);
	const [, other] = twoOf(view.getAllByRole("button"));
	const words = other.textContent;
	view.unmount();
	return words;
}

test("the list says in words, not in colour alone, what a workhorse waits on", () => {
	const words = [
		wordsWhile({}),
		wordsWhile({ waitingForApproval: true }),
		wordsWhile({ waitingForUser: true }),
	];
	expect(new Set(words).size).toBe(words.length);
});
