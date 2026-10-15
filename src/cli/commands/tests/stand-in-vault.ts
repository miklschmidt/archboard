// The vault a command test that runs the CLI in its own process addresses.
//
// Named through ARCHBOARD_VAULT, because a vault from the environment is used
// as it is: the command neither searches from the working directory, which is
// this checkout, nor registers anything in the registry of the machine that
// runs the test. Set it before the CLI loads, because the CLI reads the
// environment as it loads.

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A temporary vault named through the environment, and how to put things back. */
interface StandInVault {
	readonly path: string;
	/**
	 * A request's path and query, without the vault it named when that is this one.
	 * @param url The request's URL.
	 * @returns The path and query; a call that names another vault, or none, keeps what it named.
	 */
	unnamed(url: URL): string;
	restore(): void;
}

/**
 * Make a temporary vault and name it through the environment.
 * @returns The vault.
 */
function nameStandInVault(): StandInVault {
	const root = mkdtempSync(join(tmpdir(), "archboard-command-vault-"));
	const path = join(root, ".archboard", "vault");
	mkdirSync(path, { recursive: true });
	const before = process.env["ARCHBOARD_VAULT"];
	process.env["ARCHBOARD_VAULT"] = path;
	return {
		path,
		unnamed(url) {
			const named = `vault=${encodeURIComponent(path)}`;
			const kept = url.search
				.slice(1)
				.split("&")
				.filter((pair) => pair !== "" && pair !== named);
			return kept.length === 0 ? url.pathname : `${url.pathname}?${kept.join("&")}`;
		},
		restore() {
			if (before === undefined) delete process.env["ARCHBOARD_VAULT"];
			else process.env["ARCHBOARD_VAULT"] = before;
			rmSync(root, { recursive: true, force: true });
		},
	};
}

export { nameStandInVault, type StandInVault };
