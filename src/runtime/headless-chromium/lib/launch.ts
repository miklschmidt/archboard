// One headless Chromium, started in its own process group and its own
// temporary root, reachable only over loopback DevTools, and proving what
// became of everything it owned when it stops (ADR 0020). It opens pages and
// windows for its caller and knows nothing about what they show.

import { mkdtempSync } from "node:fs";
import { join } from "node:path";

import type { CodexProcessGroupIdentity } from "@/runtime/codex-process/process-group";

import { DevTools, isJsonRecord, type JsonRecord } from "@/runtime/headless-chromium/lib/devtools";
import {
	HeadlessChromiumError,
	messageOf,
	type HeadlessChromiumCleanup,
} from "@/runtime/headless-chromium/lib/errors";
import {
	browserSocketUrl,
	devToolsPortIn,
	pollUntil,
	processGroups,
	removeTempRoot,
	requireChromiumHost,
	spawnChromium,
	stopProcessGroup,
	tempParent,
	type ChromiumProcess,
} from "@/runtime/headless-chromium/lib/process";

/** What a caller settles about one Chromium. */
interface HeadlessChromiumOptions {
	/** The Chromium-family executable. */
	readonly chromiumPath: string;
	/** Flags of the caller's own, after the ones every caller needs. */
	readonly extraArgs?: readonly string[];
	/** How long Chromium may take to listen and accept the browser connection. */
	readonly startupTimeoutMs: number;
	/** How long each phase of stopping its process group may take. */
	readonly cleanupTimeoutMs: number;
	/** How the temporary root's name begins, which says who left one behind. */
	readonly tempRootPrefix?: string;
	/** Cancels startup. */
	readonly signal?: AbortSignal;
}

/** The size of a page's viewport, in CSS pixels. */
interface Viewport {
	readonly width: number;
	readonly height: number;
}

/** A window opened at an exact viewport, and the connection to its page. */
interface HeadlessWindow {
	readonly targetId: string;
	readonly page: DevTools;
}

/** One started Chromium. */
interface HeadlessChromium {
	/** The process leading its group. */
	readonly pid: number;
	/** The directory it and its caller write under; stop removes it. */
	readonly tempRoot: string;
	/** The browser target, for Browser.* and Target.* methods. */
	readonly browser: DevTools;
	/**
	 * How the process ended.
	 * @returns Its exit code or signal, or null while it runs.
	 */
	exitStatus(): number | NodeJS.Signals | null;
	/**
	 * Open a blank page target, with Page, Runtime and Log enabled.
	 * @param timeoutMs How long opening it may take.
	 * @param signal Cancels opening it.
	 * @returns The connection to the page.
	 */
	openPage(timeoutMs: number, signal?: AbortSignal): Promise<DevTools>;
	/**
	 * Open a window whose page viewport is exactly the size asked for, and
	 * navigate it. A viewport larger than the headless screen (800×600 unless
	 * `--screen-info={WxH}` is among the extra arguments) is refused.
	 * @param url Where the page goes once it is sized.
	 * @param viewport The page's size.
	 * @param timeoutMs How long opening and sizing it may take.
	 * @returns The window's target and the connection to its page.
	 */
	openWindow(url: string, viewport: Viewport, timeoutMs: number): Promise<HeadlessWindow>;
	/**
	 * Stop, once: close every connection, stop the whole process group and
	 * remove the temporary root.
	 * @returns What the teardown proved; `clean` is false when something was left.
	 */
	stop(): Promise<HeadlessChromiumCleanup>;
}

/** Everything a Chromium session owns, filled in as startup acquires it. */
interface Owned {
	tempRoot: string | null;
	child: ChromiumProcess | null;
	group: CodexProcessGroupIdentity | null;
	outputTail: string;
	readonly connections: Set<DevTools>;
}

/** A process started under its own root. */
interface Spawned {
	readonly child: ChromiumProcess;
	readonly tempRoot: string;
}

/** A process that listens, and the connection to its browser target. */
interface Listening extends Spawned {
	readonly port: number;
	readonly browser: DevTools;
}

/** How much of Chromium's own output a startup failure quotes. */
const OUTPUT_TAIL_CHARACTERS = 4096;

/** What a window's page answers about its size and its screen. */
const WINDOW_METRICS = `({
	innerWidth, innerHeight, outerWidth, outerHeight,
	screenWidth: screen.width, screenHeight: screen.height,
})`;

/** A window's page size, the chrome around it and the screen it sits on. */
interface WindowMetrics {
	readonly innerWidth: number;
	readonly innerHeight: number;
	readonly outerWidth: number;
	readonly outerHeight: number;
	readonly screenWidth: number;
	readonly screenHeight: number;
}

/**
 * Keep the tail of one output pipe for a failure to quote, and let the pipe
 * drain so the process never blocks on it.
 * @param owned Where the tail is kept.
 * @param stream The pipe.
 */
async function drain(owned: Owned, stream: ReadableStream<Uint8Array>): Promise<void> {
	const decoder = new TextDecoder();
	try {
		for await (const chunk of stream) {
			owned.outputTail = (owned.outputTail + decoder.decode(chunk)).slice(-OUTPUT_TAIL_CHARACTERS);
		}
	} catch {
		// A closed pipe is the end of the process, which the teardown proves.
	}
}

/**
 * Start Chromium in its own group and temporary root.
 * @param owned Where what it acquires is recorded.
 * @param options What the caller settled.
 * @throws {Error} When no executable was named.
 * @returns The process and its root.
 */
function spawnInto(owned: Owned, options: HeadlessChromiumOptions): Spawned {
	if (options.chromiumPath === "") {
		throw new Error(
			"no Chromium or Google Chrome executable was found; install one, or name it with ARCHBOARD_RENDERER_CHROMIUM.",
		);
	}
	requireChromiumHost();
	const tempRoot = mkdtempSync(join(tempParent(), options.tempRootPrefix ?? "archboard-chromium-"));
	owned.tempRoot = tempRoot;
	const child = spawnChromium(options.chromiumPath, tempRoot, options.extraArgs ?? []);
	owned.child = child;
	owned.group = processGroups.capture(child.pid);
	void drain(owned, child.stderr);
	void drain(owned, child.stdout);
	return { child, tempRoot };
}

/**
 * The failure to report when Chromium exited before it listened, or null
 * while it is still running.
 * @param child The process.
 * @returns The failure, or null.
 */
function exitedEarly(child: ChromiumProcess): Error | null {
	if (child.exitCode === null && child.signalCode === null) return null;
	return new Error(
		`Chromium exited with ${child.signalCode ?? child.exitCode} before it listened.`,
	);
}

/**
 * Wait for Chromium to say which port it listens on.
 * @param spawned The process and its root.
 * @param deadline When to give up.
 * @param signal Cancels the wait.
 * @returns The port.
 */
async function listeningPort(
	spawned: Spawned,
	deadline: number,
	signal?: AbortSignal,
): Promise<number> {
	const port = await pollUntil(
		() => {
			signal?.throwIfAborted();
			return Promise.resolve(exitedEarly(spawned.child) ?? devToolsPortIn(spawned.tempRoot));
		},
		deadline,
		"Chromium did not open its DevTools port in time.",
	);
	if (typeof port !== "number") throw port;
	return port;
}

/**
 * Stop the process group, if one was started, and say whether the leader
 * really exited.
 * @param owned What the session owns.
 * @param timeoutMs How long each signal may take.
 * @param errors Where to record a leader that stayed.
 * @returns Whether the process is gone.
 */
async function stopChild(owned: Owned, timeoutMs: number, errors: string[]): Promise<boolean> {
	const child = owned.child;
	if (child === null) return true;
	try {
		if (owned.group === null) {
			child.kill("SIGKILL");
			throw new Error("Chromium process group ownership could not be established.");
		}
		const gone = await stopProcessGroup(child, owned.group, timeoutMs);
		if (!gone) errors.push(`Chromium group ${child.pid} did not exit after SIGKILL`);
		return gone;
	} catch (error) {
		errors.push(messageOf(error));
		return false;
	}
}

/**
 * Close every connection, stop the process group, and remove the temporary
 * root once the group is gone; record every step that did not happen.
 * @param owned What the session owns.
 * @param timeoutMs How long each signal may take.
 * @returns What the teardown proved.
 */
async function teardown(owned: Owned, timeoutMs: number): Promise<HeadlessChromiumCleanup> {
	const errors: string[] = [];
	for (const connection of owned.connections) connection.close();
	const processGone = await stopChild(owned, timeoutMs, errors);
	const tempRoot = owned.tempRoot;
	const tempRootRemoved = processGone && (tempRoot === null || removeTempRoot(tempRoot, errors));
	// Every step that did not happen recorded why, so no errors is clean.
	return {
		clean: errors.length === 0,
		pid: owned.child?.pid ?? null,
		processGone,
		tempRootRemoved,
		errors,
	};
}

/**
 * The target a Target.createTarget answer names.
 * @param created The answer.
 * @returns The target id.
 */
function targetIdOf(created: JsonRecord): string {
	if (typeof created["targetId"] !== "string") {
		throw new HeadlessChromiumError("failed", "Chromium did not name the target it created.");
	}
	return created["targetId"];
}

/**
 * The metrics a window's page reported.
 * @param value What the page answered.
 * @returns The metrics.
 */
function checkedMetrics(value: unknown): WindowMetrics {
	const record = isJsonRecord(value) ? value : {};
	/**
	 * One reported size.
	 * @param key Which.
	 * @returns Its value.
	 */
	const size = (key: keyof WindowMetrics): number => {
		const measured = record[key];
		if (typeof measured !== "number") {
			throw new HeadlessChromiumError("failed", "The window's page did not report its size.");
		}
		return measured;
	};
	return {
		innerWidth: size("innerWidth"),
		innerHeight: size("innerHeight"),
		outerWidth: size("outerWidth"),
		outerHeight: size("outerHeight"),
		screenWidth: size("screenWidth"),
		screenHeight: size("screenHeight"),
	};
}

/**
 * Refuse a window that does not show a viewport of exactly the size asked
 * for, or that reaches past the screen, which capture cannot show.
 * @param metrics What the page reported after sizing.
 * @param viewport What was asked for.
 */
function assertViewport(metrics: WindowMetrics, viewport: Viewport): void {
	const exact = metrics.innerWidth === viewport.width && metrics.innerHeight === viewport.height;
	const onScreen =
		metrics.outerWidth <= metrics.screenWidth && metrics.outerHeight <= metrics.screenHeight;
	if (exact && onScreen) return;
	throw new HeadlessChromiumError(
		"failed",
		`Chromium sized the page to ${metrics.innerWidth}×${metrics.innerHeight} in a ` +
			`${metrics.outerWidth}×${metrics.outerHeight} window on a ` +
			`${metrics.screenWidth}×${metrics.screenHeight} screen, not a ` +
			`${viewport.width}×${viewport.height} viewport on screen; pass ` +
			"--screen-info={WIDTHxHEIGHT} large enough for the window among the extra arguments.",
	);
}

/** One started Chromium and everything it owns. */
class ChromiumSession implements HeadlessChromium {
	#stopPromise: Promise<HeadlessChromiumCleanup> | null = null;

	/**
	 * A session exists only once launch has started Chromium and connected to it.
	 * @param owned What it owns, which stop tears down.
	 * @param listening Its process, root, port and browser connection.
	 * @param cleanupTimeoutMs How long each phase of stopping may take.
	 */
	constructor(
		readonly owned: Owned,
		readonly listening: Listening,
		readonly cleanupTimeoutMs: number,
	) {}

	get pid(): number {
		return this.listening.child.pid;
	}

	get tempRoot(): string {
		return this.listening.tempRoot;
	}

	get browser(): DevTools {
		return this.listening.browser;
	}

	/**
	 * How the process ended.
	 * @returns Its exit code or signal, or null while it runs.
	 */
	exitStatus(): number | NodeJS.Signals | null {
		return this.listening.child.signalCode ?? this.listening.child.exitCode;
	}

	/**
	 * Open a blank page target.
	 * @param timeoutMs How long opening it may take.
	 * @param signal Cancels opening it.
	 * @returns The connection to the page.
	 */
	async openPage(timeoutMs: number, signal?: AbortSignal): Promise<DevTools> {
		const deadline = Date.now() + timeoutMs;
		const created = await this.browser.call(
			"Target.createTarget",
			{ url: "about:blank" },
			timeoutMs,
			signal,
		);
		return this.attach(targetIdOf(created), deadline, signal);
	}

	/**
	 * Open a window at an exact viewport and navigate it.
	 * @param url Where the page goes once it is sized.
	 * @param viewport The page's size.
	 * @param timeoutMs How long opening and sizing it may take.
	 * @returns The window's target and the connection to its page.
	 */
	async openWindow(url: string, viewport: Viewport, timeoutMs: number): Promise<HeadlessWindow> {
		const deadline = Date.now() + timeoutMs;
		const created = await this.browser.call(
			"Target.createTarget",
			{ url: "about:blank", newWindow: true },
			timeoutMs,
		);
		const targetId = targetIdOf(created);
		try {
			return { targetId, page: await this.prepareWindow(targetId, url, viewport, deadline) };
		} catch (error) {
			// A window that could not be made right is not left open; its
			// connection closes with it.
			await this.browser.call("Target.closeTarget", { targetId }).catch(() => undefined);
			throw error;
		}
	}

	/**
	 * Stop, once.
	 * @returns What the teardown proved.
	 */
	stop(): Promise<HeadlessChromiumCleanup> {
		this.#stopPromise ??= teardown(this.owned, this.cleanupTimeoutMs);
		return this.#stopPromise;
	}

	/**
	 * Connect to one page target and enable what every caller reads from it:
	 * its lifecycle, its evaluation and its complaints.
	 * @param targetId The page target.
	 * @param deadline When to give up.
	 * @param signal Cancels connecting; pending setup calls fail at once.
	 * @returns The connection.
	 */
	private async attach(
		targetId: string,
		deadline: number,
		signal?: AbortSignal,
	): Promise<DevTools> {
		const page = await DevTools.connect(
			`ws://127.0.0.1:${this.listening.port}/devtools/page/${targetId}`,
			remaining(deadline),
			signal,
		);
		this.owned.connections.add(page);
		/** Close pending setup calls immediately when opening is cancelled. */
		const cancel = (): void => {
			page.close();
		};
		signal?.addEventListener("abort", cancel, { once: true });
		try {
			signal?.throwIfAborted();
			await Promise.all(
				["Page", "Runtime", "Log"].map((domain) =>
					page.call(`${domain}.enable`, {}, remaining(deadline)),
				),
			);
			signal?.throwIfAborted();
			return page;
		} finally {
			signal?.removeEventListener("abort", cancel);
		}
	}

	/**
	 * Connect to a new window's page, size it and navigate it.
	 * @param targetId The window's page target.
	 * @param url Where the page goes once it is sized.
	 * @param viewport The page's size.
	 * @param deadline When to give up.
	 * @returns The connection to the page.
	 */
	private async prepareWindow(
		targetId: string,
		url: string,
		viewport: Viewport,
		deadline: number,
	): Promise<DevTools> {
		const page = await this.attach(targetId, deadline);
		await this.size(targetId, page, viewport, deadline);
		const navigation = await page.call("Page.navigate", { url }, remaining(deadline));
		if (typeof navigation["errorText"] === "string" && navigation["errorText"] !== "") {
			throw new HeadlessChromiumError(
				"failed",
				`Chromium could not open ${url}: ${navigation["errorText"]}`,
			);
		}
		return page;
	}

	/**
	 * Size a window so its page viewport is exactly the size asked for: the
	 * headless window draws browser chrome of its own, which is measured, not
	 * assumed, and added.
	 * @param targetId The window's page target.
	 * @param page The connection to it.
	 * @param viewport The size asked for.
	 * @param deadline When to give up.
	 */
	private async size(
		targetId: string,
		page: DevTools,
		viewport: Viewport,
		deadline: number,
	): Promise<void> {
		const before = checkedMetrics(
			await page.evaluate(WINDOW_METRICS, { timeoutMs: remaining(deadline) }),
		);
		const window = await this.browser.call(
			"Browser.getWindowForTarget",
			{ targetId },
			remaining(deadline),
		);
		const bounds = {
			width: viewport.width + before.outerWidth - before.innerWidth,
			height: viewport.height + before.outerHeight - before.innerHeight,
		};
		await this.browser.call(
			"Browser.setWindowBounds",
			{ windowId: window["windowId"], bounds },
			remaining(deadline),
		);
		assertViewport(
			checkedMetrics(await page.evaluate(WINDOW_METRICS, { timeoutMs: remaining(deadline) })),
			viewport,
		);
	}
}

/**
 * What is left of a deadline, never less than a millisecond.
 * @param deadline The deadline, as a timestamp.
 * @returns The milliseconds left.
 */
function remaining(deadline: number): number {
	return Math.max(1, deadline - Date.now());
}

/**
 * What a start that failed part way throws, after its own teardown.
 * @param owned What the start acquired.
 * @param options What the caller settled.
 * @param error What failed.
 * @returns The failure to throw.
 */
async function startupFailure(
	owned: Owned,
	options: HeadlessChromiumOptions,
	error: unknown,
): Promise<HeadlessChromiumError> {
	const cleanup = await teardown(owned, options.cleanupTimeoutMs);
	const tail = owned.outputTail.trim();
	return new HeadlessChromiumError(
		"unavailable",
		`Chromium could not start: ${messageOf(error)}` +
			(tail === "" ? "" : `\n${tail}`) +
			(cleanup.clean ? "" : `\nIts cleanup also failed: ${cleanup.errors.join("; ")}`),
		{ cause: error, cleanup },
	);
}

/**
 * Start a private headless Chromium and connect to its browser target. A
 * start that fails part way tears down whatever it acquired and throws an
 * `unavailable` failure carrying what that teardown proved.
 * @param options What the caller settles.
 * @returns The started Chromium.
 */
async function launchHeadlessChromium(options: HeadlessChromiumOptions): Promise<HeadlessChromium> {
	const { signal } = options;
	const owned: Owned = {
		tempRoot: null,
		child: null,
		group: null,
		outputTail: "",
		connections: new Set(),
	};
	try {
		signal?.throwIfAborted();
		const deadline = Date.now() + options.startupTimeoutMs;
		const spawned = spawnInto(owned, options);
		const port = await listeningPort(spawned, deadline, signal);
		const socketUrl = await browserSocketUrl(port, remaining(deadline), signal);
		const browser = await DevTools.connect(socketUrl, remaining(deadline), signal);
		owned.connections.add(browser);
		signal?.throwIfAborted();
		return new ChromiumSession(owned, { ...spawned, port, browser }, options.cleanupTimeoutMs);
	} catch (error) {
		throw await startupFailure(owned, options, error);
	}
}

export {
	launchHeadlessChromium,
	type HeadlessChromium,
	type HeadlessChromiumOptions,
	type HeadlessWindow,
	type Viewport,
};
