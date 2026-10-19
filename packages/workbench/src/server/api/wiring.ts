// Installing the workbench into the server: the wiring that panes and routes reach it through, its preparation and stop, and the browser socket owner. Bun only.
export {
	createServerCodexBrowserSocketOwner,
	createServerCodexBrowserSocketSend,
} from "#server/services/browser-socket/socket.ts";
export { codexWiring, publishPaneContext } from "#server/services/owner/wiring-hooks.ts";
export { prepareCodexWorkbench, stopCodexWorkbench } from "#server/services/owner/wiring.ts";
