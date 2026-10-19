// Whether the conversation panel is open, remembered in this browser, and
// whether the agent said something while it was closed. The panel opens only
// on the person's gesture — the toggle, a message sent, Review, the status
// line — never because the agent did something.

import { useCallback, useMemo, useState } from "react";

import type { Conversation } from "@archboard/workbench/agent";

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
	/** The session's details show in place of the conversation. */
	readonly details: boolean;
	/** Show the conversation: whoever asks for the panel asks for what it is about. */
	readonly openPanel: () => void;
	readonly closePanel: () => void;
	readonly togglePanel: () => void;
	readonly showDetails: () => void;
	readonly showConversation: () => void;
}

/**
 * The conversation panel's state.
 * @returns The state and its moves.
 */
function useAgentPanel(): AgentPanelState {
	const [open, setOpen] = useState(storedOpen);
	const [details, setDetails] = useState(false);
	const change = useCallback((next: boolean): void => {
		setOpen(next);
		storeOpen(next);
		setDetails(false);
	}, []);
	const openPanel = useCallback(() => change(true), [change]);
	const closePanel = useCallback(() => change(false), [change]);
	const togglePanel = useCallback(() => change(!open), [change, open]);
	const showDetails = useCallback(() => setDetails(true), []);
	const showConversation = useCallback(() => setDetails(false), []);
	return useMemo(
		() => ({ open, details, openPanel, closePanel, togglePanel, showDetails, showConversation }),
		[open, details, openPanel, closePanel, togglePanel, showDetails, showConversation],
	);
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
