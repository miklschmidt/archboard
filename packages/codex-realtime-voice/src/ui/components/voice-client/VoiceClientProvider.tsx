// Offers one voice client to the components drawn inside.

import type { JSX, ReactNode } from "react";

import { VoiceClientContext } from "#ui/hooks/voice-client/use-voice-client.ts";
import type { VoiceClient } from "#ui/state/voice-client/contract.ts";

/** Inputs for the provider. */
interface VoiceClientProviderProps {
	/** The client from `createVoiceClient`. The host connects and disposes it. */
	readonly client: VoiceClient;
	readonly children: ReactNode;
}

/**
 * The client, for `useVoiceClient` and `useVoiceState` below.
 * @param props The client and what is drawn.
 * @returns What is drawn, with the client offered to it.
 */
function VoiceClientProvider(props: VoiceClientProviderProps): JSX.Element {
	return (
		<VoiceClientContext.Provider value={props.client}>{props.children}</VoiceClientContext.Provider>
	);
}

export { VoiceClientProvider, type VoiceClientProviderProps };
