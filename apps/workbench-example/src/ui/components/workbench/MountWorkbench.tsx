import { createRoot } from "react-dom/client";
import { createVoiceClient, type VoiceClient } from "@archboard/codex-realtime-voice/browser";
import { VoiceClientProvider } from "@archboard/codex-realtime-voice/react";
import { followPageLifecycle } from "#ui/clients/workbench/page-client.ts";
import { Workbench } from "#ui/components/workbench/Workbench.tsx";
import { ExampleConfigurationSchema, WORKBENCH_SOCKET_PATH } from "#shared/protocol/application.ts";

/**
 * Mount the page over the page's voice client, and show the checkout it works in.
 */
function mountWorkbench(): void {
	const element = document.getElementById("root");
	if (element === null) throw new Error("The workbench page has no root element.");
	const root = createRoot(element);
	let checkout = "Connecting to the workbench…";
	let shown: VoiceClient | undefined;
	/** Draw the page over the shown client. */
	const render = () => {
		if (shown === undefined) return;
		root.render(
			<VoiceClientProvider client={shown}>
				<Workbench checkout={checkout} />
			</VoiceClientProvider>,
		);
	};
	followPageLifecycle(
		() => createVoiceClient({ socketPath: WORKBENCH_SOCKET_PATH }),
		(client) => {
			shown = client;
			render();
		},
	);
	void (async () => {
		checkout = await readCheckout();
		render();
	})();
}

/**
 * Read the checkout this server admits.
 * @returns Its path, or why it could not be read.
 */
async function readCheckout(): Promise<string> {
	try {
		const response = await fetch("/api/config");
		if (!response.ok) return `The workbench configuration could not be read (${response.status}).`;
		return ExampleConfigurationSchema.parse(await response.json()).checkout.path;
	} catch {
		return "The workbench configuration could not be read.";
	}
}

export { mountWorkbench };
