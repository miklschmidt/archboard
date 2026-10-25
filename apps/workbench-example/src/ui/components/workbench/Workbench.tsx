import { useCallback, useSyncExternalStore } from "react";
import type { ExampleClient } from "#ui/clients/workbench/client.ts";
import { VoicePanel } from "#ui/components/workbench/VoicePanel.tsx";
import { WorkhorsePanel } from "#ui/components/workbench/WorkhorsePanel.tsx";
import { AccountConnection } from "#ui/components/workbench/AccountConnection.tsx";

/**
 * Mount both roles over one shared connection.
 * @param props The rendered state and its action owners.
 * @param props.client The shared connection and media client.
 * @returns The rendered controls or content.
 */
function Workbench({ client }: { readonly client: ExampleClient }) {
	const state = useSyncExternalStore(client.subscribe, client.snapshot);
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
					<p>{state.configuration?.checkout.path ?? "Connecting to the workbench…"}</p>
				</div>
				<div className="actions">
					<output>{state.transport.connection}</output>
					<button disabled={state.busy} onClick={connect}>
						Reconnect
					</button>
					<button
						disabled={state.busy || state.transport.connection !== "connected"}
						onClick={refresh}
					>
						Refresh
					</button>
				</div>
			</header>
			{state.error && (
				<p className="error" role="alert">
					{state.error}
				</p>
			)}
			<AccountConnection client={client} state={state} />
			<div className="workspace">
				<VoicePanel client={client} state={state} />
				<WorkhorsePanel client={client} state={state} />
			</div>
		</main>
	);
}

export { Workbench };
