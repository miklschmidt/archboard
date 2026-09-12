// Whether a pane is in contact with the server, and when a dropped socket
// stops being a blip. A pane's edits are optimistic and the note decides
// (ADR 0022): a write made while the socket is down is refused by the lock or
// the version check and the pane reconciles, so losing the socket protects
// nothing by itself. The pane keeps taking edits through one reconnect
// attempt and only reads contact as lost once that window has passed.

import { useCallback, useEffect, useReducer } from "react";

import { CONTACT_LOST_MS } from "@/shared/timing/timing";

/** A pane's contact with the server. */
interface PaneContact {
	/** Whether the pane's socket is open and its report accepted. */
	readonly connected: boolean;
	/**
	 * Whether the pane has been out of contact for longer than one reconnect
	 * attempt. Never true while connected, and false on mount.
	 */
	readonly lost: boolean;
}

/** What moves a pane's contact. */
type PaneContactEvent = "connected" | "disconnected" | "reconnect_window_passed";

const NOT_YET_CONNECTED: PaneContact = Object.freeze({ connected: false, lost: false });
const IN_CONTACT: PaneContact = Object.freeze({ connected: true, lost: false });
const CONTACT_LOST: PaneContact = Object.freeze({ connected: false, lost: true });

/**
 * Move a pane's contact by one event; the same state comes back unchanged.
 * @param state The contact before the event.
 * @param event What happened.
 * @returns The contact after it.
 */
function reducePaneContact(state: PaneContact, event: PaneContactEvent): PaneContact {
	const next = TRANSITIONS[event](state);
	return next.connected === state.connected && next.lost === state.lost ? state : next;
}

/** Where each event takes a contact; `reducePaneContact` keeps a state that did not move. */
const TRANSITIONS: Readonly<Record<PaneContactEvent, (state: PaneContact) => PaneContact>> = {
	/**
	 * The socket opened and the pane's report was accepted.
	 * @returns In contact.
	 */
	connected: () => IN_CONTACT,
	/**
	 * The socket dropped; a pane already out of contact stays where it was.
	 * @param state The contact before.
	 * @returns Out of contact, with `lost` kept.
	 */
	disconnected: (state) => (state.connected ? NOT_YET_CONNECTED : state),
	/**
	 * One reconnect attempt has had its chance.
	 * @param state The contact before.
	 * @returns Lost, unless the pane is connected.
	 */
	reconnect_window_passed: (state) => (state.connected ? state : CONTACT_LOST),
};

/** A pane's contact, and the one way to report it. */
interface PaneContactCell {
	readonly contact: PaneContact;
	readonly setConnected: (connected: boolean) => void;
}

/**
 * Track one pane's contact with the server. The reconnect window is the one
 * timer here: it arms whenever the pane is disconnected, mount included, and
 * a connection inside it leaves no trace.
 * @returns The contact and its setter, which never changes identity.
 */
function usePaneContact(): PaneContactCell {
	const [contact, dispatch] = useReducer(reducePaneContact, NOT_YET_CONNECTED);
	useEffect(() => {
		if (contact.connected) {
			return undefined;
		}
		const window = setTimeout(() => dispatch("reconnect_window_passed"), CONTACT_LOST_MS);
		return () => clearTimeout(window);
	}, [contact.connected]);
	const setConnected = useCallback((connected: boolean): void => {
		dispatch(connected ? "connected" : "disconnected");
	}, []);
	return { contact, setConnected };
}

export { reducePaneContact, usePaneContact, type PaneContact, type PaneContactEvent };
