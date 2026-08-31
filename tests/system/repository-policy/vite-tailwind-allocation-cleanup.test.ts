import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, watch } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	prefixedFixtureRoots,
	reapChild,
	runCleanupSteps,
	withPrimaryAndCleanup,
	type FixtureChild,
} from "./support/vite-tailwind-fixture.ts";

const repoRoot = process.cwd();
const supportPath = join(
	repoRoot,
	"tests/system/repository-policy/support/vite-tailwind-fixture.ts",
);

function runAllocationProbe(parent: string): FixtureChild {
	const script = `(async () => {
	const { runOwnedViteTailwindAllocationProbe } = await import(${JSON.stringify(`file://${supportPath}`)});
	await runOwnedViteTailwindAllocationProbe({
		parent: ${JSON.stringify(parent)},
		dependenciesRoot: ${JSON.stringify(repoRoot)},
	});
})().catch(() => process.exit(1));`;
	return Bun.spawn(["bun", "-e", script], {
		cwd: parent,
		stdin: "pipe",
		stdout: "ignore",
		stderr: "pipe",
	});
}

function checkoutStatus(): string {
	return execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
}

describe("Vite Tailwind allocation cleanup", () => {
	test("external root watcher cannot interrupt before ownership registration", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-allocation-watch-"));
		const before = checkoutStatus();
		const children: FixtureChild[] = [];
		let currentChild: FixtureChild | undefined;
		let resolveRoot: (() => void) | undefined;
		let watcherSignals = 0;
		const watcher = watch(parent, (_event, filename) => {
			const name = filename?.toString() ?? "";
			if (!name.startsWith("archboard-vite-tailwind-")) return;
			if (currentChild === undefined) return;
			const signal = children.length % 2 === 0 ? "SIGINT" : "SIGTERM";
			watcherSignals += 1;
			currentChild.kill(signal);
			currentChild = undefined;
			resolveRoot?.();
			resolveRoot = undefined;
		});
		try {
			await withPrimaryAndCleanup(
				async () => {
					for (let index = 0; index < 200; index += 1) {
						const rootAppeared = new Promise<void>((resolve) => {
							resolveRoot = resolve;
						});
						currentChild = runAllocationProbe(parent);
						children.push(currentChild);
						await rootAppeared;
						await children.at(-1)!.exited;
					}
					expect(watcherSignals).toBe(200);
					expect(children.map((child) => child.exitCode)).toEqual(
						children.map((_child, index) => (index % 2 === 0 ? 143 : 130)),
					);
					expect(prefixedFixtureRoots(parent)).toEqual([]);
				},
				async () =>
					runCleanupSteps([
						() => watcher.close(),
						() => Promise.all(children.map(reapChild)).then(() => undefined),
						() => rmSync(parent, { recursive: true, force: true }),
					]),
			);
		} finally {
			watcher.close();
			await Promise.all(children.map(reapChild));
			rmSync(parent, { recursive: true, force: true });
		}
		expect(checkoutStatus()).toBe(before);
	}, 30000);
});
