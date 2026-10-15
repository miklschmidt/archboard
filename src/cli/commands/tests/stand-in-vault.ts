// The vault a command test that runs the CLI in its own process addresses.
//
// A temporary directory holds `.archboard/vault`, and `argv` adds `-C <that
// directory>` to a command's arguments, so the command finds that vault as it
// finds any other (ADR 0049): not by searching from the working directory,
// which is this checkout. The registry the command registers it in is a file in
// the same directory, named through ARCHBOARD_REPOS for the test's life, so
// nothing reaches the registry of the machine that runs the test. `restore`
// puts ARCHBOARD_REPOS back and removes the directory.

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A temporary vault a command is pointed at with `-C`, and how to put things back. */
interface StandInVault {
	/** The vault itself, as a command's answer names it. */
	readonly path: string;
	/**
	 * A command's arguments with `-C` naming this vault's directory.
	 * @param args The command and its own arguments.
	 * @returns The arguments to give the CLI.
	 */
	argv(args: readonly string[]): string[];
	/**
	 * A request's path and query, without the vault it named when that is this one.
	 * @param url The request's URL.
	 * @returns The path and query; a call that names another vault, or none, keeps what it named.
	 */
	unnamed(url: URL): string;
	restore(): void;
}

/**
 * Make a temporary vault and an isolated registry for the commands that address it.
 * @returns The vault.
 */
function makeStandInVault(): StandInVault {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "archboard-command-vault-")));
	const path = join(root, ".archboard", "vault");
	mkdirSync(path, { recursive: true });
	const before = process.env["ARCHBOARD_REPOS"];
	process.env["ARCHBOARD_REPOS"] = join(root, "repos.json");
	return {
		path,
		argv: (args) => [...args, "-C", root],
		unnamed(url) {
			const named = `vault=${encodeURIComponent(path)}`;
			const kept = url.search
				.slice(1)
				.split("&")
				.filter((pair) => pair !== "" && pair !== named);
			return kept.length === 0 ? url.pathname : `${url.pathname}?${kept.join("&")}`;
		},
		restore() {
			if (before === undefined) delete process.env["ARCHBOARD_REPOS"];
			else process.env["ARCHBOARD_REPOS"] = before;
			rmSync(root, { recursive: true, force: true });
		},
	};
}

export { makeStandInVault, type StandInVault };
