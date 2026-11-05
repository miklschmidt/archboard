// Which port the server of a checkout listens on, and when a command hands
// itself to the source of another checkout (ADR 0049). Which installation this
// process runs is decided by `installation.ts`.
//
// A server runs the source of the checkout that started it (ADR 0021). A
// worktree of archboard that changes server source therefore needs a server of
// its own, on a port that is not the owner's daily server. The main checkout
// keeps port 3000. A linked worktree takes a port from its root path, which
// stays the same for the life of the worktree while the branch in it changes.
//
// `archboard` on PATH is a link to one checkout's `bin/archboard`. In another
// archboard checkout it runs that checkout's own `bin/archboard` instead, so a
// command in a worktree runs the worktree's source and reaches the worktree's
// server. A command whose environment sets `ARCHBOARD_URL` hands off to no
// checkout: the URL already names its server, and the source that matters is
// the one that server runs. The Codex workbench sets it on every thread, whose
// `archboard` is the server's own (ADR 0050), so a workhorse in an archboard
// worktree still reaches the server that started it.

import { spawn, type ChildProcess } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import {
	CHECKOUT_BIN,
	installation,
	isArchboardCheckout,
	type Installation,
} from "#runtime/services/installation.ts";

/** The port of the main checkout, which the owner's daily server keeps. */
const MAIN_CHECKOUT_PORT = 3000;

/** The ports a linked worktree takes: 10000 to 19999, as worktrunk's `hash_port`. */
const WORKTREE_PORT_BASE = 10000;
const WORKTREE_PORT_COUNT = 10000;

/**
 * The port a linked worktree's server listens on: a hash of its root path into
 * 10000 to 19999. SHA-256 because it is the same on every machine and every
 * runtime version. worktrunk's own hash is not reproduced: it hashes a branch.
 * @param root The worktree's root, as its real path.
 * @returns The port.
 */
function worktreePort(root: string): number {
	const digest = createHash("sha256").update(root).digest();
	return WORKTREE_PORT_BASE + (digest.readUInt32BE(0) % WORKTREE_PORT_COUNT);
}

/**
 * The port the server of a checkout listens on. A linked worktree has a `.git`
 * file that points at the main checkout's repository; the main checkout has a
 * `.git` directory, and so does anything that is not a worktree.
 * @param root The checkout root, as its real path.
 * @returns 3000 for the main checkout, else the worktree's own port.
 */
function checkoutPort(root: string): number {
	const linked = fs.statSync(path.join(root, ".git"), { throwIfNoEntry: false })?.isFile() ?? false;
	return linked ? worktreePort(root) : MAIN_CHECKOUT_PORT;
}

/**
 * The port of a release server (ADR 0075). It spells ARCHB on a phone keypad. It is outside the
 * worktree range and is not the main checkout's port, so a release and a checkout run side by side.
 */
const RELEASE_PORT = 27242;

/**
 * The name a browser opens a release server at. Chrome and Firefox resolve every `*.localhost`
 * name to the loopback address themselves (RFC 6761), but the system resolver does not on every
 * Linux, so the CLI connects to `127.0.0.1` and only a person's browser uses this name.
 */
const BROWSER_HOST = "archboard.localhost";

const LOOPBACK_URL_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The port the server of an installation listens on when nothing names another.
 * @param running The installation: a release takes `RELEASE_PORT`, a checkout its own port.
 * @returns The port.
 */
function installationPort(running: Pick<Installation, "mode" | "root">): number {
	return running.mode === "release" ? RELEASE_PORT : checkoutPort(running.root);
}

/** The server this installation's commands reach when no `ARCHBOARD_URL` or `--url` names one. */
const DEFAULT_ARCHBOARD_URL = `http://127.0.0.1:${String(installationPort(installation()))}`;

/**
 * The address a person or a browser uses for a server URL. A release server at a loopback
 * address is opened at `archboard.localhost`; every other URL is its own address.
 * @param url The URL the CLI connects to.
 * @param mode Whether this process runs a release or a checkout.
 * @returns The URL to show or to open.
 */
function browserUrl(url: string, mode: Installation["mode"] = installation().mode): string {
	if (mode !== "release") {
		return url;
	}
	try {
		const parsed = new URL(url);
		if (parsed.port !== String(RELEASE_PORT) || !LOOPBACK_URL_HOSTS.has(parsed.hostname)) {
			return url;
		}
		parsed.hostname = BROWSER_HOST;
		return parsed.origin;
	} catch {
		return url;
	}
}

/**
 * The root of the checkout a directory stands in: the nearest directory at or
 * above it that holds `.git`. A checkout nested in another is its own.
 * @param directory Where to start.
 * @returns The root, or null outside any checkout.
 */
function checkoutRootOf(directory: string): string | null {
	for (let current = path.resolve(directory); ; current = path.dirname(current)) {
		if (fs.existsSync(path.join(current, ".git"))) {
			return current;
		}
		if (path.dirname(current) === current) {
			return null;
		}
	}
}

/**
 * The `bin/archboard` a command must run instead of this process's source: the
 * one of the archboard checkout that the working directory stands in, when
 * that checkout is not the running source and no `ARCHBOARD_URL` names the
 * server.
 *
 * The target must resolve inside its own checkout. Its `bin/archboard` runs the
 * source beside its real path, so the command it starts runs exactly that
 * checkout, finds itself the running source and hands off no further. A
 * `bin/archboard` that links to a third checkout gets no hand-off, because it
 * would hand off again.
 * @param cwd The working directory.
 * @param running The real path of the checkout this process runs.
 * @param serverUrl The `ARCHBOARD_URL` of the environment, or undefined when it is unset.
 * @returns The entry point to run, or null to run this process's source.
 */
function handOffTarget(cwd: string, running: string, serverUrl: string | undefined): string | null {
	if (serverUrl !== undefined && serverUrl !== "") {
		return null;
	}
	const root = archboardCheckoutOf(cwd);
	if (root === null) {
		return null;
	}
	const target = path.join(root, CHECKOUT_BIN);
	return root === running || fs.realpathSync(target) !== target ? null : target;
}

/**
 * The real path of the archboard checkout a directory stands in.
 * @param cwd The directory.
 * @returns The checkout's real path, or null when it stands in none or in another repository.
 */
function archboardCheckoutOf(cwd: string): string | null {
	const found = checkoutRootOf(cwd);
	return found !== null && isArchboardCheckout(found) ? fs.realpathSync(found) : null;
}

/** The signals that end a command, which the command that runs instead must get too. */
const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/**
 * Run the command with the source of the archboard checkout the working
 * directory stands in, when that is not this process's source. The arguments,
 * the environment and the terminal are passed on as they are, and so is a
 * signal that this process gets.
 * @param argv The arguments after the executable name.
 * @returns The exit status of the command that ran instead, or null when this
 * process runs the command itself.
 */
async function handOff(argv: readonly string[]): Promise<number | null> {
	let cwd: string;
	try {
		cwd = process.cwd();
	} catch {
		// A working directory that was deleted stands in no checkout.
		return null;
	}
	const target = handOffTarget(cwd, installation().root, process.env["ARCHBOARD_URL"]);
	if (target === null) {
		return null;
	}
	// Every checkout installs its own packages (TESTING.md). Bun would otherwise
	// fail on the first import, with a message that names no checkout.
	const root = path.dirname(path.dirname(target));
	if (!fs.existsSync(path.join(root, "node_modules"))) {
		process.stderr.write(
			`Error: archboard runs the source of ${root}, the archboard checkout you are in, ` +
				`and that checkout has no node_modules. Run \`bun install\` in ${root}, then run the command again.\n`,
		);
		return 1;
	}
	return runInstead(target, argv);
}

/**
 * Run another checkout's `bin/archboard` as this command. A signal that this
 * process gets meanwhile goes to it, so that it can clean up as it would if it
 * had been started directly, and how it ends is how this process ends.
 * @param target The `bin/archboard` to run.
 * @param argv The arguments after the executable name.
 * @returns Its exit status.
 */
async function runInstead(target: string, argv: readonly string[]): Promise<number> {
	let running: ChildProcess | undefined;
	/**
	 * Pass a signal on to the command that runs instead.
	 * @param signal The signal this process got.
	 */
	const forward = (signal: NodeJS.Signals): void => {
		running?.kill(signal);
	};
	// Before the spawn: a signal in between would end this process and leave the command running.
	for (const signal of FORWARDED_SIGNALS) {
		process.on(signal, forward);
	}
	const child = spawn(target, argv, { stdio: "inherit" });
	running = child;
	const ended = await new Promise<Error | { code: number | null; signal: NodeJS.Signals | null }>(
		(resolve) => {
			child.once("error", resolve);
			child.once("exit", (code, signal) => {
				resolve({ code, signal });
			});
		},
	);
	for (const signal of FORWARDED_SIGNALS) {
		process.off(signal, forward);
	}
	if (ended instanceof Error) {
		process.stderr.write(`Error: ${target} could not run: ${ended.message}\n`);
		return 1;
	}
	if (ended.signal !== null) {
		process.kill(process.pid, ended.signal);
	}
	return ended.code ?? 1;
}

export {
	browserUrl,
	checkoutPort,
	DEFAULT_ARCHBOARD_URL,
	handOff,
	handOffTarget,
	installationPort,
	RELEASE_PORT,
	worktreePort,
};
