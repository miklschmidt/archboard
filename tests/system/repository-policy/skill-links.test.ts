// Every relative link in the consumer skill names a file of the package that
// `install-skill` copies and, when it names a heading, a heading of that file.
// An agent in another repository follows these links in its installed copy.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { anchorsOf } from "@/runtime/skill-evaluation/index";

const skillRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../../../skills/archboard",
);

/** A markdown link's target: `](target)` or `](<target>)`, with an optional title. */
const LINK = /\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/gu;

/** A target with a scheme, which leaves the package on purpose. */
const SCHEME = /^[a-z][a-z+.-]*:/iu;

/**
 * The links of one skill document that name nothing in the package.
 * @param file The document.
 * @param boundary The directory that owns the allowed targets.
 * @returns Each broken link as `<document>: <target>`.
 */
function brokenLinks(file: string, boundary = skillRoot): string[] {
	const name = path.relative(boundary, file);
	return [...fs.readFileSync(file, "utf8").matchAll(LINK)].flatMap(([, target = ""]) => {
		if (SCHEME.test(target)) return [];
		const [relative = "", anchor] = target.split("#");
		const resolved = relative === "" ? file : path.resolve(path.dirname(file), relative);
		const inside = resolved.startsWith(`${boundary}${path.sep}`);
		if (!inside || !fs.existsSync(resolved)) return [`${name}: ${target}`];
		if (anchor === undefined || !resolved.endsWith(".md")) return [];
		return anchorsOf(fs.readFileSync(resolved, "utf8")).has(anchor) ? [] : [`${name}: ${target}`];
	});
}

describe("the consumer skill's links", () => {
	test("each names a file of the package, and a heading that file has", () => {
		const documents = fs
			.readdirSync(skillRoot, { recursive: true, encoding: "utf8" })
			.filter((file) => file.endsWith(".md") && !file.startsWith(`references${path.sep}generated`))
			.map((file) => path.join(skillRoot, file));
		expect(documents.length).toBeGreaterThan(0);
		expect(documents.flatMap((file) => brokenLinks(file))).toEqual([]);
	});
});

test("the repository navigation and development skill reach existing files and headings", () => {
	const repository = path.resolve(skillRoot, "../..");
	const documents = [
		"AGENTS.md",
		"TESTING.md",
		"INSTALL.md",
		".archboard/README.md",
		"skills/archboard-dev/SKILL.md",
		...fs
			.readdirSync(path.join(repository, "docs/agents"))
			.filter((file) => file.endsWith(".md"))
			.map((file) => `docs/agents/${file}`),
	];
	expect(documents.flatMap((file) => brokenLinks(path.join(repository, file), repository))).toEqual(
		[],
	);
});
