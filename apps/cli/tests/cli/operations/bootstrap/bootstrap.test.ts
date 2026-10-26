// The arguments the bootstrap hands to routing: a `-C <dir>` written before the
// command name reads as one written after it, on either side of a `--url`
// (ADR 0049). "Fix with Codex" asks an agent for `archboard -C <vault> --url
// <url> check semantics`, so that spelling has to reach `check`.

import { expect, test } from "bun:test";
import { applyCliBootstrap } from "#cli/operations/bootstrap/bootstrap.ts";

test("a leading -C reaches the command on either side of --url", () => {
	for (const argv of [
		["-C", "/work/.archboard/vault", "--url", "http://127.0.0.1:4317", "check"],
		["--url", "http://127.0.0.1:4317", "-C", "/work/.archboard/vault", "check"],
		["-C", "/work/.archboard/vault", "check", "--url", "http://127.0.0.1:4317"],
	]) {
		const environment: Record<string, string | undefined> = {};
		const bootstrap = applyCliBootstrap(argv, environment);
		expect(argv).toEqual(["check", "-C", "/work/.archboard/vault"]);
		expect(bootstrap).toEqual({ url: "http://127.0.0.1:4317", help: false });
		expect(environment["ARCHBOARD_URL"]).toBe("http://127.0.0.1:4317");
	}
});
