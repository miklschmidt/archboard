import { expect, test } from "bun:test";
import { sitemapOf } from "./sitemap";
import { movePage } from "./versions";

const page = (url: string): string =>
	`<html><head><link rel="canonical" href="${url}"><meta property="og:url" content="${url}"></head>` +
	`<body><a href="/docs/install/">Install</a></body></html>`;

test("a versioned copy of a docs page names the page under /docs/ as canonical", () => {
	const moved = movePage(page("https://usearchboard.dev/docs/gate/"), "0.3.0/", true);
	expect(moved).toContain('<link rel="canonical" href="https://usearchboard.dev/docs/gate/">');
	expect(moved).toContain('<meta property="og:url" content="https://usearchboard.dev/docs/gate/">');
	expect(moved).toContain('href="/docs/0.3.0/install/"');
});

test("a copy whose page /docs/ lacks stays its own canonical", () => {
	const moved = movePage(page("https://usearchboard.dev/docs/gate/"), "next/", false);
	expect(moved).toContain('<link rel="canonical" href="https://usearchboard.dev/docs/next/gate/">');
});

test("the sitemap lists each page that is its own canonical, and no copy", () => {
	const sitemap = sitemapOf([
		{ file: "index.html", html: page("https://usearchboard.dev/") },
		{ file: "docs/gate/index.html", html: page("https://usearchboard.dev/docs/gate/") },
		{ file: "docs/next/gate/index.html", html: page("https://usearchboard.dev/docs/gate/") },
		{ file: "docs/next/new/index.html", html: page("https://usearchboard.dev/docs/next/new/") },
	]);
	expect([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1])).toEqual([
		"https://usearchboard.dev/",
		"https://usearchboard.dev/docs/gate/",
		"https://usearchboard.dev/docs/next/new/",
	]);
});
