// One Archboard server for one take, over a fresh copy of a tracked vault or over the checkout's
// own vault.
//
// A copy holds the vault's tracked files and nothing else, so a take shows what the checkout
// holds and its writes never reach the repository. The copy is the `.archboard/vault` of a
// directory of its own, which the take's commands run in. The checkout's own vault is served in
// place for a picture that its board lists as a tracked embed: the picture's recipe then names
// this repository, so `archboard check` here finds its board, and the write that tracks it lands
// in the vault. Either way a registry of the take's own lists the directory, so the machine's
// registry never sees a take. The server listens on a free port. A take that
// needs no Codex gets a state directory of its own in the scratch directory (on Linux, through
// XDG_STATE_HOME), so it starts without a Codex sign-in and leaves the machine's state alone. A
// take that needs Codex uses the machine's state directory and its Archboard Codex sign-in, which
// every Archboard server on the machine shares.

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { parseSemanticBoard, type SemanticBoard } from "@archboard/board/document";

// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
import { ROOT, attempt, run, scratch, type Ran } from "./tools.ts";

/** The tracked vaults a take can be filmed over. */
type TrackedVault = "examples/web-shop" | ".archboard/vault";

/** A tracked example to copy, or a prepared synthetic repository to serve. */
type TakeSource = TrackedVault | { readonly directory: string };

/** A running take server. */
interface TakeServer {
	readonly url: string;
	/**
	 * Run the CLI against the server and read its JSON answer.
	 * @param args The CLI's arguments.
	 * @returns The answer.
	 */
	readonly cli: (args: readonly string[]) => Promise<unknown>;
	/**
	 * Run the CLI against the server, and keep its exit status rather than refusing a failure.
	 * @param args The CLI's arguments.
	 * @returns What it printed and its exit status.
	 */
	readonly attempt: (args: readonly string[]) => Promise<Ran>;
	/** Stop the server. */
	readonly stop: () => Promise<void>;
}

/**
 * A port nothing listens on now.
 * @returns The port.
 */
function freePort(): number {
	const listener = Bun.listen({
		hostname: "127.0.0.1",
		port: 0,
		socket: {
			/** A probe socket reads nothing. */
			data() {
				// Nothing connects to the probe.
			},
		},
	});
	const { port } = listener;
	listener.stop(true);
	return port;
}

/**
 * Copy a tracked vault's tracked files into a directory.
 * @param vault The tracked vault.
 * @param into The directory.
 */
async function copyTracked(vault: TrackedVault, into: string): Promise<void> {
	const { stdout } = await run(["git", "ls-files", "-z", "--", vault]);
	rmSync(into, { recursive: true, force: true });
	for (const path of stdout.split("\0").filter((entry) => entry !== "")) {
		const target = join(into, relative(vault, path));
		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(join(ROOT, path), target);
	}
}

/**
 * Start a server for a take, over a fresh copy of a tracked vault.
 * @param name The take, which names its directory in the scratch directory.
 * @param vault The tracked vault it is filmed over.
 * @param codex Whether the take needs the machine's Codex sign-in.
 * @returns The running server.
 */
async function startServer(name: string, vault: TakeSource, codex: boolean): Promise<TakeServer> {
	const home = scratch("takes", name);
	const holder = typeof vault === "string" ? join(home, "repository") : vault.directory;
	if (typeof vault === "string") await copyTracked(vault, join(holder, ".archboard", "vault"));
	return launch(home, holder, codex);
}

/**
 * Start a server for a take over this checkout's own vault, in place. Its commands run in the
 * checkout, so what they write reaches the repository.
 * @param name The take, which names its directory in the scratch directory.
 * @returns The running server.
 */
async function startCheckoutServer(name: string): Promise<TakeServer> {
	return launch(scratch("takes", name), ROOT, false);
}

/**
 * Start a server for a take whose commands run in the directory that holds its vault.
 * @param home The take's directory in the scratch directory.
 * @param holder The directory that holds the vault.
 * @param codex Whether the take needs the machine's Codex sign-in.
 * @returns The running server.
 */
async function launch(home: string, holder: string, codex: boolean): Promise<TakeServer> {
	const url = `http://127.0.0.1:${freePort()}`;
	const env: Record<string, string> = {
		ARCHBOARD_URL: url,
		ARCHBOARD_REPOS: join(home, "repos.json"),
		ARCHBOARD_NO_AUTOSTART: "1",
		...(codex ? {} : { XDG_STATE_HOME: join(home, "state") }),
	};
	const cli = join(ROOT, "bin/archboard");
	await run([cli, "repo", "add", holder], { env });
	await run([cli, "start"], { env });
	return {
		url,

		/**
		 * Run the CLI against the server and read its JSON answer.
		 * @param args The CLI's arguments.
		 * @returns The answer.
		 */
		cli: async (args) =>
			JSON.parse((await run([cli, ...args], { env, cwd: holder })).stdout) as unknown,
		/**
		 * Run the CLI against the server, keeping its exit status.
		 * @param args The CLI's arguments.
		 * @returns What it printed and its exit status.
		 */
		attempt: async (args) => attempt([cli, ...args], { env, cwd: holder }),
		/** Stop the server. */
		stop: async () => {
			await run([cli, "stop"], { env, cwd: holder });
		},
	};
}

/**
 * A board as `semantic show` reports it, read through the board's own schema.
 * @param server The server.
 * @param name The board.
 * @returns The board.
 * @throws {Error} When the answer holds no board.
 */
async function readBoard(server: TakeServer, name: string): Promise<SemanticBoard> {
	const shown = await server.cli(["semantic", "show", name]);
	const parsed = parseSemanticBoard(
		typeof shown === "object" && shown !== null && "board" in shown ? shown.board : undefined,
	);
	if (!parsed.ok) throw new Error(`semantic show "${name}" held no board: ${parsed.problem}`);
	return parsed.board;
}

export {
	readBoard,
	startCheckoutServer,
	startServer,
	type TakeServer,
	type TrackedVault,
	type TakeSource,
};
