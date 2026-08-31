import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	inspectFormatterGroupsForTest,
	reapProcessGroup,
	restoreAndRemoveScenarioRoot,
	type ProcessReader,
} from "./support/oxfmt-tailwind-owner.ts";
import { actualOxfmtProcess } from "./support/oxfmt-tailwind-process.ts";

function injectedReader(pid: number, failure?: NodeJS.ErrnoException): ProcessReader {
	return {
		readdirProc: () => readdirSync("/proc", { withFileTypes: true }),
		readFile(path) {
			if (path === `/proc/${pid}/stat` && failure) throw failure;
			return readFileSync(path);
		},
	};
}

function errorWithCode(code: string): NodeJS.ErrnoException {
	const error = new Error(`${code} injected`) as NodeJS.ErrnoException;
	error.code = code;
	return error;
}

function syntheticEntry(name: string): Dirent {
	return { name, isDirectory: () => true } as unknown as Dirent;
}

test("skips an injected vanished process during formatter refresh", () => {
	const state = inspectFormatterGroupsForTest(
		"/tmp/archboard-reader-enoent",
		injectedReader(process.pid, errorWithCode("ENOENT")),
		[4242],
	);
	expect(state.refreshError).toBeUndefined();
	expect(state.formatterGroups).toEqual([4242]);
});

test("publishes injected permission failures during formatter refresh", () => {
	const pid = process.pid;
	const state = inspectFormatterGroupsForTest(
		"/tmp/archboard-reader-eacces",
		injectedReader(pid, errorWithCode("EACCES")),
		[4242],
	);
	expect(state.refreshError).toContain(`Unable to read process metadata /proc/${pid}/stat`);
	expect(state.refreshError).toContain("EACCES");
});

test("publishes injected permission failures during formatter lookup", () => {
	const group = 9401;
	const formatter = 9402;
	const reader: ProcessReader = {
		readdirProc: () => [syntheticEntry(String(formatter))],
		readFile(path) {
			if (path === `/proc/${formatter}/stat`)
				return Buffer.from(`${formatter} (synthetic) S 1 ${group} ${group}`);
			if (path === `/proc/${formatter}/cmdline`) throw errorWithCode("EACCES");
			throw new Error(`Unexpected synthetic process path ${path}`);
		},
	};
	expect(() => actualOxfmtProcess(group, reader)).toThrow("EACCES");
});

test("publishes injected I/O failures during formatter refresh", () => {
	const pid = process.pid;
	const state = inspectFormatterGroupsForTest(
		"/tmp/archboard-reader-eio",
		injectedReader(pid, errorWithCode("EIO")),
		[4242],
	);
	expect(state.refreshError).toContain("EIO");
});

test("publishes malformed process metadata during formatter refresh", () => {
	const pid = process.pid;
	const reader: ProcessReader = {
		readdirProc: () => readdirSync("/proc", { withFileTypes: true }),
		readFile(path) {
			if (path === `/proc/${pid}/stat`) return Buffer.from("malformed stat");
			return readFileSync(path);
		},
	};
	const state = inspectFormatterGroupsForTest("/tmp/archboard-reader-malformed", reader, [4242]);
	expect(state.refreshError).toContain(`Malformed process metadata /proc/${pid}/stat`);
	expect(state.formatterGroups).toEqual([4242]);
});

test("publishes invalid process groups during formatter refresh", () => {
	const pid = process.pid;
	const root = "/tmp/archboard-reader-invalid-group";
	const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
	const close = stat.lastIndexOf(")");
	const fields = stat.slice(close + 2).split(" ");
	fields[2] = "0";
	const reader: ProcessReader = {
		readdirProc: () => readdirSync("/proc", { withFileTypes: true }),
		readFile(path) {
			if (path === `/proc/${pid}/cmdline`) return Buffer.from(`${root}/node_modules/oxfmt\0`);
			if (path === `/proc/${pid}/stat`)
				return Buffer.from(`${stat.slice(0, close + 2)}${fields.join(" ")}`);
			return readFileSync(path);
		},
	};
	const state = inspectFormatterGroupsForTest(root, reader, [4242]);
	expect(state.refreshError).toContain("invalid process group");
	expect(state.refreshError).toContain('"0"');
});

test("cleans the exact root and known groups after a refresh failure", async () => {
	const container = mkdtempSync(join(tmpdir(), "archboard-oxfmt-reader-"));
	const root = join(container, "fixture");
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, "marker"), "fixture");
	const child = Bun.spawn({
		cmd: [process.execPath, "-e", "setInterval(() => undefined, 1000)"],
		detached: true,
		stdout: "ignore",
		stderr: "ignore",
	});
	try {
		const state = inspectFormatterGroupsForTest(
			root,
			injectedReader(process.pid, errorWithCode("EACCES")),
			[child.pid],
		);
		expect(state.root).toBe(root);
		expect(state.formatterGroups).toEqual([child.pid]);
		expect(state.refreshError).toContain("EACCES");
		await reapProcessGroup(child.pid);
		restoreAndRemoveScenarioRoot(root);
		expect(state.root).toBe(root);
		expect(() => readFileSync(join(root, "marker"))).toThrow();
	} finally {
		if (child.exitCode === null) await reapProcessGroup(child.pid);
		rmSync(container, { recursive: true, force: true });
	}
});
