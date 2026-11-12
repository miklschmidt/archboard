import { expect, test } from "bun:test";
import { llmsOf, pagesOf, sitemapOf } from "./crawlers";
import { movePage } from "./versions";

// The build runs these tests with the base path that it builds for, as `versions.ts` reads it.
const BASE = `${(process.env["SITE_BASE"] ?? "/").replace(/\/$/u, "")}/`;
const SITE = `https://usearchboard.dev${BASE}`;

const page = (url: string): string =>
	`<html><head><link rel="canonical" href="${url}"><meta property="og:url" content="${url}"></head>` +
	`<body><a href="${BASE}docs/install/">Install</a></body></html>`;

test("a versioned copy of a docs page names the page under /docs/ as canonical", () => {
	const moved = movePage(page(`${SITE}docs/gate/`), "0.3.0/", true);
	expect(moved).toContain(`<link rel="canonical" href="${SITE}docs/gate/">`);
	expect(moved).toContain(`<meta property="og:url" content="${SITE}docs/gate/">`);
	expect(moved).toContain(`href="${BASE}docs/0.3.0/install/"`);
});

test("a copy whose page /docs/ lacks stays its own canonical", () => {
	const moved = movePage(page(`${SITE}docs/gate/`), "next/", false);
	expect(moved).toContain(`<link rel="canonical" href="${SITE}docs/next/gate/">`);
});

const docsPage = (url: string, title: string): string =>
	`<html><head><title>${title} · Archboard docs</title>` +
	`<meta name="description" content="What &quot;${title}&quot; covers."><link rel="canonical" href="${url}"></head></html>`;

test("the sitemap and llms.txt list the newest release's pages, and no other version", () => {
	const pages = pagesOf([
		{ file: "docs/gate/index.html", html: docsPage("https://usearchboard.dev/docs/gate/", "Gate") },
		{
			file: "docs/next/gate/index.html",
			html: docsPage("https://usearchboard.dev/docs/gate/", "Gate"),
		},
		{
			file: "docs/next/new/index.html",
			html: docsPage("https://usearchboard.dev/docs/next/new/", "New"),
		},
		{
			file: "docs/0.3.0/old/index.html",
			html: docsPage("https://usearchboard.dev/docs/0.3.0/old/", "Old"),
		},
		{
			file: "index.html",
			html: '<title>Archboard</title><meta name="description" content="Maps for agents."><link rel="canonical" href="https://usearchboard.dev/">',
		},
	]);
	expect([...sitemapOf(pages).matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1])).toEqual([
		"https://usearchboard.dev/",
		"https://usearchboard.dev/docs/gate/",
	]);
	const llms = llmsOf(pages);
	expect(llms.startsWith("# Archboard\n\n> Maps for agents.\n")).toBe(true);
	expect(llms).toContain('- [Gate](https://usearchboard.dev/docs/gate/): What "Gate" covers.\n');
	expect(llms).not.toContain("/docs/next/");
});
