// The renderer running in a browser tab: start it once, then draw a board from what the page read. Safe for the browser.
export {
	drawBoardHere,
	prepareContentHere,
	startBrowserRenderer,
} from "#ui/state/browser-renderer.ts";
export {
	fallBackToCpu,
	startPainter,
	type PainterKind,
	type StartedPainter,
} from "#ui/clients/painter.ts";
