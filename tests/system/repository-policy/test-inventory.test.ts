import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	BROWSER_ADAPTER_PATH,
	BROWSER_TEST_PATHS,
	validateBrowserSelection,
} from "../browser/run-browser-lane.ts";
import { browserCleanupObservationMs, pollUntil } from "../browser/support/agent-browser.ts";
import {
	TEST_BROWSER_COMMAND_TIMEOUT_MS,
	TEST_BROWSER_POLL_MS,
} from "../../../src/shared/timing/timing.ts";
import {
	discoverNativeTests,
	inspectTestInventory,
	inspectWorkflow,
	type InventoryInput,
} from "./support/test-inventory.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const packageAdapter = `bun ${BROWSER_ADAPTER_PATH} ${BROWSER_TEST_PATHS.join(" ")}`;
const focusAdapter = (files: readonly string[]): string =>
	`bun ${BROWSER_ADAPTER_PATH} --focus ${files.join(" ")}`;

function input(overrides: Partial<InventoryInput> = {}): InventoryInput {
	return {
		repoRoot,
		scripts: {
			check: "bun run lint && bun run fmt:check && bun run test",
			test: "bun run test:modules && bun run test:system && bun run test:repository && bun run test:serial-browser",
			"test:modules": "bun test --isolate src",
			"test:system":
				"bun test --isolate --max-concurrency=1 tests/system/support tests/system/boards tests/system/label-geometry tests/system/cli tests/system/board-inspection tests/system/canvas-state tests/system/process-contracts tests/system/code-targets",
			"test:repository": "bun test --isolate tests/system/repository-policy",
			"test:serial-browser": packageAdapter,
		},
		nativeTests: [
			"tests/system/repository-policy/skills.test.ts",
			"tests/system/repository-policy/test-inventory.test.ts",
			"tests/system/code-targets/activation-contract.test.ts",
			"tests/system/browser/opener-settings.test.ts",
		],
		...overrides,
	};
}

describe("test inventory policy", () => {
	test("accepts the four final native lanes", () => {
		expect(inspectTestInventory(input()).errors).toEqual([]);
	});

	test("rejects a package test lane absent from the push chain", () => {
		const fixture = input();
		const testChain = fixture.scripts.test;
		if (!testChain) throw new Error("fixture test chain is missing");
		fixture.scripts.test = testChain.replace(" && bun run test:system", "");
		expect(inspectTestInventory(fixture).errors).toContain(
			"package test lane `test:system` is absent from `check`",
		);
	});

	test("rejects a native test owned by no lane", () => {
		const fixture = input({ nativeTests: ["tests/system/orphan.test.ts"] });
		expect(inspectTestInventory(fixture).errors).toContain(
			"native test `tests/system/orphan.test.ts` belongs to no package lane",
		);
	});

	test("rejects a native test reachable through multiple lanes", () => {
		const fixture = input();
		fixture.scripts["test:system"] += " tests/system/repository-policy/test-inventory.test.ts";
		expect(inspectTestInventory(fixture).errors).toContain(
			"native test `tests/system/repository-policy/test-inventory.test.ts` runs 2 times from `check` through package lanes: test:system (1), test:repository (1)",
		);
	});

	test("rejects a native test selected only by an unreachable verify script", () => {
		const fixture = input({ nativeTests: ["tests/system/orphan.test.ts"] });
		fixture.scripts["verify:orphan"] = "bun test tests/system/orphan.test.ts";
		expect(inspectTestInventory(fixture).errors).toContain(
			"native test `tests/system/orphan.test.ts` runs zero times from `check`; matching package lanes: verify:orphan",
		);
	});

	test("rejects a reachable non-test owner invoked twice", () => {
		const fixture = input({ nativeTests: ["tests/system/verify.test.ts"] });
		fixture.scripts["test:system"] = "bun test tests/system/verify.test.ts";
		fixture.scripts.test += " && bun run test:system";
		expect(inspectTestInventory(fixture).errors).toContain(
			"native test `tests/system/verify.test.ts` runs 2 times from `check` through package lanes: test:system (2)",
		);
	});

	test("rejects an extra transitional test key", () => {
		const fixture = input();
		fixture.scripts["test:legacy"] = "bun scripts/non-native-command.ts";
		fixture.scripts.test += " && bun run test:legacy";
		expect(inspectTestInventory(fixture).errors).toContain(
			"package test lane `test:legacy` is transitional; only test:modules, test:system, test:repository, and test:serial-browser are allowed",
		);
	});

	test("the real checkout reaches every native test exactly once", () => {
		const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		const result = inspectTestInventory({
			repoRoot,
			scripts: pkg.scripts,
			nativeTests: discoverNativeTests(repoRoot),
		});
		expect(result.errors).toEqual([]);
		expect(
			Object.keys(pkg.scripts)
				.filter((name) => name.startsWith("test:"))
				.toSorted(),
		).toEqual(["test:modules", "test:repository", "test:serial-browser", "test:system"]);
	});

	test("keeps the code-target system directory and opener browser owner once", () => {
		const fixture = input();
		const system = fixture.scripts["test:system"]!;
		const browser = fixture.scripts["test:serial-browser"]!;
		expect(system.match(/tests\/system\/code-targets/g)).toHaveLength(1);
		expect(browser.match(/tests\/system\/browser\/opener-settings\.test\.ts/g)).toHaveLength(1);
		expect(inspectTestInventory(fixture).errors).toEqual([]);
	});
	test("rejects missing, duplicate, reordered, and wrong-lane new owners", () => {
		const missing = input();
		missing.scripts["test:system"] = missing.scripts["test:system"]!.replace(
			" tests/system/code-targets",
			"",
		);
		expect(inspectTestInventory(missing).errors).toContain(
			"native test `tests/system/code-targets/activation-contract.test.ts` belongs to no package lane",
		);

		const duplicate = input();
		duplicate.scripts["test:modules"] += " tests/system/code-targets";
		expect(inspectTestInventory(duplicate).errors).toContain(
			"native test `tests/system/code-targets/activation-contract.test.ts` runs 2 times from `check` through package lanes: test:modules (1), test:system (1)",
		);

		const reordered = input();
		reordered.scripts["test:serial-browser"] = packageAdapter.replace(
			"tests/system/browser/claim-interaction.test.ts tests/system/browser/opener-settings.test.ts",
			"tests/system/browser/opener-settings.test.ts tests/system/browser/claim-interaction.test.ts",
		);
		expect(inspectTestInventory(reordered).errors[0]).toContain(
			"Focused browser paths are not in canonical relative order.",
		);

		const wrongLane = input();
		wrongLane.scripts["test:system"] += " tests/system/browser/opener-settings.test.ts";
		expect(inspectTestInventory(wrongLane).errors).toContain(
			"native test `tests/system/browser/opener-settings.test.ts` runs 2 times from `check` through package lanes: test:system (1), test:serial-browser (1)",
		);
	});
});

function adapterInput(
	command: string,
	nativeTests: string[] = [...BROWSER_TEST_PATHS],
): InventoryInput {
	return {
		repoRoot,
		scripts: {
			check: "bun run test",
			test: "bun run test:serial-browser",
			"test:serial-browser": command,
		},
		nativeTests,
	};
}

describe("typed serial browser adapter selection", () => {
	test("accepts only the complete package form and ordered focused subsets", () => {
		expect(validateBrowserSelection(packageAdapter.split(" "))).toEqual({
			mode: "package",
			files: [...BROWSER_TEST_PATHS],
		});
		expect(
			validateBrowserSelection(
				focusAdapter([BROWSER_TEST_PATHS[1], BROWSER_TEST_PATHS[5], BROWSER_TEST_PATHS[12]]).split(
					" ",
				),
			),
		).toEqual({
			mode: "focus",
			files: [BROWSER_TEST_PATHS[1], BROWSER_TEST_PATHS[5], BROWSER_TEST_PATHS[12]],
		});
	});

	test("rejects missing, duplicate, reordered, unknown, directory, and recursive selectors", () => {
		const invalid = [
			`bun ${BROWSER_ADAPTER_PATH} ${BROWSER_TEST_PATHS.slice(0, -1).join(" ")}`,
			focusAdapter([BROWSER_TEST_PATHS[0], BROWSER_TEST_PATHS[0]]),
			focusAdapter([BROWSER_TEST_PATHS[2], BROWSER_TEST_PATHS[1]]),
			focusAdapter(["tests/system/browser/not-an-owner.test.ts"]),
			focusAdapter(["tests/system/browser"]),
			focusAdapter(["tests/system/browser/**/*.test.ts"]),
		];
		for (const command of invalid)
			expect(() => validateBrowserSelection(command.split(" "))).toThrow();
	});

	test("rejects changed, random, shard, missing-focus, and every extra argument form", () => {
		const invalid = [
			`bun ${BROWSER_ADAPTER_PATH} --focus`,
			focusAdapter([BROWSER_TEST_PATHS[0]]) + " --changed",
			focusAdapter([BROWSER_TEST_PATHS[0]]) + " --randomize",
			focusAdapter([BROWSER_TEST_PATHS[0]]) + " --shard=1/2",
			focusAdapter([BROWSER_TEST_PATHS[0]]) + " extra",
			`bun ${BROWSER_ADAPTER_PATH} --changed ${BROWSER_TEST_PATHS.join(" ")}`,
		];
		for (const command of invalid)
			expect(() => validateBrowserSelection(command.split(" "))).toThrow();
	});

	test("inventory accepts every package adapter occurrence exactly once", () => {
		const result = inspectTestInventory(adapterInput(packageAdapter));
		expect(result.errors).toEqual([]);
		expect(result.nativeLanes.get("test:serial-browser")).toEqual([...BROWSER_TEST_PATHS]);
	});

	test("inventory rejects a missing package owner", () => {
		const command = `bun ${BROWSER_ADAPTER_PATH} ${BROWSER_TEST_PATHS.slice(0, -1).join(" ")}`;
		expect(inspectTestInventory(adapterInput(command)).errors).toContain(
			"browser adapter lane `test:serial-browser` is invalid: Package browser lane must name all 14 canonical paths in order.",
		);
	});

	test("inventory rejects a duplicate adapter argument instead of collapsing it", () => {
		const command = focusAdapter([BROWSER_TEST_PATHS[0], BROWSER_TEST_PATHS[0]]);
		expect(inspectTestInventory(adapterInput(command, [BROWSER_TEST_PATHS[0]])).errors).toContain(
			`browser adapter lane \`test:serial-browser\` is invalid: Browser lane repeats \`${BROWSER_TEST_PATHS[0]}\`.`,
		);
	});

	test("inventory rejects reordered and unknown adapter arguments", () => {
		const reordered = focusAdapter([BROWSER_TEST_PATHS[1], BROWSER_TEST_PATHS[0]]);
		const unknown = focusAdapter(["tests/system/browser/unknown.test.ts"]);
		expect(inspectTestInventory(adapterInput(reordered)).errors[0]).toContain(
			"Focused browser paths are not in canonical relative order.",
		);
		expect(inspectTestInventory(adapterInput(unknown)).errors[0]).toContain(
			"Browser lane names unknown path `tests/system/browser/unknown.test.ts`.",
		);
	});

	test("inventory rejects an unreachable valid focused adapter", () => {
		const file = BROWSER_TEST_PATHS[3];
		const fixture = adapterInput("bun scripts/non-native.mjs", [file]);
		fixture.scripts["verify:browser"] = focusAdapter([file]);
		expect(inspectTestInventory(fixture).errors).toContain(
			`native test \`${file}\` runs zero times from \`check\`; matching package lanes: verify:browser`,
		);
	});

	test("inventory rejects one focused adapter reached twice", () => {
		const file = BROWSER_TEST_PATHS[3];
		const fixture = adapterInput(focusAdapter([file]), [file]);
		fixture.scripts.test = "bun run test:serial-browser && bun run test:serial-browser";
		expect(inspectTestInventory(fixture).errors).toContain(
			`native test \`${file}\` runs 2 times from \`check\` through package lanes: test:serial-browser (2)`,
		);
	});

	test("ordinary selector occurrences remain countable", () => {
		const file = "tests/system/example.test.ts";
		const fixture = adapterInput(`bun test ${file} ${file}`, [file]);
		expect(inspectTestInventory(fixture).errors).toContain(
			`native test \`${file}\` runs 2 times from \`check\` through package lanes: test:serial-browser (2)`,
		);
	});
});

interface BundleSnapshot {
	exists: boolean;
	mtimeMs?: number;
	size?: number;
}

function bundleSnapshot(): BundleSnapshot {
	const bundle = path.join(repoRoot, "dist/frontend/index.html");
	if (!fs.existsSync(bundle)) return { exists: false };
	const stat = fs.statSync(bundle);
	return { exists: true, mtimeMs: stat.mtimeMs, size: stat.size };
}

function prerequisiteFixture(withAgentBrowser: boolean): {
	root: string;
	bin: string;
	temporary: string;
	versionMarker: string;
	unexpectedMarker: string;
} {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "archboard-browser-preflight-"));
	const bin = path.join(root, "bin");
	const temporary = path.join(root, "tmp");
	fs.mkdirSync(bin);
	fs.mkdirSync(temporary);
	fs.symlinkSync(process.execPath, path.join(bin, "bun"));
	const versionMarker = path.join(root, "agent-browser-version");
	const unexpectedMarker = path.join(root, "agent-browser-unexpected");
	if (withAgentBrowser) {
		const executable = path.join(bin, "agent-browser");
		fs.writeFileSync(
			executable,
			`#!/bin/sh\nif [ "$1" = "--version" ]; then : > "${versionMarker}"; exit 0; fi\n: > "${unexpectedMarker}"\nexit 97\n`,
		);
		fs.chmodSync(executable, 0o755);
	}
	return { root, bin, temporary, versionMarker, unexpectedMarker };
}

function runPrerequisiteNegative(withAgentBrowser: boolean): void {
	const fixture = prerequisiteFixture(withAgentBrowser);
	const beforeBundle = bundleSnapshot();
	try {
		const file = withAgentBrowser ? BROWSER_TEST_PATHS[0] : BROWSER_TEST_PATHS[1];
		const result = Bun.spawnSync({
			cmd: ["bun", BROWSER_ADAPTER_PATH, "--focus", file],
			cwd: repoRoot,
			env: {
				PATH: fixture.bin,
				TMPDIR: fixture.temporary,
				LANG: "C.UTF-8",
				LC_ALL: "C.UTF-8",
				NO_COLOR: "1",
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode).toBe(2);
		expect(result.signalCode).toBeUndefined();
		expect(fs.readdirSync(fixture.temporary)).toEqual([]);
		expect(fs.existsSync(fixture.unexpectedMarker)).toBeFalse();
		expect(bundleSnapshot()).toEqual(beforeBundle);
		if (withAgentBrowser) expect(fs.existsSync(fixture.versionMarker)).toBeTrue();
	} finally {
		fs.rmSync(fixture.root, { recursive: true, force: true });
	}
}

describe("browser adapter prerequisite outcomes", () => {
	test("missing agent-browser exits 2 before build or owner acquisition", () => {
		runPrerequisiteNegative(false);
	});

	test("missing strace exits 2 before the human owner acquires anything", () => {
		runPrerequisiteNegative(true);
	});
});

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

describe("browser adapter interruption and cleanup timing", () => {
	for (const [signal, exitCode] of [
		["SIGINT", 130],
		["SIGTERM", 143],
	] as const) {
		test(
			`handles ${signal} while a retained pre-owner build is blocked`,
			async () => {
				const fixture = prerequisiteFixture(true);
				const blocker = path.join(fixture.root, "blocked-build.ts");
				const pidsFile = path.join(fixture.root, "build-pids.json");
				const termMarker = path.join(fixture.root, "build-term");
				fs.writeFileSync(
					blocker,
					`import { writeFileSync } from "node:fs";
process.on("SIGTERM", () => writeFileSync(${JSON.stringify(termMarker)}, "TERM"));
writeFileSync(${JSON.stringify(pidsFile)}, JSON.stringify([process.pid]));
setInterval(() => {}, ${TEST_BROWSER_POLL_MS});
`,
				);
				const adapter = Bun.spawn({
					cmd: ["bun", BROWSER_ADAPTER_PATH, "--focus", BROWSER_TEST_PATHS[1]],
					cwd: repoRoot,
					env: {
						PATH: fixture.bin,
						TMPDIR: fixture.temporary,
						LANG: "C.UTF-8",
						LC_ALL: "C.UTF-8",
						NO_COLOR: "1",
						ARCHBOARD_TEST_BROWSER_BUILD_FIXTURE: blocker,
					},
					stdout: "ignore",
					stderr: "pipe",
				});
				let ownedPids: number[] = [];
				try {
					await pollUntil(
						() => fs.existsSync(pidsFile),
						Boolean,
						"blocked frontend build to publish its pids",
					);
					ownedPids = JSON.parse(fs.readFileSync(pidsFile, "utf8")) as number[];
					process.kill(adapter.pid, signal);
					expect(await adapter.exited).toBe(exitCode);
					const stderr = await new Response(adapter.stderr).text();
					expect(stderr).toContain(`Browser lane interrupted by ${signal}.`);
					expect(fs.readFileSync(termMarker, "utf8")).toBe("TERM");
					const runnerSource = fs.readFileSync(path.join(repoRoot, BROWSER_ADAPTER_PATH), "utf8");
					expect(runnerSource).toContain('process.kill(-child.pid, "SIGKILL")');
					await pollUntil(
						() => ownedPids.filter(processExists),
						(alive) => alive.length === 0,
						"interrupted frontend build process group to disappear",
					);
					expect(fs.readdirSync(fixture.temporary)).toEqual([]);
					expect(fs.existsSync(fixture.unexpectedMarker)).toBeFalse();
				} finally {
					if (adapter.exitCode === null) adapter.kill("SIGKILL");
					await adapter.exited;
					for (const pid of ownedPids) if (processExists(pid)) process.kill(pid, "SIGKILL");
					fs.rmSync(fixture.root, { recursive: true, force: true });
				}
			},
			TEST_BROWSER_COMMAND_TIMEOUT_MS,
		);
	}

	test("observes through idle expiry and samples once at the deadline", async () => {
		expect(browserCleanupObservationMs(String(TEST_BROWSER_COMMAND_TIMEOUT_MS))).toBe(
			TEST_BROWSER_COMMAND_TIMEOUT_MS + TEST_BROWSER_POLL_MS,
		);
		let samples = 0;
		const accepted = await pollUntil(
			() => ++samples,
			(value) => value === 2,
			"deadline sample",
			{ timeoutMs: TEST_BROWSER_POLL_MS, intervalMs: TEST_BROWSER_POLL_MS * 2 },
		);
		expect(accepted).toBe(2);
	});
});

describe("browser predecessor oracle guards", () => {
	test("keeps the same-run relative performance diagnostic", () => {
		const source = fs.readFileSync(
			path.join(repoRoot, "tests/system/browser/human-edit-performance.test.ts"),
			"utf8",
		);
		expect(source).toContain("expect(worstReportGap).toBeLessThanOrEqual(median * 8);");
		expect(source).not.toMatch(/worstReportGap\)\.toBeLessThanOrEqual\(\d+/);
	});

	test("keeps the typed recorder and both final-note leaves together", () => {
		const source = fs.readFileSync(
			path.join(repoRoot, "tests/system/browser/typed-text.test.ts"),
			"utf8",
		);
		expect(source).toContain("expect(renameable).toHaveLength(0);");
		expect(source).toContain("expect(postedTextIds.has(drawnText!.id)).toBe(true);");
		expect(source).toContain("expect(postedTextIds.has(label!.id)).toBe(true);");
		expect(source).toContain("expect(note.includes(`hello world ^${drawnText!.id}`)).toBe(true);");
		expect(source).toContain("expect(note.includes(`ABCDEFGHIJ ^${label!.id}`)).toBe(true);");
	});
});

describe("CI workflow policy", () => {
	const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");

	test("the real workflow runs the complete check gate", () => {
		expect(inspectWorkflow(workflow).filter((error) => error.includes("does not run"))).toEqual([]);
	});

	test("the real workflow does not name test lanes directly", () => {
		expect(inspectWorkflow(workflow).filter((error) => error.includes("by name"))).toEqual([]);
	});

	test("reports the predecessor workflow diagnostics exactly", () => {
		expect(inspectWorkflow("run: bun run test:browser\n")).toEqual([
			"the workflow does not run `bun run check`, so lint, format, and the suite are not a push gate.",
			"the workflow runs `test:browser` by name, and the chain already runs it. Naming suites one at a time in the workflow is how it fell behind before.",
		]);
	});
});
