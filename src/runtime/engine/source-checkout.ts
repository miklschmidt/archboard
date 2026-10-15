// Which archboard checkout this process runs, which port its server listens
// on, and when a command hands itself to the source of another checkout
// (ADR 0049).
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
// server.

import { spawn } from "child_process";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** The port of the main checkout, which the owner's daily server keeps. */
const MAIN_CHECKOUT_PORT = 3000;

/** The ports a linked worktree takes: 10000 to 19999, as worktrunk's `hash_port`. */
const WORKTREE_PORT_BASE = 10000;
const WORKTREE_PORT_COUNT = 10000;

/** The CLI's entry point, relative to a checkout root. */
const CHECKOUT_BIN = path.join("bin", "archboard");

/**
 * The real path of the archboard checkout whose source this process runs.
 * This file is `src/runtime/engine/source-checkout.ts` in it.
 */
const SOURCE_CHECKOUT = fs.realpathSync(fileURLToPath(new URL("../../..", import.meta.url)));

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

/** The server this checkout's commands reach when no `ARCHBOARD_URL` or `--url` names one. */
const DEFAULT_ARCHBOARD_URL = `http://127.0.0.1:${String(checkoutPort(SOURCE_CHECKOUT))}`;

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
 * Whether a checkout is archboard: its package is named `archboard` and it has
 * the CLI's entry point.
 * @param root The checkout root.
 * @returns True for an archboard checkout.
 */
function isArchboardCheckout(root: string): boolean {
	try {
		const manifest: unknown = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
		return (
			typeof manifest === "object" &&
			manifest !== null &&
			Reflect.get(manifest, "name") === "archboard" &&
			fs.existsSync(path.join(root, CHECKOUT_BIN))
		);
	} catch {
		return false;
	}
}

/**
 * The `bin/archboard` a command must run instead of this process's source: the
 * one of the archboard checkout that the working directory stands in, when
 * that checkout is not the running source.
 *
 * The target must resolve inside its own checkout. Its `bin/archboard` runs the
 * source beside its real path, so the command it starts runs exactly that
 * checkout, finds itself the running source and hands off no further. A
 * `bin/archboard` that links to a third checkout gets no hand-off, because it
 * would hand off again.
 * @param cwd The working directory.
 * @param running The real path of the checkout this process runs.
 * @returns The entry point to run, or null to run this process's source.
 */
function handOffTarget(cwd: string, running: string): string | null {
	const found = checkoutRootOf(cwd);
	if (found === null || !isArchboardCheckout(found)) {
		return null;
	}
	const root = fs.realpathSync(found);
	const target = path.join(root, CHECKOUT_BIN);
	if (root === running || fs.realpathSync(target) !== target) {
		return null;
	}
	return target;
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
	const target = handOffTarget(cwd, SOURCE_CHECKOUT);
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
	const child = spawn(target, argv, { stdio: "inherit" });
	/**
	 * Pass a signal on to the command that runs instead.
	 * @param signal The signal this process got.
	 */
	const forward = (signal: NodeJS.Signals): void => {
		child.kill(signal);
	};
	for (const signal of FORWARDED_SIGNALS) {
		process.on(signal, forward);
	}
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
	checkoutPort,
	DEFAULT_ARCHBOARD_URL,
	handOff,
	handOffTarget,
	SOURCE_CHECKOUT,
	worktreePort,
};
