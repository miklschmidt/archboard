// Where the vault of a repository identity is fetched from and cached (ADR
// 0057). An identity comes from a recipe in any tracked file, so one that is
// not a host and a path on it must never become a URL or a directory outside
// the cache. The fetch itself is owned by tests/system/semantic-boards/embeds-fetch.test.ts.

import { expect, test } from "bun:test";
import path from "node:path";
import { stateDir } from "@archboard/workspace/state-dir";
import { remoteOf } from "#cli/operations/vault/embeds/fetched-vaults.ts";

test("an identity of a host and a path is fetched over HTTPS and cached below the state directory", () => {
	expect(remoteOf("gitlab.example.com/group/sub/name")).toEqual({
		url: "https://gitlab.example.com/group/sub/name",
		cache: path.join(stateDir(), "fetched-vaults", "gitlab.example.com", "group", "sub", "name"),
	});
});

test("an identity that names no remote, or a path out of the cache or into a cached commit, is not fetched", () => {
	for (const identity of [
		"models",
		"/srv/git/models",
		"github.com/../../etc",
		"github.com/owner/name with space",
		"github.com//name",
		`github.com/owner/name/${"A0".repeat(20)}/.archboard/vault`,
	]) {
		expect(remoteOf(identity)).toBeUndefined();
	}
});
