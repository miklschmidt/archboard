// What a pane and the server say to each other, and how long each side waits
// for the other: the pane's own reports, its socket, and the server's waits on a
// pane after it asked the browser to do something.

import { durations } from "#shared/constants/durations.ts";

/** `PANE_MS.socketReconnect`, named once so that `contactLost` can count redials of it. */
const SOCKET_RECONNECT_MS = 3000;

/** The pane and the server, each waiting on the other. */
const PANE_MS = durations({
	/**
	 * How long the pane waits before publishing a changed selection.
	 *
	 * Selection is high-frequency and cheap, ids only, so it gets its own and much
	 * shorter debounce. 150 ms coalesces a lasso drag into one POST while still
	 * feeling immediate to somebody talking to an agent about "these boxes".
	 */
	selectionDebounce: 150,
	/**
	 * How long the pane waits before reporting where it sits and what of its board
	 * is on screen.
	 *
	 * It changes on every scroll and zoom, and it is only sent when it has
	 * actually changed. An agent must be able to read it every turn, which it can
	 * only afford if the browser is not posting it continuously.
	 */
	report: 300,
	/**
	 * How long a pane waits before dialling the socket again after it drops.
	 *
	 * It is also the grace before a pane reads a dropped socket as anything at
	 * all. A pane stays editable through a socket blip (ADR 0022, TASK-153): lock
	 * state is broadcast over this socket, but a pane that cannot hear it for a
	 * moment does not assume the board is held, because a person refused their
	 * own edit for a network hiccup is the wall stopping for no reason they can
	 * see. Only `contactLost` below puts the pane in view mode.
	 */
	socketReconnect: SOCKET_RECONNECT_MS,
	/**
	 * How long a pane goes without the server before it treats contact as lost
	 * and shows the board in view mode.
	 *
	 * Two redial intervals, so one failed redial is a blip and a second is loss.
	 * A redial that succeeds inside the first interval never shows view mode for
	 * a frame, and a pane that cannot hear lock broadcasts for longer than that
	 * stops accepting content edits, since it can no longer say whether an agent
	 * has claimed the board (ADR 0022). Pan and zoom keep working throughout.
	 */
	contactLost: 2 * SOCKET_RECONNECT_MS,
	/**
	 * How long the server waits for the panes to say where they ended up, after
	 * asking the browser to split or close one.
	 *
	 * This is a cap, not a delay. The wait ends as soon as the panes the layout
	 * change moved have re-reported; a pane it did not touch is not waited on
	 * (TASK-153). It exists because a pane that has just been mounted, or just
	 * been squeezed into half the width, reports its new rectangle a beat later,
	 * and answering before that arrives means answering out of stale geometry.
	 * That is how a plain left/right split once came back described as "row 2,
	 * column 2". Observed on the first real browser run, not guessed.
	 *
	 * The beat it is waiting out is PANE_MS.report, which is the coupling worth
	 * knowing about: this must stay comfortably above it, or the cap expires while
	 * the browser is still sitting on the report that would have ended the wait.
	 * 300 against 1500 leaves room for the round trip and a slow frame.
	 */
	settleCap: 1500,
	/**
	 * How long the server waits for the browser to change its layout at all.
	 *
	 * The acknowledgement is the pane appearing in the registry or its socket
	 * closing, never a promise from the shell, because a registration is the only
	 * evidence anywhere that a pane exists. This is the outer bound on that, and
	 * it is generous because failing it means telling a user their split did not
	 * happen when it may only have been slow.
	 */
	layoutTimeout: 10_000,
	/**
	 * How long the server waits for a pane to say a walkthrough step it asked for
	 * has finished arriving: the first step of a narration (TASK-251).
	 *
	 * The acknowledgement is the pane's own report, for the same reason a layout's
	 * is a registration. A step costs the glide (`PRESENTATION_MS.step`, 900), or a
	 * picture flight when it changes view (`PICTURE_MS.transition`, 640) after the
	 * new picture has been fetched and drawn, then the report's debounce
	 * (`PANE_MS.selectionDebounce`, 150) and a round trip: a couple of seconds at worst.
	 * It pulls against a voice that stays silent until that step reaches it, so it
	 * is far shorter than a layout's bound.
	 */
	presentationArrival: 8000,
});

export { PANE_MS };
