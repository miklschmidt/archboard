// The workbench as the server runs it: the routes it mounts, the pane socket it accepts, the
// checkout registry it follows, and its place in the server's start and stop.
//
// The server starts it with `prepareWorkbench`, which follows the checkout registry last. On stop,
// `closeBrowserOwners` runs before the socket server closes, given every socket the server
// accepted, and `stopWorkbench` runs after the HTTP server has closed.
export { mountWorkbenchRoutes } from "#server/workbench-host/routes/workbench-routes.ts";
export { acceptPaneSocket } from "#server/panes/sockets/pane-socket.ts";
export { followRegistry } from "#server/panes/services/registry-follow.ts";
export { prepareWorkbench, stopWorkbench } from "#server/workbench-host/services/wiring.ts";
export { closeBrowserOwners } from "#server/panes/services/pane-sockets.ts";
export { admittedClientCount } from "#server/panes/services/registry.ts";
