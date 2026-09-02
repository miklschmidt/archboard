import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageJson = JSON.parse(
	readFileSync(fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8"),
) as {
	readonly scripts?: Readonly<Record<string, string>>;
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
};

test("repository checks cannot load the unbounded type-aware lint path", () => {
	const directDependencies = {
		...packageJson.dependencies,
		...packageJson.devDependencies,
	};
	expect(directDependencies).not.toHaveProperty("oxlint-tsgolint");
	for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
		expect(command, `package script ${name}`).not.toContain("--type-aware");
		expect(command, `package script ${name}`).not.toMatch(/\btsgolint\b/);
	}
	const oxlintConfig = readFileSync(
		fileURLToPath(new URL("../../../.oxlintrc.jsonc", import.meta.url)),
		"utf8",
	);
	expect(oxlintConfig).not.toContain('"typeAware": true');

	// This is the one repository owner that previously spawned type-aware Oxlint
	// against disposable projects linked to the full checkout dependency graph.
	// Read its bounded command fixture as text. Do not invoke a parser or load a
	// TypeScript project merely to prove that a dangerous flag is absent.
	const boundaryOwner = readFileSync(
		fileURLToPath(new URL("./boundaries.test.ts", import.meta.url)),
		"utf8",
	);
	expect(boundaryOwner).not.toContain("--type-aware");
});
