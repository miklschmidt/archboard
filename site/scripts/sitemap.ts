// Write sitemap.xml for the assembled site, which robots.txt names for search engines. The deploy
// writes it after `versions.ts`, because only the assembled site knows which docs /docs/ serves.
//
// The sitemap lists every page that names itself as its canonical URL. A copy of a docs page under
// /docs/<version>/ or /docs/next/ names the page under /docs/ instead (`versions.ts`), so it stays
// out, and search engines index one copy of each page.
//
// Run from the repository root, after the versions are put together:
//   bun site/scripts/sitemap.ts [--site site/dist]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

/** The path that the site is served under, as `astro.config.mjs` reads it. */
const BASE = `${(process.env["SITE_BASE"] ?? "/").replace(/\/$/u, "")}/`;

/**
 * The sitemap of a site.
 * @param pages Each page's file in the site, such as `docs/gate/index.html`, and its HTML.
 * @returns The sitemap, which lists each page whose canonical URL is its own path.
 */
export function sitemapOf(
	pages: readonly { readonly file: string; readonly html: string }[],
): string {
	const urls = pages.flatMap(({ file, html }) => {
		const href = /<link rel="canonical" href="([^"]+)"/u.exec(html)?.[1];
		if (href === undefined) return [];
		const own = `${BASE}${file.replace(/index\.html$/u, "")}`;
		return new URL(href).pathname === own ? [href] : [];
	});
	const entries = [...new Set(urls)]
		.sort()
		.map((url) => `\t<url><loc>${url.replaceAll("&", "&amp;")}</loc></url>`);
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: { site: { type: "string", default: join(import.meta.dir, "../dist") } },
	});
	const pages = readdirSync(values.site, { recursive: true, encoding: "utf8" })
		.filter((file) => file.endsWith(".html"))
		.map((file) => ({ file, html: readFileSync(join(values.site, file), "utf8") }));
	const sitemap = sitemapOf(pages);
	writeFileSync(join(values.site, "sitemap.xml"), sitemap);
	console.log(
		`sitemap: ${String(sitemap.split("<url>").length - 1)} of ${String(pages.length)} pages`,
	);
}
