// The React reading of one voice client: the client a provider offers, and its
// published state through `useSyncExternalStore`, whole or by a selector.

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";

import type { VoiceClient, VoiceClientSnapshot } from "#ui/state/voice-client/contract.ts";

/** The client a `VoiceClientProvider` offers, or null outside one. */
const VoiceClientContext = createContext<VoiceClient | null>(null);

/**
 * The voice client of the nearest `VoiceClientProvider`, for its actions.
 * @returns The client.
 * @throws {Error} When no provider is above the component.
 */
function useVoiceClient(): VoiceClient {
	const client = useContext(VoiceClientContext);
	if (client === null) throw new Error("useVoiceClient needs a VoiceClientProvider above it.");
	return client;
}

/**
 * The client's whole state, re-rendering on each publication.
 * @returns The state.
 */
function useVoiceState(): VoiceClientSnapshot;
/**
 * Part of the client's state, re-rendering only when that part changes.
 * @param select Picks part of the state. It runs once per publication. Return
 *   a part of the state or a primitive: a new object is a change, so the
 *   component then re-renders on every publication.
 * @returns The selected part.
 */
function useVoiceState<Selected>(select: (state: VoiceClientSnapshot) => Selected): Selected;
/**
 * The client's state, whole or by a selector.
 * @param select Picks part of the state, when given.
 * @returns The selected part, or the whole state.
 */
function useVoiceState<Selected>(
	select?: (state: VoiceClientSnapshot) => Selected,
): Selected | VoiceClientSnapshot {
	const client = useVoiceClient();
	const read = useMemo(() => {
		if (select === undefined) return client.snapshot;
		// One selection per published state, so a selector that builds a new
		// object still gives React the same value until the state changes.
		let last: { readonly state: VoiceClientSnapshot; readonly selected: Selected } | null = null;
		return () => {
			const state = client.snapshot();
			if (last?.state !== state) last = { state, selected: select(state) };
			return last.selected;
		};
	}, [client, select]);
	return useSyncExternalStore<Selected | VoiceClientSnapshot>(client.subscribe, read, read);
}

export { VoiceClientContext, useVoiceClient, useVoiceState };
