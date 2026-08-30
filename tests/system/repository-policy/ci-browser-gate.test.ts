import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	BROWSER_ADAPTER_PATH,
	BROWSER_TEST_PATHS,
	CI_EXCLUDED_BROWSER_OWNER_ENV,
	applyCiBrowserOwnerExclusion,
	validateBrowserSelection,
} from "../browser/run-browser-lane.ts";
import {
	browserBundleSnapshot,
	createBrowserPreflightFixture,
	inspectWorkflow,
	installFakeAgentBrowser,
} from "./support/test-inventory.ts";
import { TEST_HUMAN_PERFORMANCE_OPEN_TIMEOUT_MS } from "../../../src/shared/timing/timing.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const HOSTED_BROWSER_EXCLUSION = {
	CI: "true",
	ARCHBOARD_CI_EXCLUDED_BROWSER_OWNER: "tests/system/browser/human-edit-performance.test.ts",
} as const;
type BrowserPreflightFixture = ReturnType<typeof createBrowserPreflightFixture>;

function usePreflightFixture(resources: AsyncDisposableStack): BrowserPreflightFixture {
	const fixture = createBrowserPreflightFixture();
	resources.defer(() => fs.rmSync(fixture.root, { recursive: true, force: true }));
	return fixture;
}

function workflowWith(...commands: string[]): string {
	return [
		"jobs:",
		"  suite:",
		"    steps:",
		...commands.map((command) => `      - run: ${JSON.stringify(command)}`),
		"",
	].join("\n");
}

function runAdapter(
	options: {
		withAgentBrowser: boolean;
		withStrace?: boolean;
		executablePath?: string;
		ownerFixture?: string;
		file?: (typeof BROWSER_TEST_PATHS)[number];
		packageSelection?: boolean;
		hostedExclusion?: boolean;
	},
	resources: AsyncDisposableStack,
): {
	exitCode: number;
	stderr: string;
	fixture: BrowserPreflightFixture;
} {
	const fixture = usePreflightFixture(resources);
	if (options.withAgentBrowser) installFakeAgentBrowser(fixture);
	if (options.withStrace) {
		fs.writeFileSync(
			path.join(fixture.bin, "strace"),
			`#!/bin/sh\nif [ "$1" = "--version" ]; then exit 0; fi\nif [ "\${AGENT_BROWSER_DEFAULT_TIMEOUT+x}" = x ]; then printf 'present:%s' "$AGENT_BROWSER_DEFAULT_TIMEOUT"; else printf 'absent'; fi > "${fixture.canvasOperationTimeoutMarker}"\nwhile [ "$1" != "-o" ]; do shift; done\nshift\n: > "$1"\nshift\nexec "$@"\n`,
			{ mode: 0o755 },
		);
	}
	const env: Record<string, string> = { PATH: fixture.bin, TMPDIR: fixture.temporary };
	if (options.executablePath !== undefined)
		env.AGENT_BROWSER_EXECUTABLE_PATH = options.executablePath;
	if (options.ownerFixture !== undefined)
		env.ARCHBOARD_TEST_BROWSER_OWNER_FIXTURE = options.ownerFixture;
	if (options.hostedExclusion) Object.assign(env, HOSTED_BROWSER_EXCLUSION);
	const result = Bun.spawnSync({
		cmd: options.packageSelection
			? ["bun", BROWSER_ADAPTER_PATH, ...BROWSER_TEST_PATHS]
			: ["bun", BROWSER_ADAPTER_PATH, "--focus", options.file ?? BROWSER_TEST_PATHS[1]],
		cwd: repoRoot,
		env,
		stdout: "ignore",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		stderr: new TextDecoder().decode(result.stderr),
		fixture,
	};
}

async function expectPreflightRefusal(
	setup: (fixture: BrowserPreflightFixture) => string | undefined,
	diagnostic: string,
): Promise<void> {
	await using resources = new AsyncDisposableStack();
	const fixture = usePreflightFixture(resources);
	const beforeBundle = browserBundleSnapshot(repoRoot);
	const result = runAdapter(
		{
			withAgentBrowser: true,
			executablePath: setup(fixture),
		},
		resources,
	);
	expect(result.exitCode).toBe(2);
	expect(result.stderr).toContain(diagnostic);
	expect(fs.existsSync(result.fixture.versionMarker)).toBeFalse();
	expect(fs.existsSync(result.fixture.unexpectedMarker)).toBeFalse();
	expect(fs.readdirSync(result.fixture.temporary)).toEqual([]);
	expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
}

describe("CI executable workflow steps", () => {
	test("accepts the real workflow and one canonical check step", () => {
		const real = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
		expect(inspectWorkflow(real)).toEqual([]);
		const workflow = Bun.YAML.parse(real) as {
			jobs?: {
				suite?: {
					name?: string;
					steps?: Array<{ run?: string; env?: Record<string, string> }>;
				};
			};
		};
		const suite = workflow.jobs?.suite;
		expect(suite?.name).toBe("Lint, format, type check, build, and hosted test subset");
		expect(suite?.steps?.some((step) => step.run?.includes("strace"))).toBeFalse();
		const check = suite?.steps?.find((step) => step.run === "bun run check");
		expect(check?.env).toEqual(HOSTED_BROWSER_EXCLUSION);
		expect(inspectWorkflow(workflowWith("bun run check"))).toEqual([]);
	});

	test("rejects a missing canonical check step", () => {
		expect(inspectWorkflow(workflowWith("true"))).toEqual([
			"the workflow must contain exactly one standalone `bun run check` step; found 0.",
		]);
	});

	test("ignores check text in comments and quoted output", () => {
		const workflow = `${workflowWith('echo "bun run check"')}# bun run check\n`;
		expect(inspectWorkflow(workflow)).toEqual([
			"the workflow must contain exactly one standalone `bun run check` step; found 0.",
		]);
	});

	test("ignores an unquoted echo-only package-script spelling", () => {
		expect(inspectWorkflow(workflowWith("echo bun run test", "bun run check"))).toEqual([]);
	});

	test("keeps single-quoted command-substitution text inert", () => {
		expect(inspectWorkflow(workflowWith("echo '$(bun run test)'", "bun run check"))).toEqual([]);
	});

	test("ignores a shell comment inside a run scalar", () => {
		expect(inspectWorkflow(workflowWith("echo ok;# bun run test", "bun run check"))).toEqual([]);
	});

	test("rejects duplicate canonical check steps", () => {
		expect(inspectWorkflow(workflowWith("bun run check", "bun run check"))).toEqual([
			"the workflow must contain exactly one standalone `bun run check` step; found 2.",
		]);
	});

	test("rejects a direct build script beside the canonical check", () => {
		expect(inspectWorkflow(workflowWith("bun run build", "bun run check"))).toEqual([
			"the workflow invokes package script `build` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects a direct test script in a multiline step", () => {
		const workflow =
			"jobs:\n  suite:\n    steps:\n      - run: |\n          bun run test\n      - run: bun run check\n";
		expect(inspectWorkflow(workflow)).toEqual([
			"the workflow invokes package script `test` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects a package script behind an env wrapper", () => {
		expect(inspectWorkflow(workflowWith("env FOO=1 bun run test", "bun run check"))).toEqual([
			"the workflow invokes package script `test` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects a package script behind a command wrapper", () => {
		expect(inspectWorkflow(workflowWith("command bun run build", "bun run check"))).toEqual([
			"the workflow invokes package script `build` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects a package script inside a command group", () => {
		expect(inspectWorkflow(workflowWith("(bun run test)", "bun run check"))).toEqual([
			"the workflow invokes package script `test` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects a package script inside a conditional", () => {
		expect(
			inspectWorkflow(workflowWith("if true; then bun run test; fi", "bun run check")),
		).toEqual([
			"the workflow invokes package script `test` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects a package script on the right side of a pipeline", () => {
		expect(inspectWorkflow(workflowWith("echo ok | bun run build", "bun run check"))).toEqual([
			"the workflow invokes package script `build` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects a package script in backtick command substitution", () => {
		expect(inspectWorkflow(workflowWith("echo `bun run build`", "bun run check"))).toEqual([
			"the workflow invokes package script `build` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects dollar-parenthesis execution inside a double-quoted echo argument", () => {
		expect(inspectWorkflow(workflowWith('echo "$(bun run build)"', "bun run check"))).toEqual([
			"the workflow invokes package script `build` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects executable substitution content after a commented parenthesis", () => {
		const command = 'echo "$(echo ok # )\nbun run test\n)"';
		expect(inspectWorkflow(workflowWith(command, "bun run check"))).toEqual([
			"the workflow invokes package script `test` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects dollar-parenthesis execution inside a double-quoted assignment", () => {
		expect(inspectWorkflow(workflowWith('x="$(bun run test)"', "bun run check"))).toEqual([
			"the workflow invokes package script `test` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects backtick execution inside a double-quoted argument", () => {
		expect(inspectWorkflow(workflowWith('echo "`bun run build`"', "bun run check"))).toEqual([
			"the workflow invokes package script `build` directly; `bun run check` must be its only package-script invocation.",
		]);
	});

	test("rejects whitespace and multiline check evasions", () => {
		for (const workflow of [
			workflowWith("bun  run  check"),
			"jobs:\n  suite:\n    steps:\n      - run: |\n          bun run check\n",
		]) {
			expect(inspectWorkflow(workflow)).toEqual([
				"the workflow must contain exactly one standalone `bun run check` step; found 0.",
				"the workflow invokes `bun run check` outside the canonical standalone step.",
			]);
		}
	});
});

describe("browser executable adapter boundary", () => {
	test("local package selection retains all 15 browser owners", () => {
		const selection = validateBrowserSelection([
			"bun",
			BROWSER_ADAPTER_PATH,
			...BROWSER_TEST_PATHS,
		]);
		expect(applyCiBrowserOwnerExclusion(selection, {})).toBe(selection);
		expect(selection.files).toEqual([...BROWSER_TEST_PATHS]);
	});

	test("the hosted package exception removes only the human-performance owner", () => {
		const selection = validateBrowserSelection([
			"bun",
			BROWSER_ADAPTER_PATH,
			...BROWSER_TEST_PATHS,
		]);
		const hosted = applyCiBrowserOwnerExclusion(selection, HOSTED_BROWSER_EXCLUSION);
		expect(hosted).toEqual({ mode: "package", files: BROWSER_TEST_PATHS.slice(1) });
		expect(selection.files).toEqual([...BROWSER_TEST_PATHS]);
	});

	test.each([
		[
			"missing CI",
			{ ARCHBOARD_CI_EXCLUDED_BROWSER_OWNER: BROWSER_TEST_PATHS[0] },
			"requires CI=true",
		],
		[
			"wrong owner",
			{ CI: "true", ARCHBOARD_CI_EXCLUDED_BROWSER_OWNER: BROWSER_TEST_PATHS[1] },
			"cannot exclude",
		],
	])("rejects a %s exclusion", (_name, environment, diagnostic) => {
		const selection = validateBrowserSelection([
			"bun",
			BROWSER_ADAPTER_PATH,
			...BROWSER_TEST_PATHS,
		]);
		expect(() => applyCiBrowserOwnerExclusion(selection, environment)).toThrow(diagnostic);
	});

	test("rejects the hosted exception in focused mode", () => {
		const selection = validateBrowserSelection([
			"bun",
			BROWSER_ADAPTER_PATH,
			"--focus",
			BROWSER_TEST_PATHS[0],
		]);
		expect(() => applyCiBrowserOwnerExclusion(selection, HOSTED_BROWSER_EXCLUSION)).toThrow(
			"valid only for the package browser lane",
		);
		expect(CI_EXCLUDED_BROWSER_OWNER_ENV).toBe("ARCHBOARD_CI_EXCLUDED_BROWSER_OWNER");
	});

	test("the real package adapter announces the exception and advances to an ordinary owner", async () => {
		await using resources = new AsyncDisposableStack();
		const result = runAdapter(
			{ withAgentBrowser: true, packageSelection: true, hostedExclusion: true },
			resources,
		);
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain(`# CI-only browser owner excluded: ${BROWSER_TEST_PATHS[0]}`);
		expect(fs.existsSync(result.fixture.versionMarker)).toBeTrue();
		expect(fs.existsSync(result.fixture.unexpectedMarker)).toBeTrue();
	});

	test("an unset local executable advances to PATH-based agent-browser discovery", async () => {
		await using resources = new AsyncDisposableStack();
		const beforeBundle = browserBundleSnapshot(repoRoot);
		const result = runAdapter({ withAgentBrowser: false }, resources);
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("agent-browser prerequisite could not run");
		expect(result.stderr).not.toContain("AGENT_BROWSER_EXECUTABLE_PATH");
		expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
	});

	test("a configured executable still requires agent-browser on PATH before the build", async () => {
		await using resources = new AsyncDisposableStack();
		const beforeBundle = browserBundleSnapshot(repoRoot);
		const fixture = usePreflightFixture(resources);
		const result = runAdapter(
			{ withAgentBrowser: false, executablePath: fixture.browserExecutable },
			resources,
		);
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("agent-browser prerequisite could not run");
		expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
	});

	test("a missing configured executable refuses before agent-browser or the build", async () => {
		await expectPreflightRefusal(() => "/missing/chrome", "does not exist");
	});

	test("a relative configured executable refuses before agent-browser or the build", async () => {
		await expectPreflightRefusal(() => "relative/chrome", "must be absolute");
	});

	test("a configured directory refuses before agent-browser or the build", async () => {
		await expectPreflightRefusal((fixture) => fixture.root, "is not a file");
	});

	test("a non-executable configured file refuses before agent-browser or the build", async () => {
		await expectPreflightRefusal((fixture) => {
			fs.chmodSync(fixture.browserExecutable, 0o644);
			return fixture.browserExecutable;
		}, "is not executable");
	});

	test("a missing strace refuses before the build or owner acquisition", async () => {
		await using resources = new AsyncDisposableStack();
		const beforeBundle = browserBundleSnapshot(repoRoot);
		const fixture = usePreflightFixture(resources);
		const result = runAdapter(
			{
				withAgentBrowser: true,
				executablePath: fixture.browserExecutable,
				file: BROWSER_TEST_PATHS[0],
			},
			resources,
		);
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toContain("strace prerequisite could not run");
		expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
	});

	test("canonical owner argv ignores substitution input and receives the configured executable", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = usePreflightFixture(resources);
		installFakeAgentBrowser(fixture);
		const ownerFixture = path.join(fixture.root, "forbidden-owner.ts");
		const ownerMarker = path.join(fixture.root, "forbidden-owner-ran");
		const configuredPath = `${fixture.root}/unused/../chrome`;
		fs.writeFileSync(ownerFixture, `Bun.write(${JSON.stringify(ownerMarker)}, "ran");`);
		const result = runAdapter(
			{ withAgentBrowser: true, executablePath: configuredPath, ownerFixture },
			resources,
		);
		expect(result.exitCode).toBe(1);
		expect(fs.existsSync(ownerMarker)).toBeFalse();
		expect(fs.readFileSync(result.fixture.ownerPathMarker, "utf8")).toBe(fixture.browserExecutable);
	});

	test("scopes the long agent-browser operation timeout to the human-performance owner", async () => {
		await using resources = new AsyncDisposableStack();
		const fixture = usePreflightFixture(resources);
		const ownerFixture = path.join(fixture.root, "forbidden-owner.ts");
		fs.writeFileSync(ownerFixture, "throw new Error('forbidden owner fixture ran');");
		const ordinary = runAdapter(
			{ withAgentBrowser: true, executablePath: fixture.browserExecutable, ownerFixture },
			resources,
		);
		const human = runAdapter(
			{
				withAgentBrowser: true,
				withStrace: true,
				executablePath: fixture.browserExecutable,
				ownerFixture,
				file: BROWSER_TEST_PATHS[0],
			},
			resources,
		);
		expect(ordinary.exitCode).toBe(1);
		expect(fs.readFileSync(ordinary.fixture.ownerOperationTimeoutMarker, "utf8")).toBe("absent");
		expect(human.exitCode).toBe(1);
		expect(fs.readFileSync(human.fixture.ownerOperationTimeoutMarker, "utf8")).toBe(
			`present:${TEST_HUMAN_PERFORMANCE_OPEN_TIMEOUT_MS}`,
		);
		expect(fs.readFileSync(human.fixture.canvasOperationTimeoutMarker, "utf8")).toBe("absent");
	});
});
