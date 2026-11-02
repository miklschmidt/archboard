// The renderer running in a browser tab: start it once, then draw a board from what the page read. Safe for the browser.
export {
	drawLegacyBoardHere,
	prepareContentHere,
	startBrowserRenderer,
} from "#ui/state/browser-renderer.ts";
export { startPainter } from "#ui/clients/painter.ts";
