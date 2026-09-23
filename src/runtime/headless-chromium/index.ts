// A private headless Chromium, and the DevTools client that drives it: the one
// place archboard starts a browser of its own (ADR 0020). It is started in a
// private profile under a temporary root it owns, in its own process group,
// controlled only over loopback DevTools, and stopped with proof that the
// group and the root are gone. What its pages show is its callers' business.

export {
	DevTools,
	isJsonRecord,
	type DevToolsListener,
	type EvaluateOptions,
	type JsonRecord,
} from "@/runtime/headless-chromium/lib/devtools";
export {
	HeadlessChromiumError,
	type HeadlessChromiumCleanup,
	type HeadlessChromiumErrorCode,
} from "@/runtime/headless-chromium/lib/errors";
export {
	launchHeadlessChromium,
	type HeadlessChromium,
	type HeadlessChromiumOptions,
	type HeadlessWindow,
	type Viewport,
} from "@/runtime/headless-chromium/lib/launch";
export { discoveredChromiumPath } from "@/runtime/headless-chromium/lib/process";
