import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BROWSER_ADAPTER_PATH, BROWSER_TEST_PATHS } from "../browser/run-browser-lane.ts";
import {
	browserBundleSnapshot,
	createBrowserPreflightFixture,
	inspectWorkflow,
	installFakeAgentBrowser,
} from "./support/test-inventory.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function workflowWith(...commands: string[]): string {
	return [
		"jobs:",
		"  suite:",
		"    steps:",
		...commands.map((command) => `      - run: ${JSON.stringify(command)}`),
		"",
	].join("\n");
}

function runAdapter(options: {
	withAgentBrowser: boolean;
	executablePath?: string;
	ownerFixture?: string;
	file?: (typeof BROWSER_TEST_PATHS)[number];
}): {
	exitCode: number;
	stderr: string;
	fixture: ReturnType<typeof createBrowserPreflightFixture>;
} {
	const fixture = createBrowserPreflightFixture();
	if (options.withAgentBrowser) installFakeAgentBrowser(fixture);
	const env: Record<string, string> = { PATH: fixture.bin, TMPDIR: fixture.temporary };
	if (options.executablePath !== undefined)
		env.AGENT_BROWSER_EXECUTABLE_PATH = options.executablePath;
	if (options.ownerFixture !== undefined)
		env.ARCHBOARD_TEST_BROWSER_OWNER_FIXTURE = options.ownerFixture;
	const result = Bun.spawnSync({
		cmd: ["bun", BROWSER_ADAPTER_PATH, "--focus", options.file ?? BROWSER_TEST_PATHS[1]],
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

function expectPreflightRefusal(
	setup: (fixture: ReturnType<typeof createBrowserPreflightFixture>) => string | undefined,
	diagnostic: string,
): void {
	const fixture = createBrowserPreflightFixture();
	const beforeBundle = browserBundleSnapshot(repoRoot);
	try {
		const result = runAdapter({
			withAgentBrowser: true,
			executablePath: setup(fixture),
		});
		try {
			expect(result.exitCode).toBe(2);
			expect(result.stderr).toContain(diagnostic);
			expect(fs.existsSync(result.fixture.versionMarker)).toBeFalse();
			expect(fs.existsSync(result.fixture.unexpectedMarker)).toBeFalse();
			expect(fs.readdirSync(result.fixture.temporary)).toEqual([]);
			expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
		} finally {
			fs.rmSync(result.fixture.root, { recursive: true, force: true });
		}
	} finally {
		fs.rmSync(fixture.root, { recursive: true, force: true });
	}
}

describe("CI executable workflow steps", () => {
	test("accepts the real workflow and one canonical check step", () => {
		const real = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8");
		expect(inspectWorkflow(real)).toEqual([]);
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
	test("an unset local executable advances to PATH-based agent-browser discovery", () => {
		const beforeBundle = browserBundleSnapshot(repoRoot);
		const result = runAdapter({ withAgentBrowser: false });
		try {
			expect(result.exitCode).toBe(2);
			expect(result.stderr).toContain("agent-browser prerequisite could not run");
			expect(result.stderr).not.toContain("AGENT_BROWSER_EXECUTABLE_PATH");
			expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
		} finally {
			fs.rmSync(result.fixture.root, { recursive: true, force: true });
		}
	});

	test("a configured executable still requires agent-browser on PATH before the build", () => {
		const beforeBundle = browserBundleSnapshot(repoRoot);
		const fixture = createBrowserPreflightFixture();
		const result = runAdapter({
			withAgentBrowser: false,
			executablePath: fixture.browserExecutable,
		});
		try {
			expect(result.exitCode).toBe(2);
			expect(result.stderr).toContain("agent-browser prerequisite could not run");
			expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
		} finally {
			fs.rmSync(fixture.root, { recursive: true, force: true });
			fs.rmSync(result.fixture.root, { recursive: true, force: true });
		}
	});

	test("a missing configured executable refuses before agent-browser or the build", () => {
		expectPreflightRefusal(() => "/missing/chrome", "does not exist");
	});

	test("a relative configured executable refuses before agent-browser or the build", () => {
		expectPreflightRefusal(() => "relative/chrome", "must be absolute");
	});

	test("a configured directory refuses before agent-browser or the build", () => {
		expectPreflightRefusal((fixture) => fixture.root, "is not a file");
	});

	test("a non-executable configured file refuses before agent-browser or the build", () => {
		expectPreflightRefusal((fixture) => {
			fs.chmodSync(fixture.browserExecutable, 0o644);
			return fixture.browserExecutable;
		}, "is not executable");
	});

	test("a missing strace refuses before the build or owner acquisition", () => {
		const beforeBundle = browserBundleSnapshot(repoRoot);
		const fixture = createBrowserPreflightFixture();
		const result = runAdapter({
			withAgentBrowser: true,
			executablePath: fixture.browserExecutable,
			file: BROWSER_TEST_PATHS[0],
		});
		try {
			expect(result.exitCode).toBe(2);
			expect(result.stderr).toContain("strace prerequisite could not run");
			expect(browserBundleSnapshot(repoRoot)).toEqual(beforeBundle);
		} finally {
			fs.rmSync(fixture.root, { recursive: true, force: true });
			fs.rmSync(result.fixture.root, { recursive: true, force: true });
		}
	});

	test("canonical owner argv ignores substitution input and receives the configured executable", () => {
		const fixture = createBrowserPreflightFixture();
		installFakeAgentBrowser(fixture);
		const ownerFixture = path.join(fixture.root, "forbidden-owner.ts");
		const ownerMarker = path.join(fixture.root, "forbidden-owner-ran");
		const configuredPath = `${fixture.root}/unused/../chrome`;
		fs.writeFileSync(ownerFixture, `Bun.write(${JSON.stringify(ownerMarker)}, "ran");`);
		const result = runAdapter({
			withAgentBrowser: true,
			executablePath: configuredPath,
			ownerFixture,
		});
		try {
			expect(result.exitCode).toBe(1);
			expect(fs.existsSync(ownerMarker)).toBeFalse();
			expect(fs.readFileSync(result.fixture.ownerPathMarker, "utf8")).toBe(
				fixture.browserExecutable,
			);
		} finally {
			fs.rmSync(fixture.root, { recursive: true, force: true });
			fs.rmSync(result.fixture.root, { recursive: true, force: true });
		}
	});
});
