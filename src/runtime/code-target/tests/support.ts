import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ResolverFixture {
	root: string;
	checkout: string;
	repository: string;
	registry: string;
	outside: string;
	dispose(): void;
}

function git(cwd: string, ...args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd, stdout: "ignore", stderr: "pipe" });
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

export function createResolverFixture(): ResolverFixture {
	const root = mkdtempSync(join(tmpdir(), "archboard-code-target-"));
	const checkout = join(root, "checkout");
	const outside = join(root, "outside");
	const registry = join(root, "state", "repos.json");
	const repository = "github.com/acme/payments";
	mkdirSync(join(checkout, "src", "nested"), { recursive: true });
	mkdirSync(outside);
	writeFileSync(join(checkout, "src", "index.ts"), "export {};\n");
	writeFileSync(join(outside, "secret.ts"), "secret\n");
	git(checkout, "init", "-q");
	git(checkout, "remote", "add", "origin", `https://${repository}.git`);
	symlinkSync("index.ts", join(checkout, "src", "inside-file.ts"));
	symlinkSync("nested", join(checkout, "src", "inside-directory"));
	symlinkSync(join(outside, "secret.ts"), join(checkout, "src", "outside-file.ts"));
	symlinkSync(outside, join(checkout, "src", "outside-directory"));
	mkdirSync(join(root, "state"), { recursive: true });
	writeFileSync(
		registry,
		JSON.stringify([
			{ repository, repo: repository, root: checkout, source: "declared", addedAt: "2026-01-01" },
		]),
	);
	return {
		root,
		checkout,
		repository,
		registry,
		outside,
		dispose: () => rmSync(root, { recursive: true }),
	};
}
