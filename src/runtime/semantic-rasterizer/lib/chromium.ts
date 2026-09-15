// Chromium as a process: which executable draws the bitmap, how it is
// started in a private profile and its own group, how its DevTools endpoint
// is found, and how the whole group is made to go away.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";

import {
	createCodexProcessGroupOperations,
	type CodexProcessGroupIdentity,
} from "@/runtime/codex-process/process-group";
import { PROCESS_GROUP_OBSERVATION_POLL_MS } from "@/shared/timing/timing";

import { isJsonRecord } from "@/runtime/semantic-rasterizer/lib/devtools";

/** The process a session leads. */
type ChromiumProcess = Bun.Subprocess<"ignore", "pipe", "pipe">;

const processGroups = createCodexProcessGroupOperations();

/**
 * The first Chromium-family executable installed in a supported conventional
 * location. macOS application bundles do not normally put their executable on
 * PATH, so their native locations count too.
 * @returns The discovered executable, or an empty string when none exists.
 */
function discoveredChromiumPath(): string {
	const candidates = [
		Bun.which("chromium"),
		Bun.which("chromium-browser"),
		Bun.which("google-chrome"),
		Bun.which("google-chrome-stable"),
		...(process.platform === "darwin"
			? [
					"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
					"/Applications/Chromium.app/Contents/MacOS/Chromium",
				]
			: []),
	];
	return (
		candidates.find((candidate): candidate is string =>
			Boolean(candidate && existsSync(candidate)),
		) ?? ""
	);
}

/**
 * Where the session keeps its profile and document. Chromium adds two long
 * singleton-directory segments below TMPDIR; the root stays short enough for
 * the Unix-socket path limit.
 * @returns The parent directory.
 */
function tempParent(): string {
	if (process.platform === "darwin") return "/private/tmp";
	if (process.platform === "linux") return "/tmp";
	return tmpdir();
}

/**
 * The native environment for Chromium. Darwin Chromium and CoreFoundation
 * require the passwd-backed account home even when archboard itself was
 * launched with an isolated HOME. Everything it writes stays under the root.
 * @param tempRoot The session-owned temporary directory.
 * @returns The environment.
 */
function chromiumEnvironment(tempRoot: string): Record<string, string | undefined> {
	return {
		...process.env,
		...(process.platform === "darwin" ? { HOME: userInfo().homedir } : {}),
		TMPDIR: tempRoot,
	};
}

/**
 * Initialize the disposable profile with Chromium's automation preference for
 * suppressing its default-browser prompt, independently of the flag.
 * @param profile The session-owned user data directory.
 */
function prepareProfile(profile: string): void {
	const defaultProfile = join(profile, "Default");
	mkdirSync(defaultProfile, { recursive: true, mode: 0o700 });
	writeFileSync(
		join(defaultProfile, "Preferences"),
		`${JSON.stringify({ browser: { check_default_browser: false } })}\n`,
		{ mode: 0o600 },
	);
}

/**
 * The command line Chromium is started with: headless, without GPU, crash
 * reporting, extensions, scrollbars or any device scale of its own, on a
 * private profile, listening for DevTools on a port it picks.
 * @param chromiumPath The executable.
 * @param profile The private user data directory.
 * @returns The command line.
 */
function chromiumCommand(chromiumPath: string, profile: string): string[] {
	return [
		chromiumPath,
		"--headless=new",
		"--disable-gpu",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-crash-reporter",
		"--disable-extensions",
		"--hide-scrollbars",
		"--force-device-scale-factor=1",
		"--force-color-profile=srgb",
		...(process.platform === "darwin" ? ["--use-mock-keychain", "--password-store=basic"] : []),
		`--user-data-dir=${profile}`,
		"--remote-debugging-port=0",
		"about:blank",
	];
}

/**
 * Start Chromium in its own process group under the temporary root.
 * @param chromiumPath The executable.
 * @param tempRoot The session-owned temporary directory.
 * @returns The process.
 */
function spawnChromium(chromiumPath: string, tempRoot: string): ChromiumProcess {
	const profile = join(tempRoot, "profile");
	prepareProfile(profile);
	return Bun.spawn(chromiumCommand(chromiumPath, profile), {
		cwd: tempRoot,
		env: chromiumEnvironment(tempRoot),
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
		// Its own group, so a stop reaches every helper it forked.
		detached: true,
	});
}

/**
 * Ask a question every few milliseconds until it has an answer or the
 * deadline passes.
 * @param probe The question; null means not yet.
 * @param deadline When to give up, as a timestamp.
 * @param failure What to say when giving up.
 * @returns The first non-null answer.
 */
function pollUntil<T>(
	probe: () => Promise<T | null>,
	deadline: number,
	failure: string,
): Promise<T> {
	return new Promise<T>((resolvePoll, rejectPoll) => {
		/** Ask once, and either answer, give up or ask again later. */
		const tick = async (): Promise<void> => {
			try {
				const answer = await probe();
				if (answer !== null) {
					resolvePoll(answer);
				} else if (Date.now() > deadline) {
					rejectPoll(new Error(failure));
				} else {
					setTimeout(() => void tick(), PROCESS_GROUP_OBSERVATION_POLL_MS);
				}
			} catch (error) {
				rejectPoll(error);
			}
		};
		void tick();
	});
}

/**
 * The port Chromium wrote to its profile once it listened, or null before.
 * @param tempRoot The session-owned temporary directory.
 * @returns The port, or null.
 */
function devToolsPortIn(tempRoot: string): number | null {
	const portFile = join(tempRoot, "profile", "DevToolsActivePort");
	if (!existsSync(portFile)) return null;
	const [line] = readFileSync(portFile, "utf8").split("\n");
	const parsed = Number.parseInt(line ?? "", 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Open a fresh blank page target on a listening Chromium and answer its
 * DevTools socket URL.
 * @param port The DevTools port.
 * @param timeoutMs How long to wait.
 * @param signal Cancels startup.
 * @returns The socket URL.
 */
async function openPageTarget(
	port: number,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<string> {
	const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
		method: "PUT",
		signal:
			signal === undefined
				? AbortSignal.timeout(timeoutMs)
				: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
	});
	const description: unknown = await target.json();
	if (!isJsonRecord(description) || typeof description["webSocketDebuggerUrl"] !== "string") {
		throw new Error("Chromium did not describe a page target.");
	}
	return description["webSocketDebuggerUrl"];
}

/**
 * Wait for the leader and every runnable helper to exit within a deadline.
 * @param child The group leader.
 * @param group The recorded process group identity.
 * @param timeoutMs How long to wait.
 * @returns Whether the whole group is gone.
 */
async function groupExitsWithin(
	child: ChromiumProcess,
	group: CodexProcessGroupIdentity,
	timeoutMs: number,
): Promise<boolean> {
	try {
		await pollUntil(
			() =>
				Promise.resolve(
					(child.exitCode !== null || child.signalCode !== null) &&
						processGroups.inspect(group) === "quiescent"
						? true
						: null,
				),
			Date.now() + timeoutMs,
			"Chromium's process group did not exit.",
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * Stop the whole process group and prove no runnable helper remains.
 * @param child The leader.
 * @param group The recorded process group identity.
 * @param timeoutMs How long each signal may take.
 * @returns Whether the group exited.
 */
async function stopProcessGroup(
	child: ChromiumProcess,
	group: CodexProcessGroupIdentity,
	timeoutMs: number,
): Promise<boolean> {
	processGroups.signal(group, "SIGTERM");
	if (await groupExitsWithin(child, group, timeoutMs)) return true;
	processGroups.signal(group, "SIGKILL");
	return groupExitsWithin(child, group, timeoutMs);
}

/**
 * Remove the session's temporary root and say whether it is gone.
 * @param tempRoot The root.
 * @param errors Where to record what went wrong.
 * @returns Whether it is gone.
 */
function removeTempRoot(tempRoot: string, errors: string[]): boolean {
	try {
		rmSync(tempRoot, { recursive: true, force: true });
	} catch (error) {
		errors.push(`temporary root: ${error instanceof Error ? error.message : String(error)}`);
	}
	const removed = !existsSync(tempRoot);
	if (!removed) errors.push(`temporary root ${tempRoot} still exists`);
	return removed;
}

export {
	processGroups,
	devToolsPortIn,
	discoveredChromiumPath,
	openPageTarget,
	pollUntil,
	removeTempRoot,
	spawnChromium,
	stopProcessGroup,
	tempParent,
	type ChromiumProcess,
};
