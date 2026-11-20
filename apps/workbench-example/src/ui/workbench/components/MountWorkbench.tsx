import { createRoot } from "react-dom/client";
import { createVoiceClient } from "@archboard/codex-realtime-voice/browser";
import { Workbench } from "#ui/workbench/components/Workbench.tsx";
import { ExampleConfigurationSchema, WORKBENCH_SOCKET_PATH } from "#shared/protocol/application.ts";

/**
 * Mount the page over the page's voice client, and show the checkout it works in. The client
 * connects by itself, and lets go of its socket and microphone while the page is hidden.
 */
function mountWorkbench(): void {
	const element = document.getElementById("root");
	if (element === null) throw new Error("The workbench page has no root element.");
	const root = createRoot(element);
	const client = createVoiceClient({ url: WORKBENCH_SOCKET_PATH });
	let checkout = "Connecting to the workbench…";
	/** Draw the page over the client. */
	const render = () => {
		root.render(<Workbench client={client} checkout={checkout} />);
	};
	render();
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
