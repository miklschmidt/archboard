import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentBrowserCommand, probeBrowserTool } from "./support/browser-toolchain.ts";
import { CouldNotRunError } from "./support/browser-executable.ts";
import { BROWSER_ADAPTER_PATH, BROWSER_TEST_PATHS } from "./support/browser-selection.ts";

test("the pinned browser CLI runs without HOME and never invokes an ambient wrapper", () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-browser-toolchain-"));
	try {
		const marker = join(root, "ambient-ran");
		writeFileSync(join(root, "agent-browser"), `#!/bin/sh\ntouch '${marker}'\nexit 23\n`, {
			mode: 0o700,
		});
		const output = probeBrowserTool([...agentBrowserCommand(), "--version"], { PATH: root });
		expect(output.length).toBeGreaterThan(0);
		expect(existsSync(marker)).toBe(false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("prerequisite failure retains subprocess evidence", () => {
	const evidence = JSON.stringify({ fixture: "browser-prerequisite", status: 19 });
	const standardOutput = JSON.stringify({ fixture: "browser-prerequisite-stdout" });
	let failure: unknown;
	try {
		probeBrowserTool(
			[
				process.execPath,
				"-e",
				`process.stdout.write(${JSON.stringify(standardOutput)});process.stderr.write(${JSON.stringify(evidence)});process.exit(19);`,
			],
			{},
		);
	} catch (error) {
		failure = error;
	}
	expect(failure).toBeInstanceOf(CouldNotRunError);
	expect((failure as Error).message).toContain(evidence);
	expect((failure as Error).message).toContain(standardOutput);
});

test("the runner retains prerequisite exit status in its final progress record", () => {
	const absentBrowser = join(import.meta.dir, "absent-browser");
	const result = Bun.spawnSync(
		[process.execPath, BROWSER_ADAPTER_PATH, "--focus", BROWSER_TEST_PATHS[0]],
		{
			env: {
				PATH: process.env["PATH"],
				AGENT_BROWSER_EXECUTABLE_PATH: absentBrowser,
			},
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const records = result.stderr
		.toString()
		.split("\n")
		.filter((line) => line.startsWith("# browser-lane "))
		.map((line) => JSON.parse(line.slice("# browser-lane ".length)));
	expect(result.exitCode).toBe(2);
	const toolchain = result.stderr
		.toString()
		.split("\n")
		.find((line) => line.startsWith("# browser-toolchain "));
	expect(toolchain).toBeDefined();
	const resolved = JSON.parse(toolchain!.slice("# browser-toolchain ".length));
	expect(resolved.command).toEqual(agentBrowserCommand());
	expect(resolved.version.length).toBeGreaterThan(0);
	expect(resolved.browser).toBe(absentBrowser);
	expect(records.at(-1)).toEqual({ event: "finished", exitCode: 2 });
	expect(records.some((record) => record.event === "completed")).toBe(false);
});
