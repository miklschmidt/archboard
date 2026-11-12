import { expect, test } from "bun:test";
import { addAnalytics } from "./analytics";

const page = "<!doctype html><html><head><title>Docs</title></head><body></body></html>";

test("a page gets PostHog once, at the end of its head, in cookieless mode through the site's host", () => {
	const once = addAnalytics(page, "phc_key");
	expect(addAnalytics(once, "phc_key")).toBe(once);
	const head = once.slice(0, once.indexOf("</head>"));
	expect(head).toContain('posthog.init("phc_key",');
	expect(head).toContain('"api_host":"https://e.usearchboard.dev"');
	expect(head).toContain('"cookieless_mode":"always"');
	expect(once.endsWith("</head><body></body></html>")).toBe(true);
});

test("a page without a head fails the deploy", () => {
	expect(() => addAnalytics("<p>No head</p>", "phc_key")).toThrow("</head>");
});
