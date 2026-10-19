// The private headless Chromium and the DevTools client that drives it.
export { DevTools, isJsonRecord } from "#runtime/clients/headless-chromium/devtools.ts";
export type { JsonRecord } from "#runtime/clients/headless-chromium/devtools.ts";
export { HeadlessChromiumError } from "#runtime/processes/headless-chromium/errors.ts";
export { launchHeadlessChromium } from "#runtime/processes/headless-chromium/launch.ts";
export type {
	HeadlessChromium,
	HeadlessWindow,
} from "#runtime/processes/headless-chromium/launch.ts";
export { discoveredChromiumPath } from "#runtime/processes/headless-chromium/process.ts";
