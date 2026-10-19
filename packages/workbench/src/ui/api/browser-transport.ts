// The browser's transport to the workbench gateway: it rides a pane's socket, publishes the one workbench state and the capabilities of the commands it answers, and carries a person's command to the gateway. Safe for the browser.
export { createBrowserWorkbenchTransport } from "#ui/clients/transport/transport.ts";
export type {
	BrowserWorkbenchCapabilities,
	BrowserWorkbenchState,
	BrowserWorkbenchTransport,
} from "#ui/state/transport/contract.ts";
