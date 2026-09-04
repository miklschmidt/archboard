import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The opt-in DOM for rendered UI owners.
//
// Happy DOM is never registered for the whole suite. Server, process, and
// system owners keep a plain Node-like global: a suite-wide `document` would
// change what those owners are proving, and `bunfig.toml`'s preload stays a
// wall-clock reporter rather than an environment. A rendered UI owner opts in
// by calling `registerHappyDom()` at the top of its own file and releasing the
// window in `afterAll`.
//
// Load order is the reason this module owns a loader instead of re-exporting
// Testing Library. `@testing-library/user-event` captures `globalThis.document`
// while its module body evaluates, and ES module imports are evaluated before
// any statement in the importing file. A static `import ... from
// "@testing-library/user-event"` in a test file therefore reads the Node global
// that has no document, whatever the file does afterwards.
// `loadRenderedUiTools()` imports both libraries after registration, so the
// ordering cannot be spelled wrong.

// Type-only imports. `verbatimModuleSyntax` erases them, so neither library is
// loaded until `loadRenderedUiTools()` imports it against the registered window.
import type * as ReactTestingLibrary from "@testing-library/react";
import type userEventDefaultExport from "@testing-library/user-event";

export interface HappyDomWindowOptions {
	readonly width?: number;
	readonly height?: number;
	readonly url?: string;
}

export interface RenderedUiTools {
	readonly render: typeof ReactTestingLibrary.render;
	readonly screen: typeof ReactTestingLibrary.screen;
	readonly within: typeof ReactTestingLibrary.within;
	readonly waitFor: typeof ReactTestingLibrary.waitFor;
	readonly cleanup: typeof ReactTestingLibrary.cleanup;
	readonly act: typeof ReactTestingLibrary.act;
	readonly userEvent: typeof userEventDefaultExport;
}

// Archboard's shell is desktop-only, so the opt-in window is desktop-sized.
const DEFAULT_WINDOW = {
	width: 1440,
	height: 900,
	url: "https://archboard.test/",
} as const satisfies Required<HappyDomWindowOptions>;

/**
 * Installs Happy DOM's `window`, `document`, and friends on the current
 * process. Call it once, at the top of one rendered UI test file, before
 * `loadRenderedUiTools()`.
 */
export function registerHappyDom(options: HappyDomWindowOptions = {}): void {
	if (GlobalRegistrator.isRegistered)
		throw new Error(
			"Happy DOM is already registered. One test file registers once; call unregisterHappyDom() in afterAll.",
		);
	GlobalRegistrator.register({ ...DEFAULT_WINDOW, ...options });
}

/**
 * Closes the Happy DOM window and restores the plain Node-like global. Safe to
 * call when nothing is registered, so an `afterAll` never masks a failure that
 * happened before registration.
 */
export async function unregisterHappyDom(): Promise<void> {
	if (!GlobalRegistrator.isRegistered) return;
	await GlobalRegistrator.unregister();
}

/**
 * Imports React Testing Library and user-event against the registered window.
 * Await it at the top of the test file; never import either library directly.
 */
export async function loadRenderedUiTools(): Promise<RenderedUiTools> {
	if (!GlobalRegistrator.isRegistered)
		throw new Error(
			"Call registerHappyDom() before loadRenderedUiTools(); Testing Library binds to the document it is imported with.",
		);
	const [reactTestingLibrary, userEventLibrary] = await Promise.all([
		import("@testing-library/react"),
		import("@testing-library/user-event"),
	]);
	return {
		render: reactTestingLibrary.render,
		screen: reactTestingLibrary.screen,
		within: reactTestingLibrary.within,
		waitFor: reactTestingLibrary.waitFor,
		cleanup: reactTestingLibrary.cleanup,
		act: reactTestingLibrary.act,
		userEvent: userEventLibrary.default,
	};
}
