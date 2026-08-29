import { describe, expect, test } from "bun:test";
import fs from "node:fs";
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
	browserBundleSnapshot,
	createBrowserPreflightFixture,
	inspectTestInventory,
	inspectWorkflow,
	installFakeAgentBrowser,
	processExists,
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

function expectInventoryError(fixture: InventoryInput, message: string): void {
	expect(inspectTestInventory(fixture).errors).toContain(message);
}

describe("test inventory policy", () => {
	test("accepts the final lanes and rejects ownership drift", () => {
		expect(inspectTestInventory(input()).errors).toEqual([]);
		const fixture = input();
		fixture.scripts.test = fixture.scripts.test!.replace(" && bun run test:system", "");
		expectInventoryError(fixture, "package test lane `test:system` is absent from `check`");

		const orphan = input({ nativeTests: ["tests/system/orphan.test.ts"] });
		expectInventoryError(
			orphan,
			"native test `tests/system/orphan.test.ts` belongs to no package lane",
		);

		const multiple = input();
		multiple.scripts["test:system"] += " tests/system/repository-policy/test-inventory.test.ts";
		expectInventoryError(
			multiple,
			"native test `tests/system/repository-policy/test-inventory.test.ts` runs 2 times from `check` through package lanes: test:system (1), test:repository (1)",
		);

		const unreachable = input({ nativeTests: ["tests/system/orphan.test.ts"] });
		unreachable.scripts["verify:orphan"] = "bun test tests/system/orphan.test.ts";
		expectInventoryError(
			unreachable,
			"native test `tests/system/orphan.test.ts` runs zero times from `check`; matching package lanes: verify:orphan",
		);

		const duplicate = input({ nativeTests: ["tests/system/verify.test.ts"] });
		duplicate.scripts["test:system"] = "bun test tests/system/verify.test.ts";
		duplicate.scripts.test += " && bun run test:system";
		expectInventoryError(
			duplicate,
			"native test `tests/system/verify.test.ts` runs 2 times from `check` through package lanes: test:system (2)",
		);

		const legacy = input();
		legacy.scripts["test:legacy"] = "bun scripts/non-native-command.ts";
		legacy.scripts.test += " && bun run test:legacy";
		expectInventoryError(
			legacy,
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

	test("keeps new system and browser owners once and rejects their drift", () => {
		const fixture = input();
		const system = fixture.scripts["test:system"]!;
		const browser = fixture.scripts["test:serial-browser"]!;
		expect(system.match(/tests\/system\/code-targets/g)).toHaveLength(1);
		expect(browser.match(/tests\/system\/browser\/opener-settings\.test\.ts/g)).toHaveLength(1);
		expect(inspectTestInventory(fixture).errors).toEqual([]);
		const missing = input();
		missing.scripts["test:system"] = missing.scripts["test:system"]!.replace(
			" tests/system/code-targets",
			"",
		);
		expectInventoryError(
			missing,
			"native test `tests/system/code-targets/activation-contract.test.ts` belongs to no package lane",
		);

		const duplicate = input();
		duplicate.scripts["test:modules"] += " tests/system/code-targets";
		expectInventoryError(
			duplicate,
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
		expectInventoryError(
			wrongLane,
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

	test("rejects incomplete, reordered, unknown, recursive, and extra argument forms", () => {
		const invalid = [
			`bun ${BROWSER_ADAPTER_PATH} ${BROWSER_TEST_PATHS.slice(0, -1).join(" ")}`,
			focusAdapter([BROWSER_TEST_PATHS[0], BROWSER_TEST_PATHS[0]]),
			focusAdapter([BROWSER_TEST_PATHS[2], BROWSER_TEST_PATHS[1]]),
			focusAdapter(["tests/system/browser/not-an-owner.test.ts"]),
			focusAdapter(["tests/system/browser"]),
			focusAdapter(["tests/system/browser/**/*.test.ts"]),
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

	test("inventory rejects missing, duplicate, reordered, and unknown adapter arguments", () => {
		const command = `bun ${BROWSER_ADAPTER_PATH} ${BROWSER_TEST_PATHS.slice(0, -1).join(" ")}`;
		expectInventoryError(
			adapterInput(command),
			"browser adapter lane `test:serial-browser` is invalid: Package browser lane must name all 15 canonical paths in order.",
		);

		const duplicate = focusAdapter([BROWSER_TEST_PATHS[0], BROWSER_TEST_PATHS[0]]);
		expectInventoryError(
			adapterInput(duplicate, [BROWSER_TEST_PATHS[0]]),
			`browser adapter lane \`test:serial-browser\` is invalid: Browser lane repeats \`${BROWSER_TEST_PATHS[0]}\`.`,
		);

		const reordered = focusAdapter([BROWSER_TEST_PATHS[1], BROWSER_TEST_PATHS[0]]);
		const unknown = focusAdapter(["tests/system/browser/unknown.test.ts"]);
		expect(inspectTestInventory(adapterInput(reordered)).errors[0]).toContain(
			"Focused browser paths are not in canonical relative order.",
		);
		expect(inspectTestInventory(adapterInput(unknown)).errors[0]).toContain(
			"Browser lane names unknown path `tests/system/browser/unknown.test.ts`.",
		);
	});

	test("inventory counts focused, duplicated, and ordinary selectors", () => {
		const file = BROWSER_TEST_PATHS[3];
		const fixture = adapterInput("bun scripts/non-native.mjs", [file]);
		fixture.scripts["verify:browser"] = focusAdapter([file]);
		expectInventoryError(
			fixture,
			`native test \`${file}\` runs zero times from \`check\`; matching package lanes: verify:browser`,
		);

		const duplicate = adapterInput(focusAdapter([file]), [file]);
		duplicate.scripts.test = "bun run test:serial-browser && bun run test:serial-browser";
		expectInventoryError(
			duplicate,
			`native test \`${file}\` runs 2 times from \`check\` through package lanes: test:serial-browser (2)`,
		);

		const ordinary = "tests/system/example.test.ts";
		expectInventoryError(
			adapterInput(`bun test ${ordinary} ${ordinary}`, [ordinary]),
			`native test \`${ordinary}\` runs 2 times from \`check\` through package lanes: test:serial-browser (2)`,
		);
	});
});

function prerequisiteFixture(withAgentBrowser: boolean) {
	const fixture = createBrowserPreflightFixture();
	if (withAgentBrowser) installFakeAgentBrowser(fixture);
	return fixture;
}

function runPrerequisiteNegative(withAgentBrowser: boolean, executablePath?: string): void {
	const fixture = prerequisiteFixture(withAgentBrowser);
	const beforeBundle = browserBundleSnapshot(repoRoot);
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
				AGENT_BROWSER_EXECUTABLE_PATH: executablePath ?? fixture.browserExecutable,
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode).toBe(2);
		expect(result.signalCode).toBeUndefined();
		expect(fs.readdirSync(fixture.temporary)).toEqual([]);
		expect(fs.existsSync(fixture.unexpectedMarker)).toBeFalse();
		expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
		if (withAgentBrowser) expect(fs.existsSync(fixture.versionMarker)).toBeTrue();
	} finally {
		fs.rmSync(fixture.root, { recursive: true, force: true });
	}
}

function runBrowserExecutableNegative(
	setup: (fixture: ReturnType<typeof prerequisiteFixture>) => string | undefined,
	diagnostic: string,
): void {
	const fixture = prerequisiteFixture(true);
	const beforeBundle = browserBundleSnapshot(repoRoot);
	try {
		const configured = setup(fixture);
		const result = Bun.spawnSync({
			cmd: ["bun", BROWSER_ADAPTER_PATH, "--focus", BROWSER_TEST_PATHS[1]],
			cwd: repoRoot,
			env: {
				PATH: fixture.bin,
				TMPDIR: fixture.temporary,
				...(configured === undefined ? {} : { AGENT_BROWSER_EXECUTABLE_PATH: configured }),
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(result.exitCode).toBe(2);
		expect(new TextDecoder().decode(result.stderr)).toContain(diagnostic);
		expect(fs.existsSync(fixture.versionMarker)).toBeFalse();
		expect(fs.readdirSync(fixture.temporary)).toEqual([]);
		expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
	} finally {
		fs.rmSync(fixture.root, { recursive: true, force: true });
	}
}

describe("browser adapter prerequisite outcomes", () => {
	test("missing command prerequisites exit 2 before build or owner acquisition", () => {
		runPrerequisiteNegative(false);
		runPrerequisiteNegative(true);
	});

	test("unusable configured browser executables exit 2 before build or owner acquisition", () => {
		runBrowserExecutableNegative(() => undefined, "AGENT_BROWSER_EXECUTABLE_PATH is missing");
		runBrowserExecutableNegative(() => "relative/chrome", "must be absolute");
		runBrowserExecutableNegative(() => "/missing/chrome", "does not exist");
		runBrowserExecutableNegative((fixture) => fixture.root, "is not a file");
		runBrowserExecutableNegative((fixture) => {
			fs.chmodSync(fixture.browserExecutable, 0o644);
			return fixture.browserExecutable;
		}, "is not executable");
	});

	test("forwards the exact absolute browser executable to an isolated owner", () => {
		const fixture = prerequisiteFixture(true);
		try {
			const ownerFixture = path.join(fixture.root, "owner.ts");
			fs.writeFileSync(
				ownerFixture,
				`Bun.write(${JSON.stringify(fixture.ownerPathMarker)}, process.env.AGENT_BROWSER_EXECUTABLE_PATH ?? "missing");`,
			);
			const result = Bun.spawnSync({
				cmd: ["bun", BROWSER_ADAPTER_PATH, "--focus", BROWSER_TEST_PATHS[1]],
				cwd: repoRoot,
				env: {
					PATH: fixture.bin,
					TMPDIR: fixture.temporary,
					AGENT_BROWSER_EXECUTABLE_PATH: fixture.browserExecutable,
					ARCHBOARD_TEST_BROWSER_OWNER_FIXTURE: ownerFixture,
				},
				stdout: "ignore",
				stderr: "pipe",
			});
			expect(result.exitCode).toBe(0);
			expect(fs.readFileSync(fixture.ownerPathMarker, "utf8")).toBe(fixture.browserExecutable);
		} finally {
			fs.rmSync(fixture.root, { recursive: true, force: true });
		}
	});
});

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
						AGENT_BROWSER_EXECUTABLE_PATH: fixture.browserExecutable,
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
	test("keeps the performance and typed-text predecessor oracles", () => {
		const performance = fs.readFileSync(
			path.join(repoRoot, "tests/system/browser/human-edit-performance.test.ts"),
			"utf8",
		);
		expect(performance).toContain("expect(worstReportGap).toBeLessThanOrEqual(median * 8);");
		expect(performance).not.toMatch(/worstReportGap\)\.toBeLessThanOrEqual\(\d+/);
		const typed = fs.readFileSync(
			path.join(repoRoot, "tests/system/browser/typed-text.test.ts"),
			"utf8",
		);
		expect(typed).toContain("expect(renameable).toHaveLength(0);");
		expect(typed).toContain("expect(postedTextIds.has(drawnText!.id)).toBe(true);");
		expect(typed).toContain("expect(postedTextIds.has(label!.id)).toBe(true);");
		expect(typed).toContain("expect(note.includes(`hello world ^${drawnText!.id}`)).toBe(true);");
		expect(typed).toContain("expect(note.includes(`ABCDEFGHIJ ^${label!.id}`)).toBe(true);");
	});
});

describe("CI workflow policy", () => {
	const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");

	test("the real workflow invokes only the complete check gate, exactly once", () => {
		expect(inspectWorkflow(workflow)).toEqual([]);
	});

	test("rejects missing, duplicate, build, and test package-script invocations", () => {
		expect(inspectWorkflow("run: true\n")).toEqual([
			"the workflow must invoke `bun run check` exactly once; found 0 invocations.",
		]);
		expect(inspectWorkflow("run: bun run check && bun run check\n")).toEqual([
			"the workflow must invoke `bun run check` exactly once; found 2 invocations.",
		]);
		for (const script of ["build", "test"]) {
			expect(inspectWorkflow(`run: bun run ${script}\nrun: bun run check\n`)).toEqual([
				`the workflow invokes package script \`${script}\` directly; \`bun run check\` must be its only package-script invocation.`,
			]);
		}
	});
});
