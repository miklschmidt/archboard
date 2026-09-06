import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * The YAML frontmatter of one skill, or the reason it cannot be read.
 * @param source The skill file's text.
 * @returns The parsed frontmatter, or an error message.
 */
function frontmatter(source: string): Record<string, unknown> | string {
	const match = /^---\n([\s\S]*?)\n---\n/u.exec(source);
	if (match?.[1] === undefined) {
		return "missing frontmatter block";
	}
	try {
		const parsed: unknown = Bun.YAML.parse(match[1]);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: "frontmatter is not a mapping";
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

test("every tracked skill has frontmatter that parses with a name and description", () => {
	const skillsRoot = path.join(repoRoot, "skills");
	const files = fs
		.readdirSync(skillsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(skillsRoot, entry.name, "SKILL.md"))
		.filter((file) => fs.existsSync(file));
	expect(files.length).toBeGreaterThan(0);
	for (const file of files) {
		const parsed = frontmatter(fs.readFileSync(file, "utf8"));
		expect(parsed, path.relative(repoRoot, file)).toBeObject();
		if (typeof parsed === "object") {
			expect(parsed["name"], file).toBe(path.basename(path.dirname(file)));
			expect(parsed["description"], file).toBeString();
		}
	}
});
