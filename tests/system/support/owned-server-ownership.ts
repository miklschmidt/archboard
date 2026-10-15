import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { TEST_SERVER_CHILD_EXIT_TIMEOUT_MS, TEST_SERVER_HEALTH_POLL_MS } from "./timing.ts";

interface OwnedServerPaths {
	readonly root: string;
	readonly home: string;
	readonly xdgConfig: string;
	readonly xdgState: string;
	readonly temporary: string;
}

type OwnedServerEnvironment = Readonly<Record<string, string | undefined>>;
type OwnedServerEnvironmentPaths = Pick<
	OwnedServerPaths,
	"home" | "xdgConfig" | "xdgState" | "temporary"
>;

function buildOwnedServerEnvironment(options: {
	paths: OwnedServerEnvironmentPaths;
	port: number;
	/** The registry the server lists repositories from, which no other server shares. */
	registry: string;
	env?: OwnedServerEnvironment;
}): OwnedServerEnvironment {
	const toolEnvironment: OwnedServerEnvironment = {
		PATH: process.env["PATH"],
		ARCHBOARD_RENDERER_CHROMIUM: process.env["ARCHBOARD_RENDERER_CHROMIUM"],
	};
	return {
		...toolEnvironment,
		...options.env,
		HOME: options.paths.home,
		XDG_CONFIG_HOME: options.paths.xdgConfig,
		XDG_STATE_HOME: options.paths.xdgState,
		TMPDIR: options.paths.temporary,
		PORT: String(options.port),
		HOST: "127.0.0.1",
		ARCHBOARD_REPOS: options.registry,
		LOG_LEVEL: "error",
	};
}

// macOS exposes the temporary directory through a /var symlink. Keep the
// owner namespace canonical so storage-root containment sees the same path
// spelling as the filesystem.
const ownedServerNamespaceParent = fs.realpathSync(os.tmpdir());
const ownedServerNamespacePrefix = "archboard-owned-server-";
const ownedServerNamespacePattern = /^archboard-owned-server-[A-Za-z0-9]{6}$/;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function createOwnedServerPaths(): OwnedServerPaths {
	const root = fs.realpathSync(
		fs.mkdtempSync(path.join(ownedServerNamespaceParent, ownedServerNamespacePrefix)),
	);
	const paths = {
		root,
		home: path.join(root, "home"),
		xdgConfig: path.join(root, "xdg-config"),
		xdgState: path.join(root, "xdg-state"),
		temporary: path.join(root, "tmp"),
	};
	try {
		for (const directory of [paths.home, paths.xdgConfig, paths.xdgState, paths.temporary]) {
			fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
		}
		return paths;
	} catch (error) {
		fs.rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

function isOwnedServerNamespaceRoot(candidate: string): boolean {
	const resolved = path.resolve(candidate);
	return (
		path.dirname(resolved) === path.resolve(ownedServerNamespaceParent) &&
		ownedServerNamespacePattern.test(path.basename(resolved))
	);
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const failure = error as NodeJS.ErrnoException;
		if (failure.code === "ESRCH") {
			return false;
		}
		throw new Error(
			`Process ${pid} observation failed (${failure.code ?? "unknown"}): ${failure.message}`,
			{ cause: error },
		);
	}
}

async function waitForProcessExit(
	pid: number,
	timeoutMs = TEST_SERVER_CHILD_EXIT_TIMEOUT_MS,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	// Signal zero only observes; PID reuse may prolong this audit but never authorizes cleanup.
	while (processExists(pid)) {
		if (Date.now() >= deadline) {
			throw new Error(
				`Process ${pid} remained observable after ${timeoutMs.toLocaleString("en-US")}ms; it may be live, zombie, or recycled.`,
			);
		}
		await sleep(TEST_SERVER_HEALTH_POLL_MS);
	}
}

export {
	type OwnedServerPaths,
	type OwnedServerEnvironment,
	type OwnedServerEnvironmentPaths,
	buildOwnedServerEnvironment,
	createOwnedServerPaths,
	isOwnedServerNamespaceRoot,
	processExists,
	waitForProcessExit,
};
