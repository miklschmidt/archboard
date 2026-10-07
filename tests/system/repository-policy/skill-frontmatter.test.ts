import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const skillsRoot = path.join(repoRoot, "skills");
const skills = fs
	.readdirSync(skillsRoot, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => path.join(skillsRoot, entry.name, "SKILL.md"))
	.filter((file) => fs.existsSync(file))
	.toSorted();

test("the distributable skills tree contains skills", () => {
	expect(skills.length).toBeGreaterThan(0);
});

for (const file of skills) {
	test(`${path.relative(repoRoot, file)} has valid discovery metadata`, () => {
		const source = fs.readFileSync(file, "utf8");
		const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(source);
		expect(match, "missing YAML frontmatter").not.toBeNull();
		const metadata: unknown = Bun.YAML.parse(match?.[1] ?? "");
		z.object({
			name: z.literal(path.basename(path.dirname(file))),
			description: z.string().trim().min(1),
		}).parse(metadata);
	});
}
