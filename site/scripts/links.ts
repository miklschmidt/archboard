// Fail the build on a dead internal link: a page that `dist` does not hold, or an anchor that the
// page does not have. It also fails on a guide's `{reference.…}` expression that shows as text. The guides link each Action input and each finding code to its row in the
// reference, so a renamed input or code breaks a link here instead of leaving a guide outdated.
//
// Run from the repository root, after the build or after `versions.ts`:
//   bun site/scripts/links.ts [dist]
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const DIST = process.argv[2] ?? join(import.meta.dir, "../dist");
/** The path that the site is served under, as `astro.config.mjs` reads it. */
const BASE = `${(process.env.SITE_BASE ?? "/archboard").replace(/\/$/u, "")}/`;

/** Every HTML file in `dist`. */
function pages(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return pages(path);
		return entry.name.endsWith(".html") ? [path] : [];
	});
}

/** The file in `dist` that serves a path under the base, or nothing for a path outside it. */
function fileOf(pathname: string): string | undefined {
	if (!pathname.startsWith(BASE)) return undefined;
	const rest = decodeURIComponent(pathname.slice(BASE.length));
	if (rest === "" || rest.endsWith("/")) return join(DIST, rest, "index.html");
	return /\.[a-z0-9]+$/iu.test(rest) ? join(DIST, rest) : join(DIST, rest, "index.html");
}

const ids = new Map<string, Set<string>>();
/** The anchors of one page. */
function idsOf(file: string): Set<string> {
	let found = ids.get(file);
	if (found === undefined) {
		const html = readFileSync(file, "utf8");
		found = new Set([...html.matchAll(/\s(?:id|name)="([^"]+)"/gu)].map((match) => match[1] ?? ""));
		ids.set(file, found);
	}
	return found;
}

const dead: string[] = [];
for (const page of pages(DIST)) {
	// A guide's expression that MDX printed as text, such as one inside a link it made from a URL.
	const unrendered = /\{reference\.[\w.]+\}/u.exec(readFileSync(page, "utf8"));
	if (unrendered !== null) dead.push(`${relative(DIST, page)}: ${unrendered[0]} (not rendered)`);
	const url = new URL(`${BASE}${relative(DIST, page).replace(/index\.html$/u, "")}`, "http://site");
	for (const match of readFileSync(page, "utf8").matchAll(/\shref="([^"]*)"/gu)) {
		const href = (match[1] ?? "").replaceAll("&amp;", "&");
		if (/^(?:[a-z]+:|\/\/)/iu.test(href)) continue;
		const target = new URL(href, url);
		const file = fileOf(target.pathname);
		if (file === undefined) continue;
		const fragment = decodeURIComponent(target.hash.slice(1));
		if (!existsSync(file)) dead.push(`${relative(DIST, page)}: ${href} (no page)`);
		else if (fragment !== "" && file.endsWith(".html") && !idsOf(file).has(fragment)) {
			dead.push(`${relative(DIST, page)}: ${href} (no anchor)`);
		}
	}
}

if (dead.length > 0) {
	throw new Error(`Dead links in the site:\n${dead.map((one) => `- ${one}`).join("\n")}`);
}
console.log(`links: every internal link of ${String(pages(DIST).length)} pages resolves`);
