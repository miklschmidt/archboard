// A private headless Chromium for its caller (ADR 0020): launch it, find its executable, drive its
// pages over DevTools, and stop it with proof of its teardown.
export { DevTools } from "#runtime/clients/devtools.ts";
export { HeadlessChromiumError } from "#runtime/processes/errors.ts";
export {
	launchHeadlessChromium,
	type HeadlessChromium,
	type HeadlessWindow,
} from "#runtime/processes/launch.ts";
export { discoveredChromiumPath } from "#runtime/processes/process.ts";
