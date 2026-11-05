import { installation } from "@archboard/workspace/installation";
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	prepareSkillArtifacts,
	releaseLinkBase,
} from "#runtime/operations/distribution/prepare.ts";

test("a release preparation names its commit and links the manual to the tag, not to a checkout", () => {
	const skill = mkdtempSync(join(tmpdir(), "archboard-release-links-"));
	try {
		const base = releaseLinkBase("1.2.3");
		const prepared = prepareSkillArtifacts(skill, {
			root: installation().root,
			revision: "0123456789abcdef",
			linkBase: base,
		});
		const file = prepared.files.find((candidate) => candidate.endsWith("INSTALL.md"));
		if (file === undefined) throw new Error("The manual is not among the prepared files.");
		const manual = readFileSync(join(skill, file), "utf8");

		expect(base).toBe("https://github.com/miklschmidt/archboard/blob/v1.2.3");
		expect(manual).toContain("0123456789abcdef");
		expect(manual).not.toContain(installation().root);
		const targets = [...manual.matchAll(/\]\(<?([^)>]+)>?\)/gu)].map((match) => match[1] ?? "");
		expect(targets.length).toBeGreaterThan(0);
		for (const target of targets) {
			expect(target.startsWith("#") || target.startsWith("https://")).toBe(true);
		}
		expect(targets).toContain(`${base}/TESTING.md`);
	} finally {
		rmSync(skill, { recursive: true, force: true });
	}
});
