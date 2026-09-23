// Whether the conversation panel is open, remembered in this browser, and
// whether the agent said something while it was closed. The panel opens only
// on the person's gesture — the toggle, a message sent, Review, the status
// line — never because the agent did something.

import { useCallback, useState } from "react";

import type { Conversation } from "@/ui/workbench-runtime";

const STORAGE_KEY = "archboard.agent.panel";

/**
 * The person's last choice, closed without one.
 * @returns Whether the panel starts open.
 */
function storedOpen(): boolean {
	try {
		return window.localStorage.getItem(STORAGE_KEY) === "open";
	} catch {
		return false;
	}
}

/**
 * Remember the choice, when the browser lets us.
 * @param open Whether the panel is open.
 */
function storeOpen(open: boolean): void {
	try {
		window.localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
	} catch {
		// The panel still opens and closes for this session.
	}
}

/**
 * What the agent has said so far, in one comparable value.
 * @param conversation The conversation.
 * @returns The mark.
 */
function saidMark(conversation: Conversation): string {
	const last = conversation.turns.at(-1);
	if (last === undefined) return "";
	const said = last.items.filter((item) => item.media === "text").length;
	return `${last.turnId}:${said}:${last.outcome}`;
}

/** The panel's state and its moves. */
interface AgentPanelState {
	readonly open: boolean;
	readonly openPanel: () => void;
	readonly closePanel: () => void;
	readonly togglePanel: () => void;
}

/**
 * The conversation panel's state.
 * @returns The state and its moves.
 */
function useAgentPanel(): AgentPanelState {
	const [open, setOpen] = useState(storedOpen);
	const change = useCallback((next: boolean): void => {
		setOpen(next);
		storeOpen(next);
	}, []);
	const openPanel = useCallback(() => change(true), [change]);
	const closePanel = useCallback(() => change(false), [change]);
	const togglePanel = useCallback(() => change(!open), [change, open]);
	return { open, openPanel, closePanel, togglePanel };
}

/**
 * Whether the agent said something the person has not seen: it spoke while
 * the conversation was closed.
 * @param conversation The conversation.
 * @param open Whether the panel is open.
 * @returns True while something unseen waits.
 */
function useUnread(conversation: Conversation, open: boolean): boolean {
	const mark = saidMark(conversation);
	const [seen, setSeen] = useState(mark);
	if (open && seen !== mark) setSeen(mark);
	return !open && seen !== mark;
}

export { useAgentPanel, useUnread, type AgentPanelState };
