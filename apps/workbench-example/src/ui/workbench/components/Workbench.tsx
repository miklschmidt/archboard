import { useCallback } from "react";
import type { VoiceClient } from "@archboard/codex-realtime-voice/browser";
import { useVoiceState } from "@archboard/codex-realtime-voice/react";
import { VoicePanel } from "#ui/workbench/components/VoicePanel.tsx";
import { WorkhorsePanel } from "#ui/workbench/components/WorkhorsePanel.tsx";
import { AccountConnection } from "#ui/workbench/components/AccountConnection.tsx";

/**
 * Mount both roles over one voice client.
 * @param props The client and the page facts it does not hold.
 * @param props.client The page's voice client.
 * @param props.checkout The checkout path the workhorse works in.
 * @returns The rendered controls or content.
 */
function Workbench({
	client,
	checkout,
}: {
	readonly client: VoiceClient;
	readonly checkout: string;
}) {
	const state = useVoiceState(client);
	const refresh = useCallback(() => {
		void client.refresh();
	}, [client]);
	return (
		<main>
			<header className="page-heading">
				<div>
					<h1>Codex workbench</h1>
					<p>{checkout}</p>
				</div>
				<div className="actions">
					<output>{state.connection}</output>
					<button disabled={state.busy || state.connection !== "connected"} onClick={refresh}>
						Refresh
					</button>
				</div>
			</header>
			{state.failure && (
				<p className="error" role="alert">
					{state.failure.message}
				</p>
			)}
			<AccountConnection client={client} />
			<div className="workspace">
				<VoicePanel client={client} />
				<WorkhorsePanel client={client} />
			</div>
		</main>
	);
}

export { Workbench };
