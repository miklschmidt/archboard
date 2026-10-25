import { useCallback } from "react";
import { useVoiceClient, useVoiceState } from "@archboard/codex-realtime-voice/react";
import { VoicePanel } from "#ui/components/workbench/VoicePanel.tsx";
import { WorkhorsePanel } from "#ui/components/workbench/WorkhorsePanel.tsx";
import { AccountConnection } from "#ui/components/workbench/AccountConnection.tsx";

/**
 * Mount both roles over one voice client.
 * @param props The page facts the client does not hold.
 * @param props.checkout The checkout path the workhorse works in.
 * @returns The rendered controls or content.
 */
function Workbench({ checkout }: { readonly checkout: string }) {
	const client = useVoiceClient();
	const state = useVoiceState();
	const connect = useCallback(() => {
		void client.connect();
	}, [client]);
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
					<button disabled={state.busy} onClick={connect}>
						Reconnect
					</button>
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
			<AccountConnection />
			<div className="workspace">
				<VoicePanel />
				<WorkhorsePanel />
			</div>
		</main>
	);
}

export { Workbench };
