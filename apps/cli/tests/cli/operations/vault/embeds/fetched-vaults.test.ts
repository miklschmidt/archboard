// Where the vault of a repository identity is fetched from and cached (ADR
// 0057). An identity comes from a recipe in any tracked file, so one that is
// not a host and a path on it must never become a URL or a directory outside
// the cache. A fetch never prompts for credentials, not even through the
// person's askpass program. The fetch itself is owned by
// tests/system/semantic-boards/embeds-fetch.test.ts.

import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stateDir } from "@archboard/workspace/state-dir";
import { fetchedVault, remoteOf } from "#cli/operations/vault/embeds/fetched-vaults.ts";

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

test("a remote that asks for credentials fails the fetch without starting the person's askpass program", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-fetch-askpass-"));
	const asked = path.join(root, "asked");
	const askpass = path.join(root, "askpass.sh");
	fs.writeFileSync(askpass, `#!/bin/sh\ntouch '${asked}'\necho secret\n`, { mode: 0o755 });
	// A remote that answers every request with a demand for credentials.
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch: () =>
			new Response("", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="r"' } }),
	});
	const set = {
		XDG_STATE_HOME: path.join(root, "state"),
		GIT_ASKPASS: askpass,
		SSH_ASKPASS: askpass,
		GIT_CONFIG_NOSYSTEM: "1",
		GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
		GIT_CONFIG_COUNT: "1",
		GIT_CONFIG_KEY_0: `url.http://127.0.0.1:${server.port}/.insteadOf`,
		GIT_CONFIG_VALUE_0: "https://example.com/",
	};
	const saved = Object.fromEntries(Object.keys(set).map((name) => [name, process.env[name]]));
	Object.assign(process.env, set);
	try {
		const fetched = await fetchedVault("example.com/owner/models", AbortSignal.timeout(20_000));
		expect(fetched.ok).toBe(false);
		expect(fs.existsSync(asked)).toBe(false);
	} finally {
		for (const [name, value] of Object.entries(saved)) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		await server.stop(true);
		fs.rmSync(root, { recursive: true, force: true });
	}
});
