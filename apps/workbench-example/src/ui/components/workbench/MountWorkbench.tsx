import { createRoot } from "react-dom/client";
import { createVoiceClient } from "@archboard/codex-realtime-voice/browser";
import { VoiceClientProvider } from "@archboard/codex-realtime-voice/react";
import { Workbench } from "#ui/components/workbench/Workbench.tsx";
import { ExampleConfigurationSchema, WORKBENCH_SOCKET_PATH } from "#shared/protocol/application.ts";

/**
 * Mount the page over one voice client, and show the checkout it works in.
 */
function mountWorkbench(): void {
	const element = document.getElementById("root");
	if (element === null) throw new Error("The workbench page has no root element.");
	const root = createRoot(element);
	const client = createVoiceClient({ socketPath: WORKBENCH_SOCKET_PATH });
	/**
	 * Draw the page.
	 * @param checkout The checkout path, or why it is unknown.
	 */
	const render = (checkout: string) => {
		root.render(
			<VoiceClientProvider client={client}>
				<Workbench checkout={checkout} />
			</VoiceClientProvider>,
		);
	};
	render("Connecting to the workbench…");
	void readCheckout().then(render);
	void client.connect();
	window.addEventListener("pagehide", () => void client.dispose(), { once: true });
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
