// The language servers a code-check owner runs: Archboard's own tsc for
// TypeScript, which comes with Archboard's install, and no other. A server of
// another language would come from this machine's `PATH` or its
// `language-servers.json`, and an owner must give the same answer on a
// machine with or without one.

import { join } from "node:path";
import { readLanguageServers, type LanguageServerTable } from "@/runtime/language-servers/index";

/**
 * The table of an owner's passes.
 * @returns Archboard's own TypeScript server, and every other language turned off.
 */
function ownServers(): LanguageServerTable {
	const defaults = readLanguageServers(join(import.meta.dir, "no-language-servers.json"));
	return new Map(
		[...defaults].map(([language, server]) => [
			language,
			language === "typescript" ? server : { status: "missing", detail: "turned off by the test" },
		]),
	);
}

export { ownServers };
