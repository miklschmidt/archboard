import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readlinkSync,
	rmSync,
	watch,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
	TEST_VITE_TAILWIND_ALLOCATION_CASE_TIMEOUT_MS,
	TEST_VITE_TAILWIND_ROOT_OBSERVATION_POLL_MS,
	TEST_VITE_TAILWIND_ROOT_OBSERVATION_TIMEOUT_MS,
} from "../../../src/shared/timing/timing.ts";
import {
	childLineReader,
	childStdout,
	createViteTailwindFixture,
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
		stdout: "pipe",
		stderr: "pipe",
	});
}

async function readAllocatedRoot(child: FixtureChild): Promise<string> {
	const line = await childLineReader(childStdout(child))();
	if (!line.startsWith("ALLOCATED ")) throw new Error(`Unexpected allocation line: ${line}`);
	return line.slice("ALLOCATED ".length);
}

async function waitForExactRoot(root: string, wakeOnWatch: () => Promise<void>): Promise<void> {
	const deadline = Date.now() + TEST_VITE_TAILWIND_ROOT_OBSERVATION_TIMEOUT_MS;
	while (!existsSync(root)) {
		if (Date.now() >= deadline) throw new Error(`Fixture root did not appear: ${root}`);
		await Promise.race([Bun.sleep(TEST_VITE_TAILWIND_ROOT_OBSERVATION_POLL_MS), wakeOnWatch()]);
	}
}

function checkoutStatus(): string {
	return execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
}

describe("Vite Tailwind allocation cleanup", () => {
	test("pre-create async disposal cleans a root created after registration", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-precreate-dispose-"));
		let candidate = "";
		try {
			let failure: unknown;
			try {
				await createViteTailwindFixture(parent, repoRoot, {
					onAllocated: (fixture) => {
						candidate = fixture.root;
						expect(existsSync(candidate)).toBe(false);
						void fixture.dispose();
					},
				});
			} catch (error) {
				failure = error;
			}
			expect((failure as Error).message).toContain("stopped during setup");
			expect(existsSync(candidate)).toBe(false);
			expect(prefixedFixtureRoots(parent)).toEqual([]);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test("retires a colliding candidate before creating the next exact root", async () => {
		const parent = mkdtempSync(join(tmpdir(), "archboard-vite-candidate-collision-"));
		const occupied = join(parent, "archboard-vite-tailwind-occupied");
		const retry = join(parent, "archboard-vite-tailwind-retry");
		mkdirSync(occupied);
		const candidates = [occupied, retry];
		const allocated: string[] = [];
		const retired: string[] = [];
		try {
			const fixture = await createViteTailwindFixture(
				parent,
				repoRoot,
				{
					onAllocated: (value) => allocated.push(value.root),
					onAllocationRetired: (value) => retired.push(value.root),
				},
				() => candidates.shift()!,
			);
			try {
				expect(allocated).toEqual([occupied, retry]);
				expect(retired).toEqual([occupied]);
				expect(existsSync(occupied)).toBe(true);
				expect(existsSync(fixture.root)).toBe(true);
			} finally {
				await fixture.dispose();
			}
			expect(existsSync(occupied)).toBe(true);
			expect(existsSync(retry)).toBe(false);
		} finally {
			rmSync(parent, { recursive: true, force: true });
		}
	});

	test(
		"external root watcher cannot interrupt before ownership registration",
		async () => {
			const parent = mkdtempSync(join(tmpdir(), "archboard-vite-allocation-watch-"));
			const before = checkoutStatus();
			const children: FixtureChild[] = [];
			let currentChild: FixtureChild | undefined;
			let currentRoot: string | undefined;
			let resolveWatchWake: (() => void) | undefined;
			const allocatedRoots: string[] = [];
			const observedRoots = new Set<string>();
			let watchEvents = 0;
			const watcher = watch(parent, (_event, filename) => {
				const name = filename?.toString() ?? "";
				if (!name.startsWith("archboard-vite-tailwind-")) return;
				watchEvents += 1;
				if (currentRoot === join(parent, name)) resolveWatchWake?.();
			});
			try {
				await withPrimaryAndCleanup(
					async () => {
						for (let index = 0; index < 200; index += 1) {
							currentChild = runAllocationProbe(parent);
							children.push(currentChild);
							const allocatedRoot = await readAllocatedRoot(currentChild);
							expect(dirname(allocatedRoot)).toBe(parent);
							allocatedRoots.push(basename(allocatedRoot));
							currentRoot = allocatedRoot;
							await waitForExactRoot(
								allocatedRoot,
								() =>
									new Promise<void>((resolve) => {
										resolveWatchWake = resolve;
									}),
							);
							observedRoots.add(basename(allocatedRoot));
							const owner = currentChild;
							currentChild = undefined;
							currentRoot = undefined;
							owner.kill(index % 2 === 0 ? "SIGTERM" : "SIGINT");
							await owner.exited;
						}
						expect(watchEvents).toBeGreaterThan(0);
						expect(new Set(allocatedRoots).size).toBe(200);
						expect([...observedRoots].toSorted()).toEqual([...new Set(allocatedRoots)].toSorted());
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
					const [firstAllocated, secondAllocated] = await Promise.all([
						readAllocatedRoot(first),
						readAllocatedRoot(second),
					]);
					expect(dirname(firstAllocated)).toBe(parent);
					expect(dirname(secondAllocated)).toBe(parent);
					expect(firstAllocated).not.toBe(secondAllocated);
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
