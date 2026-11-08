// Every relative link in a skill that `archboard init` installs names a tracked file of that
// skill's package and, when it names a heading, a heading of that file. An agent in another
// repository follows these links in its installed copy, and the skills CLI copies only what
// Git tracks, so a file that exists here but is not tracked does not count.

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { anchorsOf } from "@archboard/skills/citations";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The skills that `archboard init` installs, as BUNDLED_SKILLS in
 * apps/cli/src/cli/commands/init/rules/setup-choices.ts names them. A test may not import the app.
 */
const BUNDLED_SKILLS = ["archboard", "archboard-pr", "archboard-plan"] as const;

/** A markdown link's target: `](target)` or `](<target>)`, with an optional title. */
const LINK = /\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/gu;

/** A fenced code block, or a code span that stays inside one paragraph: examples, not links. */
const CODE =
	/^ *(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ *\1[`~]*[ \t]*$|(`+)(?:[^`\n]|\n(?![ \t]*\n))+?\2/gmu;

/** A target with a scheme, which leaves the package on purpose. */
const SCHEME = /^[a-z][a-z+.-]*:/iu;

/**
 * The files Git tracks below a directory of the repository.
 * @param directory The directory, relative to the repository.
 * @returns Their absolute paths.
 */
function trackedFiles(directory: string): Set<string> {
	const listed = execFileSync("git", ["ls-files", "-z", "--", directory], {
		cwd: repository,
		encoding: "utf8",
	});
	return new Set(
		listed
			.split("\0")
			.filter((file) => file !== "")
			.map((file) => path.join(repository, file)),
	);
}

/**
 * The links of one document that name nothing inside its boundary.
 * @param file The document.
 * @param boundary The directory that owns the allowed targets.
 * @param exists Whether a target file counts as present.
 * @returns Each broken link as `<document>: <target>`.
 */
function brokenLinks(
	file: string,
	boundary: string,
	exists: (target: string) => boolean = fs.existsSync,
): string[] {
	const name = path.relative(boundary, file);
	const prose = fs.readFileSync(file, "utf8").replaceAll(CODE, "");
	return [...prose.matchAll(LINK)].flatMap(([, target = ""]) => {
		if (SCHEME.test(target)) return [];
		const [relative = "", anchor] = target.split("#");
		const resolved = relative === "" ? file : path.resolve(path.dirname(file), relative);
		const inside = resolved.startsWith(`${boundary}${path.sep}`);
		if (!inside || !exists(resolved)) return [`${name}: ${target}`];
		if (anchor === undefined || !resolved.endsWith(".md")) return [];
		return anchorsOf(fs.readFileSync(resolved, "utf8")).has(anchor) ? [] : [`${name}: ${target}`];
	});
}

describe("the shipped skills' links", () => {
	for (const skill of BUNDLED_SKILLS) {
		test(`each in ${skill} names a tracked file of its package, and a heading that file has`, () => {
			const skillRoot = path.join(repository, "skills", skill);
			const tracked = trackedFiles(path.join("skills", skill));
			const documents = [...tracked].filter((file) => file.endsWith(".md"));
			expect(documents.length).toBeGreaterThan(0);
			expect(
				documents.flatMap((file) => brokenLinks(file, skillRoot, (target) => tracked.has(target))),
			).toEqual([]);
		});
	}
});

test("the repository navigation and development skills reach existing files and headings", () => {
	const documents = [
		"AGENTS.md",
		"TESTING.md",
		"INSTALL.md",
		".archboard/README.md",
		"skills/archboard-dev/SKILL.md",
		"skills/archboard-renderer/SKILL.md",
		...fs
			.readdirSync(path.join(repository, "docs/agents"))
			.filter((file) => file.endsWith(".md"))
			.map((file) => `docs/agents/${file}`),
	];
	expect(documents.flatMap((file) => brokenLinks(path.join(repository, file), repository))).toEqual(
		[],
	);
});
