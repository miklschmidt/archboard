import { readFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";

export interface ProcessReader {
	readdirProc(): readonly Dirent[];
	readFile(path: string): Buffer;
}

export const liveProcessReader: ProcessReader = {
	readdirProc: () => readdirSync("/proc", { withFileTypes: true }),
	readFile: (path) => readFileSync(path),
};

function errorMessage(error: unknown): string {
	if (error instanceof AggregateError)
		return `${error.message}: ${error.errors.map((nested) => errorMessage(nested)).join(" | ")}`;
	const message = error instanceof Error ? error.message : String(error);
	const code = (error as NodeJS.ErrnoException).code;
	return code && !message.startsWith(`${code}:`) ? `${code}: ${message}` : message;
}

function isVanishedProcess(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException).code;
	return code === "ENOENT" || code === "ESRCH";
}

function processReadFailure(path: string, error: unknown): Error {
	return new Error(`Unable to read process metadata ${path}: ${errorMessage(error)}`, {
		cause: error,
	});
}

function processEntries(reader: ProcessReader): readonly Dirent[] {
	try {
		return reader.readdirProc();
	} catch (error) {
		throw processReadFailure("/proc", error);
	}
}

function processStatFields(pid: number, reader: ProcessReader): string[] | undefined {
	const path = `/proc/${pid}/stat`;
	let stat: string;
	try {
		stat = reader.readFile(path).toString("utf8");
	} catch (error) {
		if (isVanishedProcess(error)) return undefined;
		throw processReadFailure(path, error);
	}
	const close = stat.lastIndexOf(")");
	if (close < 0)
		throw new Error(`Malformed process metadata ${path}: missing closing command delimiter.`);
	const fields = stat.slice(close + 2).split(" ");
	if (fields.length < 3 || fields[0]?.length !== 1)
		throw new Error(`Malformed process metadata ${path}: incomplete stat record.`);
	return fields;
}

function isKernelProcess(pid: number, reader: ProcessReader): boolean {
	const path = `/proc/${pid}/cmdline`;
	try {
		return reader.readFile(path).length === 0;
	} catch (error) {
		if (isVanishedProcess(error)) return true;
		throw processReadFailure(path, error);
	}
}

function numericProcessField(
	pid: number,
	fields: readonly string[],
	index: number,
	name: string,
	allowZero = false,
): number {
	const value = fields[index];
	if (!value || !/^\d+$/.test(value))
		throw new Error(
			`Malformed process metadata /proc/${pid}/stat: invalid ${name} ${JSON.stringify(value)}.`,
		);
	const number = Number(value);
	if (!Number.isSafeInteger(number) || (!allowZero && number <= 0))
		throw new Error(
			`Malformed process metadata /proc/${pid}/stat: invalid ${name} ${JSON.stringify(value)}.`,
		);
	return number;
}

export function processGroupMembers(group: number, reader = liveProcessReader): number[] {
	const members: number[] = [];
	for (const entry of processEntries(reader)) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
		const pid = Number(entry.name);
		const fields = processStatFields(pid, reader);
		if (fields?.[2] === "0" && isKernelProcess(pid, reader)) continue;
		if (fields && numericProcessField(pid, fields, 2, "process group") === group) members.push(pid);
	}
	return members;
}

export function actualOxfmtProcess(group: number, reader = liveProcessReader): number | undefined {
	for (const pid of processGroupMembers(group, reader)) {
		const path = `/proc/${pid}/cmdline`;
		let command: string;
		try {
			command = reader.readFile(path).toString().replaceAll("\0", " ");
		} catch (error) {
			if (isVanishedProcess(error)) continue;
			throw processReadFailure(path, error);
		}
		if (command.includes("oxfmt") && processGroupOf(pid, reader) !== undefined) return pid;
	}
	return undefined;
}

export function processGroupOf(pid: number, reader = liveProcessReader): number | undefined {
	const fields = processStatFields(pid, reader);
	return fields ? numericProcessField(pid, fields, 2, "process group") : undefined;
}

export function processIsLive(pid: number): boolean {
	const fields = processStatFields(pid, liveProcessReader);
	return fields !== undefined && fields[0] !== "Z";
}

export function refreshFormatterGroups(
	root: string,
	groups: Set<number>,
	reader = liveProcessReader,
): void {
	const formatterPids = new Set<number>();
	for (const entry of processEntries(reader)) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
		const pid = Number(entry.name);
		const path = `/proc/${entry.name}/cmdline`;
		let command: string;
		try {
			command = reader.readFile(path).toString();
		} catch (error) {
			if (isVanishedProcess(error)) continue;
			throw processReadFailure(path, error);
		}
		if (command.includes(`${root}/node_modules/`) && command.includes("oxfmt"))
			formatterPids.add(pid);
	}
	for (const entry of processEntries(reader)) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
		const pid = Number(entry.name);
		const fields = processStatFields(pid, reader);
		if (fields && formatterPids.has(numericProcessField(pid, fields, 1, "parent process", true)))
			formatterPids.add(pid);
	}
	for (const pid of formatterPids) {
		const group = processGroupOf(pid, reader);
		if (group !== undefined) groups.add(group);
	}
}

export function inspectFormatterGroupsForTest(
	root: string,
	reader: ProcessReader,
	knownGroups: readonly number[] = [],
): { root: string; formatterGroups: number[]; refreshError?: string } {
	const groups = new Set(knownGroups);
	let refreshError: unknown;
	try {
		refreshFormatterGroups(root, groups, reader);
	} catch (error) {
		refreshError = error;
	}
	return {
		root,
		formatterGroups: [...groups],
		...(refreshError ? { refreshError: errorMessage(refreshError) } : {}),
	};
}
