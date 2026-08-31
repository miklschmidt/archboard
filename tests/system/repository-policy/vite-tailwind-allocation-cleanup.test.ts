import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	watch,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TEST_VITE_TAILWIND_ALLOCATION_CASE_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";
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
	test(
		"external root watcher cannot interrupt before ownership registration",
		async () => {
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
		},
		TEST_VITE_TAILWIND_ALLOCATION_CASE_TIMEOUT_MS,
	);

	test("one concurrent owner cannot remove another owner or a prefixed sibling", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-shared-parent-"));
		const userOwnedName = "archboard-vite-tailwind-user-owned";
		const userOwned = join(parent, userOwnedName);
		writeFileSync(userOwned, "keep me");
		const children: FixtureChild[] = [];
		let resolveBoth: (() => void) | undefined;
		const bothRoots = new Promise<void>((resolve) => {
			resolveBoth = resolve;
		});
		const watcher = watch(parent, (_event, filename) => {
			if (!filename?.toString().startsWith("archboard-vite-tailwind-")) return;
			const roots = prefixedFixtureRoots(parent).filter((name) => name !== userOwnedName);
			if (roots.length >= 2) resolveBoth?.();
		});
		try {
			await withPrimaryAndCleanup(
				async () => {
					const first = runAllocationProbe(parent);
					const second = runAllocationProbe(parent);
					children.push(first, second);
					await bothRoots;
					first.kill("SIGTERM");
					expect(await first.exited).toBe(143);
					expect(second.exitCode).toBeNull();
					const liveRoots = prefixedFixtureRoots(parent).filter((name) => name !== userOwnedName);
					expect(liveRoots).toHaveLength(1);
					expect(existsSync(join(parent, liveRoots[0]!, "node_modules"))).toBe(true);
					expect(readlinkSync(join(parent, liveRoots[0]!, "node_modules"))).toBe(
						join(repoRoot, "node_modules"),
					);
					expect(readFileSync(userOwned, "utf8")).toBe("keep me");
					second.kill("SIGTERM");
					expect(await second.exited).toBe(143);
					expect(prefixedFixtureRoots(parent)).toEqual([userOwnedName]);
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
	});
});
