import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCERS } from "../../../scripts/readme-assets/assets.ts";
import {
	SourceHasher,
	assess,
	checkoutFiles,
	readManifest,
	type CheckoutFacts,
	type ReadmeAsset,
	type ReadmeManifest,
} from "../../../scripts/readme-assets/manifest.ts";
import { disagreements } from "../../../scripts/readme-assets/producer.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function git(root: string, args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function withRepository<T>(files: Record<string, string>, check: (root: string) => T): T {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-readme-assets-"));
	try {
		for (const [relative, content] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
			fs.writeFileSync(path.join(root, relative), content);
		}
		git(root, ["init", "--quiet"]);
		git(root, ["add", "."]);
		return check(root);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
}

function hashOf(root: string, sources: string[]): string {
	return new SourceHasher(root, checkoutFiles(root)).hash(sources);
}

function asset(name: string, overrides: Partial<ReadmeAsset> = {}): ReadmeAsset {
	return {
		name,
		kind: "clip",
		codex: false,
		command: `bun run readme:assets ${name}`,
		files: [`docs/readme/${name}.webp`],
		sources: ["src"],
		hash: "a".repeat(64),
		...overrides,
	};
}

function facts(overrides: Partial<CheckoutFacts> = {}): CheckoutFacts {
	return {
		hash: () => "a".repeat(64),
		unmatched: () => [],
		exists: () => true,
		readmeFiles: [],
		...overrides,
	};
}

describe("README asset source hashes", () => {
	const files = {
		"src/ui/pane.ts": "pane",
		"src/ui/tests/pane.test.ts": "test",
		"src/server/route.ts": "route",
	};

	test("change exactly when a covered file changes", () => {
		withRepository(files, (root) => {
			const before = hashOf(root, ["src/ui"]);
			expect(hashOf(root, ["src/ui"])).toBe(before);

			fs.writeFileSync(path.join(root, "src/server/route.ts"), "another route");
			fs.writeFileSync(path.join(root, "src/ui/tests/pane.test.ts"), "another test");
			expect(hashOf(root, ["src/ui"])).toBe(before);

			fs.writeFileSync(path.join(root, "src/ui/pane.ts"), "another pane");
			expect(hashOf(root, ["src/ui"])).not.toBe(before);
		});
	});

	test("count a new file git does not ignore, and match globs and single files", () => {
		withRepository(files, (root) => {
			const directory = hashOf(root, ["src/ui"]);
			expect(hashOf(root, ["src/ui/*.ts"])).toBe(directory);
			expect(hashOf(root, ["src/ui/pane.ts"])).toBe(directory);

			fs.writeFileSync(path.join(root, "src/ui/dock.ts"), "dock");
			expect(hashOf(root, ["src/ui"])).not.toBe(directory);
		});
	});

	test("name the sources that cover no file", () => {
		withRepository(files, (root) => {
			const hasher = new SourceHasher(root, checkoutFiles(root));
			expect(hasher.unmatched(["src/ui", "src/gone", "src/ui/tests"])).toEqual([
				"src/gone",
				"src/ui/tests",
			]);
		});
	});
});

describe("README asset staleness", () => {
	test("says why each asset is stale and keeps the current ones apart", () => {
		const manifest: ReadmeManifest = {
			about: "",
			assets: [
				asset("current"),
				asset("never", { hash: null }),
				asset("changed", { hash: "b".repeat(64) }),
				asset("missing"),
			],
		};
		const assessment = assess(
			manifest,
			facts({ exists: (file) => file !== "docs/readme/missing.webp" }),
		);

		expect(assessment.current.map((one) => one.name)).toEqual(["current"]);
		expect(
			assessment.stale.map(({ asset: stale, reasons }) => [stale.name, reasons.length]),
		).toEqual([
			["never", 1],
			["changed", 1],
			["missing", 1],
		]);
		expect(assessment.problems).toEqual([]);
	});

	test("an asset the kit never made is stale whatever its sources hash to", () => {
		const assessment = assess({ about: "", assets: [asset("never", { hash: null })] }, facts());

		expect(assessment.current).toEqual([]);
		expect(assessment.stale).toHaveLength(1);
	});

	test("reports a source that covers nothing and a README file no asset makes", () => {
		const assessment = assess(
			{ about: "", assets: [asset("current")] },
			facts({
				unmatched: () => ["src/gone"],
				readmeFiles: [
					"docs/readme/current.webp",
					"docs/readme/assets.json",
					"docs/readme/stray.png",
				],
			}),
		);

		expect(assessment.problems).toHaveLength(2);
		expect(assessment.problems.join("\n")).toContain("src/gone");
		expect(assessment.problems.join("\n")).toContain("docs/readme/stray.png");
	});
});

function manifestIn(document: unknown): () => ReadmeManifest {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-readme-manifest-"));
	fs.mkdirSync(path.join(root, "docs/readme"), { recursive: true });
	fs.writeFileSync(path.join(root, "docs/readme/assets.json"), JSON.stringify(document));
	return () => {
		try {
			return readManifest(root);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	};
}

describe("README asset manifest", () => {
	test("refuses an asset whose command does not make it", () => {
		const read = manifestIn({
			about: "",
			assets: [asset("hero", { command: "bun run readme:assets plan" })],
		});
		expect(read).toThrow();
	});

	test("refuses a file two assets write", () => {
		const read = manifestIn({
			about: "",
			assets: [asset("hero"), asset("plan", { files: ["docs/readme/hero.webp"] })],
		});
		expect(read).toThrow();
	});

	test("the tracked manifest holds one entry for each producer, and they agree", () => {
		const manifest = readManifest(repoRoot);

		expect(manifest.assets.map((one) => one.name).toSorted()).toEqual(
			Object.keys(PRODUCERS).toSorted(),
		);
		expect(manifest.assets.flatMap((one) => disagreements(one, PRODUCERS[one.name]))).toEqual([]);
	});

	test("every source of the tracked manifest covers a file, so its hash sees what it names", () => {
		const manifest = readManifest(repoRoot);
		const hasher = new SourceHasher(repoRoot, checkoutFiles(repoRoot));

		expect(manifest.assets.flatMap((one) => hasher.unmatched(one.sources))).toEqual([]);
	});
});
