// Put every version of the docs into one site for GitHub Pages (ADR 0077):
// - each release that has docs at /docs/<version>/, and main at /docs/next/;
// - the newest of those releases at /docs/ too, or main when no release has docs yet;
// - /docs/versions.json, which each page reads to offer the others.
//
// Each docs build is made for the root /docs/. This moves a build to another root by rewriting
// that root in its HTML. Its search index holds paths under its root, so it moves unchanged. The
// hashed files in assets/ are shared, so the versions' files go into one folder.
//
// Run from the repository root, after main's build:
//   bun site/scripts/versions.ts --releases <dir> [--main site/dist] [--out site/dist]
// where <dir> holds one folder for each release, named by its version, with that release's
// docs/ and assets/.
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
	options: {
		main: { type: "string", default: join(import.meta.dir, "../dist") },
		releases: { type: "string" },
		out: { type: "string", default: join(import.meta.dir, "../dist") },
	},
});
const BASE = `${(process.env["SITE_BASE"] ?? "/archboard").replace(/\/$/u, "")}/`;
const ROOT = `${BASE}docs/`;

/** A release's version, such as `0.3.0`, as numbers to sort by. */
function semver(version: string): number[] {
	const parts = /^(\d+)\.(\d+)\.(\d+)$/u.exec(version);
	if (parts === null)
		throw new Error(`A release folder must be named by its version, not "${version}"`);
	return parts.slice(1).map(Number);
}

/** Newest first. */
function byVersion(a: string, b: string): number {
	const [x, y] = [semver(a), semver(b)];
	return (y[0] ?? 0) - (x[0] ?? 0) || (y[1] ?? 0) - (x[1] ?? 0) || (y[2] ?? 0) - (x[2] ?? 0);
}

/** Every file under a folder, as paths relative to it. */
function files(directory: string, prefix = ""): string[] {
	return readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap((entry) => {
		const path = join(prefix, entry.name);
		return entry.isDirectory() ? files(directory, path) : [path];
	});
}

/** Copy a docs build to a root under /docs/, such as `next/`, or to /docs/ itself with `""`. */
function mount(docs: string, out: string, at: string): void {
	const target = join(out, "docs", at);
	cpSync(docs, target, { recursive: true });
	if (at === "") return;
	for (const file of files(target).filter((path) => path.endsWith(".html"))) {
		const html = readFileSync(join(target, file), "utf8");
		writeFileSync(join(target, file), html.replaceAll(ROOT, `${ROOT}${at}`));
	}
}

/** Add a build's hashed files to the site's. Two files with one name must be the same file. */
function mergeAssets(from: string, out: string): void {
	if (!existsSync(from)) return;
	for (const file of files(from)) {
		const target = join(out, "assets", file);
		if (!existsSync(target)) cpSync(join(from, file), target);
		else if (!readFileSync(target).equals(readFileSync(join(from, file)))) {
			throw new Error(`Two builds hold different files at assets/${file}`);
		}
	}
}

const main = values.main;
const out = values.out;
// Keep main's docs aside first, since the output can be main's own build.
const scratch = mkdtempSync(join(tmpdir(), "docs-versions-"));
cpSync(join(main, "docs"), join(scratch, "next"), { recursive: true });
if (main !== out) cpSync(main, out, { recursive: true });
rmSync(join(out, "docs"), { recursive: true, force: true });

const releases =
	values.releases === undefined || !existsSync(values.releases)
		? []
		: readdirSync(values.releases)
				.filter((name) => existsSync(join(values.releases ?? "", name, "docs", "index.html")))
				.sort(byVersion);
const latest = releases[0] ?? null;

// The latest release, or main without one, at /docs/. Main at /docs/next/, each release at its own.
mount(
	latest === null ? join(scratch, "next") : join(values.releases ?? "", latest, "docs"),
	out,
	"",
);
mount(join(scratch, "next"), out, "next/");
for (const version of releases) {
	mount(join(values.releases ?? "", version, "docs"), out, `${version}/`);
	mergeAssets(join(values.releases ?? "", version, "assets"), out);
}
rmSync(scratch, { recursive: true, force: true });

writeFileSync(
	join(out, "docs", "versions.json"),
	`${JSON.stringify({ latest, releases }, null, "\t")}\n`,
);
console.log(
	`versions: /docs/ is ${latest ?? "main"}, ${String(releases.length)} releases, and main at /docs/next/`,
);
