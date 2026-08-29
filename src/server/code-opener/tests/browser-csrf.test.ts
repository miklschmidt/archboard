import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { checkBrowserCsrf } from "../index.ts";

const accepted = (overrides: Record<string, string | undefined> = {}) => ({
	host: "127.0.0.1:3000",
	origin: "http://127.0.0.1:3000",
	secFetchSite: "same-origin",
	...overrides,
});

describe("browser CSRF guard", () => {
	test("accepts forged loopback headers because this guard is browser CSRF, not authentication", () => {
		const source = readFileSync(new URL("../lib/browser-csrf.ts", import.meta.url), "utf8");
		expect(source).toContain(
			"This protects browsers against CSRF. It does not authenticate a local process",
		);
		expect(
			checkBrowserCsrf("mutation", {
				host: "127.0.0.1:3000",
				origin: "http://localhost:5173",
				secFetchSite: "same-origin",
			}),
		).toEqual({ ok: true });
	});
	test.each([
		accepted(),
		accepted({ origin: "http://127.0.0.1:5173" }),
		accepted({ host: "[::1]:3000", origin: "http://[::1]:5173" }),
		accepted({ host: "localhost:3000", origin: "http://localhost:3000" }),
	])("accepts production, Vite, and normalized loopback tuples", (headers) => {
		expect(checkBrowserCsrf("mutation", headers)).toEqual({ ok: true });
	});

	test("allows Referer only for a settings GET whose Origin is absent", () => {
		expect(
			checkBrowserCsrf("settings-read", {
				host: "127.0.0.1:3000",
				referer: "http://127.0.0.1:3000/settings?tab=opener",
				secFetchSite: "same-origin",
			}),
		).toEqual({ ok: true });
		expect(
			checkBrowserCsrf("settings-read", {
				host: "127.0.0.1:3000",
				origin: "null",
				referer: "http://127.0.0.1:3000/settings",
				secFetchSite: "same-origin",
			}),
		).toMatchObject({ ok: false, code: "CROSS_ORIGIN_REFUSED" });
	});

	test.each([
		accepted({ host: "evil.test:3000" }),
		accepted({ origin: undefined }),
		accepted({ origin: "null" }),
		accepted({ origin: "https://evil.test" }),
		accepted({ origin: "http://127.0.0.1:3000/path" }),
		accepted({ origin: "http://evil@127.0.0.1:3000" }),
		accepted({ secFetchSite: undefined }),
		accepted({ secFetchSite: "same-site" }),
		accepted({ secFetchSite: "cross-site" }),
	])("rejects an unsafe mutation tuple", (headers) => {
		expect(checkBrowserCsrf("mutation", headers)).toMatchObject({
			ok: false,
			code: "CROSS_ORIGIN_REFUSED",
		});
	});
});
