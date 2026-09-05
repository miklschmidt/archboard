import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "../../..");
const packageJson: { scripts: Record<string, string>; devDependencies: Record<string, string> } =
	JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

test("normal local and hosted lint uses the pinned ordinary type-aware engine", () => {
	expect(packageJson.devDependencies["oxlint"]).toBe("1.80.0");
	expect(packageJson.devDependencies["oxlint-tsgolint"]).toBe("7.0.2001");
	expect(packageJson.scripts["lint"]).toStartWith("oxlint --type-aware . ");
	expect(packageJson.scripts["check"]).toStartWith("bun run lint &&");
	expect(packageJson.scripts["type-check"]).not.toContain(" & ");
});

test("the pinned engine reports an actual imported-type violation and propagates failure", () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-type-aware-proof-"));
	try {
		writeFileSync(
			join(root, "tsconfig.json"),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					noEmit: true,
					target: "ES2023",
					module: "ESNext",
					moduleResolution: "bundler",
				},
				include: ["*.ts"],
			}),
		);
		writeFileSync(
			join(root, ".oxlintrc.json"),
			JSON.stringify({
				plugins: ["typescript"],
				categories: { correctness: "off" },
				rules: { "typescript/no-base-to-string": "error" },
			}),
		);
		writeFileSync(
			join(root, "contract.d.ts"),
			"export interface Payload { readonly label: string }\n",
		);
		const source = join(root, "consumer.ts");
		const command = [
			join(repoRoot, "node_modules/.bin/oxlint"),
			"--type-aware",
			"--config",
			join(root, ".oxlintrc.json"),
			source,
		];
		writeFileSync(
			source,
			'import type { Payload } from "./contract";\nexport function format(value: Payload): string { return value.label; }\n',
		);
		const good = Bun.spawnSync(command, { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
		expect(good.exitCode, good.stdout.toString() + good.stderr.toString()).toBe(0);
		writeFileSync(
			source,
			'import type { Payload } from "./contract";\nexport function format(value: Payload): string { return String(value); }\n',
		);
		const bad = Bun.spawnSync(command, { cwd: repoRoot, stdout: "pipe", stderr: "pipe" });
		expect(bad.exitCode).toBe(1);
		expect(bad.stdout.toString() + bad.stderr.toString()).toContain("no-base-to-string");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
