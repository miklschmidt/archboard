import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	HeadlessChromiumError,
	discoveredChromiumPath,
	launchHeadlessChromium,
	type DevTools,
	type HeadlessChromium,
} from "@/runtime/headless-chromium/index";
import {
	HEADLESS_CHROMIUM_CALL_MS,
	SEMANTIC_RASTER_CLEANUP_MS,
	SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
} from "@/shared/timing/timing";

// The module is held to what its callers build on: flags of their own reach
// Chromium, a window's page is exactly the size asked for, events reach
// whoever listens without piling up, a page Blob streams out to a file, and
// a stopped Chromium is provably gone. Like the rasterizer's owner, it needs
// a Chromium-family executable (ARCHBOARD_RENDERER_CHROMIUM names one).

const CHROMIUM_PATH = discoveredChromiumPath();

/**
 * Bun's deadline for the hook that cold-starts the shared Chromium and for each
 * case. A hosted Linux runner's cold start took past ten seconds in 2 of 5 gate
 * runs (TASK-470) and the product allows a start thirty; this is that start
 * plus fifteen seconds of work. It is a ceiling that a passing run never reaches.
 * A module's tests may not import another owner's budgets, so the literal is
 * here, and it is not computed from the product bound (TASK-154).
 */
const COLD_START_CASE_MS = 45_000;
setDefaultTimeout(COLD_START_CASE_MS);

/**
 * Start a private Chromium for one test file.
 * @param extraArgs Flags of the caller's own.
 * @returns The started Chromium.
 */
function launch(extraArgs: readonly string[] = []): Promise<HeadlessChromium> {
	return launchHeadlessChromium({
		chromiumPath: CHROMIUM_PATH,
		extraArgs,
		startupTimeoutMs: SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
		cleanupTimeoutMs: SEMANTIC_RASTER_CLEANUP_MS,
	});
}

/**
 * Whether a process is still there.
 * @param pid The process.
 * @returns Whether a signal reaches it.
 */
function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

let chromium: HeadlessChromium;
let page: DevTools;

beforeAll(async () => {
	chromium = await launch(["--screen-info={2560x1600}"]);
	page = await chromium.openPage(HEADLESS_CHROMIUM_CALL_MS);
});

afterAll(async () => {
	await chromium.stop();
});

describe("a window", () => {
	test("shows exactly the viewport asked for, on a screen the caller's flags sized", async () => {
		const { targetId, page: windowPage } = await chromium.openWindow(
			"data:text/html,<title>sized</title>",
			{ width: 1920, height: 1080 },
			HEADLESS_CHROMIUM_CALL_MS,
		);
		expect(targetId).not.toBe("");
		expect(await windowPage.evaluate("[innerWidth, innerHeight]")).toEqual([1920, 1080]);
		// A window the screen cannot hold is refused rather than captured cut off.
		const oversize = chromium.openWindow(
			"about:blank",
			{ width: 3000, height: 1000 },
			HEADLESS_CHROMIUM_CALL_MS,
		);
		await expect(oversize).rejects.toBeInstanceOf(HeadlessChromiumError);
		await expect(oversize).rejects.toMatchObject({ code: "failed" });
	});
});

describe("a page", () => {
	test("opening it ends at its caller's cancellation, while Chromium does not answer", async () => {
		const controller = new AbortController();
		const reason = new Error("interrupted");
		// A frozen Chromium answers nothing, as a wedged or cold one may not.
		process.kill(-chromium.pid, "SIGSTOP");
		try {
			const opening = chromium.openPage(HEADLESS_CHROMIUM_CALL_MS, controller.signal);
			controller.abort(reason);
			// It settles on the cancellation, not on the page's own deadline.
			await expect(opening).rejects.toBe(reason);
		} finally {
			process.kill(-chromium.pid, "SIGCONT");
		}
	});
});

describe("events", () => {
	test("reach a listener until it unsubscribes", async () => {
		const heard: unknown[] = [];
		const unsubscribe = page.on("Runtime.consoleAPICalled", (params) => {
			heard.push(params["type"]);
		});
		await page.evaluate("console.info('one')");
		unsubscribe();
		await page.evaluate("console.warn('two')");
		// A round trip after the last event has been dispatched, so a late one would show.
		await page.evaluate("1");
		expect(heard).toEqual(["info"]);
	});

	test("are kept only as a bounded tail of what the page complained about", async () => {
		await page.evaluate("for (let i = 0; i < 200; i++) console.log('line ' + i)");
		await page.evaluate("1");
		const kept = page.diagnostics();
		expect(kept.length).toBeGreaterThan(0);
		expect(kept.length).toBeLessThan(200);
		// The newest complaint is the one kept last.
		expect(JSON.stringify(kept.at(-1))).toContain("line 199");
	});
});

describe("a page Blob", () => {
	test("streams to a file byte for byte, however many reads it takes, over a longer file", async () => {
		// Larger than one read, and not a multiple of it.
		const size = 3 * 1024 * 1024 + 17;
		const blob = await page.evaluate(
			`new Blob([new Uint8Array(${size}).map((_, i) => (i * 31) % 251)])`,
			{ returnByValue: false },
		);
		const objectId = (blob as { objectId?: unknown }).objectId;
		expect(typeof objectId).toBe("string");
		const directory = mkdtempSync(join(tmpdir(), "archboard-blob-"));
		try {
			const file = join(directory, "blob.bin");
			// A file left longer than the Blob, as a crashed earlier run could leave, keeps no tail.
			writeFileSync(file, new Uint8Array(size + 4096));
			const read = await page.readBlobTo(objectId as string, file, HEADLESS_CHROMIUM_CALL_MS);
			expect(read.bytes).toBe(size);
			const expected = Uint8Array.from({ length: size }, (_, i) => (i * 31) % 251);
			expect(Buffer.from(readFileSync(file)).equals(Buffer.from(expected))).toBe(true);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});

describe("ownership", () => {
	test("a stopped Chromium's group and temporary root are provably gone", async () => {
		const owned = await launch();
		const { pid, tempRoot } = owned;
		expect(existsSync(tempRoot)).toBe(true);
		const cleanup = await owned.stop();
		expect(cleanup).toMatchObject({ clean: true, pid, processGone: true, tempRootRemoved: true });
		expect(processExists(pid)).toBe(false);
		expect(existsSync(tempRoot)).toBe(false);
		await expect(owned.browser.call("Browser.getVersion")).rejects.toMatchObject({
			code: "failed",
		});
	});

	test("no executable is unavailable, with nothing left to clean", async () => {
		const refused = launchHeadlessChromium({
			chromiumPath: "",
			startupTimeoutMs: SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
			cleanupTimeoutMs: SEMANTIC_RASTER_CLEANUP_MS,
		});
		await expect(refused).rejects.toMatchObject({
			code: "unavailable",
			cleanup: { clean: true, pid: null },
		});
	});
});
