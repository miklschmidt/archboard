import { createRoot } from "react-dom/client";
import { Workbench } from "#ui/components/workbench/Workbench.tsx";
import { createExampleClient } from "#ui/clients/workbench/client.ts";

/**
 * Mount the page over one shared transport and media owner.
 */
function mountWorkbench(): void {
	const element = document.getElementById("root");
	if (element === null) throw new Error("The workbench page has no root element.");
	const client = createExampleClient();
	createRoot(element).render(<Workbench client={client} />);
	void client.connect();
	window.addEventListener("pagehide", () => void client.dispose(), { once: true });
}

export { mountWorkbench };
