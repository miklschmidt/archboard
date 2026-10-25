// What the server-wide agent setup speaks through while focus moves between
// panes: the focused pane's owners and its transport, and the voice session,
// as one object that stays the same while they change. The setup listens to
// its transport and hears the new pane's state the moment focus moves.

import type { VoiceOwner, WorkbenchOwners } from "#ui/state/application/workbench-owners.ts";
import type { BrowserWorkbenchState } from "@archboard/codex-realtime-voice/controllers";

/** While no pane has a transport. */
const NO_TRANSPORT: BrowserWorkbenchState = Object.freeze({
	kind: "connection",
	state: "stopped",
	connection: "stopped",
	snapshot: null,
	sequence: null,
	reason: "No pane is connected to the Archboard server.",
});

/**
 * Nothing to stop listening to.
 * @returns Nothing.
 */
function listeningToNothing(): undefined {
	return undefined;
}

/** The focused pane's owners and the voice, retargeted as focus moves. */
interface AgentFocus {
	/**
	 * The focused pane's transport state.
	 * @returns The state, or the stopped state while no pane has a transport.
	 */
	readonly state: () => BrowserWorkbenchState;
	/**
	 * Listen for the focused transport's publications and for focus moving.
	 * @param listener Called after each.
	 * @returns Stops listening.
	 */
	readonly subscribe: (listener: () => void) => () => void;
	/**
	 * The focused pane's owners.
	 * @returns The owners, or null.
	 */
	readonly owners: () => WorkbenchOwners | null;
	/**
	 * The voice session.
	 * @returns The voice owner, or null.
	 */
	readonly voice: () => VoiceOwner | null;
	/**
	 * Follow what is focused now.
	 * @param owners The focused pane's owners, or null.
	 * @param voice The voice owner, or null.
	 */
	readonly retarget: (owners: WorkbenchOwners | null, voice: VoiceOwner | null) => void;
}

/**
 * An agent focus, following nothing yet.
 * @returns The focus.
 */
function createAgentFocus(): AgentFocus {
	let owners: WorkbenchOwners | null = null;
	let voice: VoiceOwner | null = null;
	let unsubscribe: () => void = listeningToNothing;
	const listeners = new Set<() => void>();
	/** Tell every listener the state may have changed. */
	const notify = (): void => {
		for (const listener of listeners) listener();
	};
	return {
		/**
		 * The focused pane's transport state.
		 * @returns The state.
		 */
		state: () => owners?.transport.state() ?? NO_TRANSPORT,
		/**
		 * Listen for publications and for focus moving.
		 * @param listener Called after each.
		 * @returns Stops listening.
		 */
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		/**
		 * The focused pane's owners.
		 * @returns The owners, or null.
		 */
		owners: () => owners,
		/**
		 * The voice session.
		 * @returns The voice owner, or null.
		 */
		voice: () => voice,
		/**
		 * Follow what is focused now.
		 * @param nextOwners The focused pane's owners, or null.
		 * @param nextVoice The voice owner, or null.
		 */
		retarget: (nextOwners, nextVoice) => {
			voice = nextVoice;
			if (nextOwners === owners) return;
			unsubscribe();
			owners = nextOwners;
			unsubscribe = nextOwners?.transport.subscribe(notify) ?? listeningToNothing;
			notify();
		},
	};
}

export { createAgentFocus, type AgentFocus };
