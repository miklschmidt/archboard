import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dir, "../../..");
const preload = path.join(repoRoot, "tests/system/repository-policy/support/test-preload.ts");
const helperUrl = pathToFileURL(
	path.join(repoRoot, "tests/system/repository-policy/support/test-wall-clock.ts"),
).href;

test("the real preload composes elapsed failures with test and cleanup failures", () => {
	using resources = new DisposableStack();
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-wall-clock-preload-"));
	resources.defer(() => fs.rmSync(root, { recursive: true, force: true }));
	const clockPreload = path.join(root, "controlled-clock.ts");
	const fixture = path.join(root, "lifecycle.test.ts");
	fs.writeFileSync(
		clockPreload,
		`let elapsedNs = 0;
const controlledMonotonic = () => {
  const observed = elapsedNs;
  elapsedNs += 25_000_000_000;
  return observed;
};
Bun.nanoseconds = controlledMonotonic;
`,
	);
	fs.writeFileSync(
		fixture,
		`import { afterEach, describe, jest, test } from "bun:test";
import { declareTestWallClockBudget } from ${JSON.stringify(helperUrl)};

const TEST_FIXTURE_REAL_TIME_OWNER_MS = 30_000;
let failCleanup = false;

afterEach(() => {
  if (!failCleanup) return;
  failCleanup = false;
  throw new Error("original cleanup failure remains visible");
});

test("approved slow owner", () => {
  declareTestWallClockBudget({
    test: "approved slow owner",
    reason: "Controlled lifecycle fixture.",
    outerBoundMs: TEST_FIXTURE_REAL_TIME_OWNER_MS,
    task: "TASK-148.07",
    evidence: "Injected 25,000 ms without sleeping.",
  });
  jest.useFakeTimers();
  Bun.nanoseconds = () => 0;
  jest.useRealTimers();
});

test("unapproved slow neighbor", () => {});

describe("nested lifecycle", () => {
  test("failing slow owner", () => {
    failCleanup = true;
    throw new Error("original test failure remains visible");
  });
});
`,
	);

	const child = Bun.spawnSync({
		cmd: [
			process.execPath,
			"test",
			"--no-orphans",
			"--max-concurrency=1",
			"--preload",
			clockPreload,
			"--preload",
			preload,
			fixture,
		],
		cwd: root,
		env: { ...process.env, NO_COLOR: "1" },
		stdout: "pipe",
		stderr: "pipe",
		timeout: 5_000,
	});
	const output = `${child.stdout.toString()}\n${child.stderr.toString()}`;
	expect(child.exitCode).toBe(1);
	expect(child.signalCode ?? null).toBeNull();
	expect(output).toContain("(pass) approved slow owner");
	expect(output).toContain("(fail) unapproved slow neighbor");
	expect(output).toContain("(fail) nested lifecycle > failing slow owner");
	expect(
		output.match(/Slow test "the Bun test named by this failure" took 25000\.00 ms/g),
	).toHaveLength(2);
	expect(output).toContain("original test failure remains visible");
	expect(output).toContain("original cleanup failure remains visible");
	expect(output).not.toContain('Slow test "approved slow owner"');
	expect(output).toContain("1 pass");
	expect(output).toContain("2 fail");
}, 5_000);
