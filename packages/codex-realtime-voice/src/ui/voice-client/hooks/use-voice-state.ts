// The React reading of one voice client: its published state through `useSyncExternalStore`,
// whole or by a selector.

import { useMemo, useSyncExternalStore } from "react";

import type { VoiceClient, VoiceClientSnapshot } from "#ui/voice-client/state/contract.ts";

/**
 * The client's whole state, re-rendering on each publication.
 * @param client The client from `createVoiceClient`.
 * @returns The state.
 */
function useVoiceState(client: Pick<VoiceClient, "snapshot" | "subscribe">): VoiceClientSnapshot;
/**
 * Part of the client's state, re-rendering only when that part changes.
 * @param client The client from `createVoiceClient`.
 * @param select Picks part of the state. It runs once per publication. Return
 *   a part of the state or a primitive: a new object is a change, so the
 *   component then re-renders on every publication.
 * @returns The selected part.
 */
function useVoiceState<Selected>(
	client: Pick<VoiceClient, "snapshot" | "subscribe">,
	select: (state: VoiceClientSnapshot) => Selected,
): Selected;
/**
 * The client's state, whole or by a selector.
 * @param client The client.
 * @param select Picks part of the state, when given.
 * @returns The selected part, or the whole state.
 */
function useVoiceState<Selected>(
	client: Pick<VoiceClient, "snapshot" | "subscribe">,
	select?: (state: VoiceClientSnapshot) => Selected,
): Selected | VoiceClientSnapshot {
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

export { useVoiceState };
