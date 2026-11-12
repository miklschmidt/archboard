// Write the files that crawlers read from the assembled site: sitemap.xml, which robots.txt names
// for search engines, and llms.txt (https://llmstxt.org), the index of the docs that agents and AI
// answers read. The deploy writes them after `versions.ts`, because only the assembled site knows
// which docs /docs/ serves.
//
// Both list the pages of the newest release: the home page and the docs at /docs/. They leave out
// main's docs at /docs/next/ and each release's at /docs/<version>/, whose pages name the page
// under /docs/ as their canonical URL (`versions.ts`), so search engines and agents read one copy
// of each page.
//
// Run from the repository root, after the versions are put together:
//   bun site/scripts/crawlers.ts [--site site/dist]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { links } from "../src/lib/links";

/** A page that a crawler reads. */
export interface Page {
	readonly url: string;
	readonly title: string;
	readonly description: string;
}

/** The pages of main's docs and of each release's own copy. */
const VERSIONED = /^docs\/(?:next|\d+\.\d+\.\d+)\//u;

/** The text of an HTML attribute or element, as Astro escapes it. */
function text(html: string): string {
	return html
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&amp;", "&");
}

/**
 * The pages of the newest release, sorted by URL.
 * @param files Each page's file in the site, such as `docs/gate/index.html`, and its HTML.
 */
export function pagesOf(
	files: readonly { readonly file: string; readonly html: string }[],
): Page[] {
	return files
		.filter(({ file }) => !VERSIONED.test(file))
		.flatMap(({ html }) => {
			const url = /<link rel="canonical" href="([^"]+)"/u.exec(html)?.[1];
			if (url === undefined) return [];
			const title = /<title>([^<]*)<\/title>/u.exec(html)?.[1] ?? "";
			const description = /<meta name="description" content="([^"]*)"/u.exec(html)?.[1] ?? "";
			return [{ url: text(url), title: text(title), description: text(description) }];
		})
		.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0));
}

/** The sitemap of the pages. */
export function sitemapOf(pages: readonly Page[]): string {
	const entries = pages.map(({ url }) => `\t<url><loc>${url.replaceAll("&", "&amp;")}</loc></url>`);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

/**
 * The llms.txt of the pages: the home page's description, then each docs page with its own.
 * @param pages The pages, with the home page first.
 */
export function llmsOf(pages: readonly Page[]): string {
	const [home, ...docs] = pages;
	if (home === undefined) throw new Error("The site has no pages to list in llms.txt");
	const entries = docs.map(
		({ url, title, description }) =>
			`- [${title.replace(/ · Archboard docs$/u, "")}](${url}): ${description}`,
	);
	return [
		"# Archboard",
		"",
		`> ${home.description}`,
		"",
		`Home page: ${home.url}`,
		"",
		"## Docs",
		"",
		...entries,
		"",
		"## Source",
		"",
		`- [Repository](${links.repository}): the source code, the README and the issues.`,
		`- [Agent skill](${links.skill}): the instructions that teach a coding agent to use Archboard.`,
		"",
	].join("\n");
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: { site: { type: "string", default: join(import.meta.dir, "../dist") } },
	});
	const files = readdirSync(values.site, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".html"))
		.map((file) => ({ file, html: readFileSync(join(values.site, file), "utf8") }));
	const pages = pagesOf(files);
	writeFileSync(join(values.site, "sitemap.xml"), sitemapOf(pages));
	writeFileSync(join(values.site, "llms.txt"), llmsOf(pages));
	console.log(`crawlers: sitemap.xml and llms.txt list ${String(pages.length)} pages`);
}
