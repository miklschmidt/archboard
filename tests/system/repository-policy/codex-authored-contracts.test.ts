import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const contractPath = path.join(repoRoot, "docs/design/codex-workbench-authored-contracts.md");
const contractBytes = fs.readFileSync(contractPath);
const contract = contractBytes.toString("utf8");

type JsonBlock = {
	line: number;
	raw: string;
	value: unknown;
};

type ReviewedDigest = {
	consumer: string;
	expected: string;
	name: string;
	read: () => string | Buffer;
};

function sha256(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function failJson(label: string, message: string): never {
	throw new Error(`${label} is not strict JSON: ${message}`);
}

function parseStrictJson(source: string, label: string): unknown {
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch (error) {
		failJson(label, error instanceof Error ? error.message : String(error));
	}

	let cursor = 0;
	const skipWhitespace = (): void => {
		while (/\s/.test(source[cursor] ?? "")) cursor += 1;
	};
	const readString = (): string => {
		const start = cursor;
		cursor += 1;
		while (cursor < source.length) {
			if (source[cursor] === "\\") {
				cursor += 2;
				continue;
			}
			if (source[cursor] === '"') {
				cursor += 1;
				return JSON.parse(source.slice(start, cursor)) as string;
			}
			cursor += 1;
		}
		return failJson(label, "unterminated string");
	};
	const expectToken = (token: string): void => {
		if (!source.startsWith(token, cursor)) {
			failJson(label, `expected ${JSON.stringify(token)} at byte ${cursor}`);
		}
		cursor += token.length;
	};
	const readValue = (location: string): void => {
		skipWhitespace();
		if (source[cursor] === "{") {
			cursor += 1;
			skipWhitespace();
			const keys = new Set<string>();
			if (source[cursor] === "}") {
				cursor += 1;
				return;
			}
			while (cursor < source.length) {
				if (source[cursor] !== '"') failJson(label, `expected object key at byte ${cursor}`);
				const key = readString();
				if (keys.has(key)) failJson(label, `duplicate key ${JSON.stringify(key)} at ${location}`);
				keys.add(key);
				skipWhitespace();
				expectToken(":");
				readValue(`${location}.${key}`);
				skipWhitespace();
				if (source[cursor] === "}") {
					cursor += 1;
					return;
				}
				expectToken(",");
				skipWhitespace();
			}
			failJson(label, "unterminated object");
		}
		if (source[cursor] === "[") {
			cursor += 1;
			skipWhitespace();
			if (source[cursor] === "]") {
				cursor += 1;
				return;
			}
			let index = 0;
			while (cursor < source.length) {
				readValue(`${location}[${index}]`);
				index += 1;
				skipWhitespace();
				if (source[cursor] === "]") {
					cursor += 1;
					return;
				}
				expectToken(",");
			}
			failJson(label, "unterminated array");
		}
		if (source[cursor] === '"') {
			readString();
			return;
		}
		for (const literal of ["true", "false", "null"]) {
			if (source.startsWith(literal, cursor)) {
				cursor += literal.length;
				return;
			}
		}
		const number = source.slice(cursor).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u)?.[0];
		if (!number) failJson(label, `expected value at byte ${cursor}`);
		cursor += number.length;
	};

	readValue("$");
	skipWhitespace();
	if (cursor !== source.length) failJson(label, `trailing bytes at byte ${cursor}`);
	return parsed;
}

function jsonBlocks(): JsonBlock[] {
	return [...contract.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match, index) => {
		const line = contract.slice(0, match.index).split("\n").length;
		const raw = `${match[1]}\n`;
		return {
			line,
			raw,
			value: parseStrictJson(match[1]!, `JSON block ${index + 1} at line ${line}`),
		};
	});
}

function fenceAfter(anchor: string, language: "json" | "text"): string {
	const anchorOffset = contract.indexOf(anchor);
	if (anchorOffset < 0) throw new Error(`Reviewed contract anchor is missing: ${anchor}`);
	const marker = `\`\`\`${language}\n`;
	const bodyOffset = contract.indexOf(marker, anchorOffset);
	if (bodyOffset < 0) throw new Error(`Reviewed ${language} fence is missing after: ${anchor}`);
	const start = bodyOffset + marker.length;
	const end = contract.indexOf("\n```", start);
	if (end < 0) throw new Error(`Reviewed ${language} fence is unterminated after: ${anchor}`);
	return `${contract.slice(start, end)}\n`;
}

function namespaceBytes(name: string): string {
	for (const block of jsonBlocks()) {
		if (
			typeof block.value === "object" &&
			block.value !== null &&
			"name" in block.value &&
			block.value.name === name
		) {
			return block.raw;
		}
	}
	throw new Error(`Reviewed namespace manifest is missing: ${name}`);
}

function namespaceToolNames(name: string): string[] {
	const value = parseStrictJson(namespaceBytes(name), `${name} manifest`);
	if (
		typeof value !== "object" ||
		value === null ||
		!("tools" in value) ||
		!Array.isArray(value.tools)
	) {
		throw new Error(`${name} manifest has no tools array`);
	}
	return value.tools.map((tool) => {
		if (typeof tool !== "object" || tool === null || !("name" in tool)) {
			throw new Error(`${name} manifest contains a tool without a name`);
		}
		if (!("deferLoading" in tool) || tool.deferLoading !== false) {
			throw new Error(`${name}.${String(tool.name)} must remain eager with deferLoading false`);
		}
		if (
			!("inputSchema" in tool) ||
			typeof tool.inputSchema !== "object" ||
			tool.inputSchema === null ||
			!("additionalProperties" in tool.inputSchema) ||
			tool.inputSchema.additionalProperties !== false
		) {
			throw new Error(`${name}.${String(tool.name)} must keep a closed input schema`);
		}
		return String(tool.name);
	});
}

function requireReviewedDigest(digest: ReviewedDigest): void {
	const actual = sha256(digest.read());
	if (actual === digest.expected) return;
	throw new Error(
		`${digest.name} drifted for ${digest.consumer}. Expected SHA-256 ${digest.expected}, received ${actual}. Human re-review is required before updating this digest.`,
	);
}

const workhorse = (): string => fenceAfter("### Workhorse developer instructions", "text");
const coordinatorExtension = (): string => fenceAfter("### Coordinator role extension", "text");
const coordinatorSeparator = "\n--- ARCHBOARD COORDINATOR ROLE ---\n";

function composeCoordinatorInstructions(
	workhorseBytes = workhorse(),
	separatorBytes = coordinatorSeparator,
	extensionBytes = coordinatorExtension(),
): string {
	if (!workhorseBytes.endsWith("\n") || workhorseBytes.endsWith("\n\n")) {
		throw new Error("Workhorse instructions must end in exactly one LF before the separator.");
	}
	if (separatorBytes !== coordinatorSeparator) {
		throw new Error("Coordinator separator must keep its exact leading and trailing LF bytes.");
	}
	if (extensionBytes.startsWith("\n") || !extensionBytes.endsWith("\n")) {
		throw new Error(
			"Coordinator extension must start immediately after the separator and end in one LF.",
		);
	}
	return `${workhorseBytes}${separatorBytes}${extensionBytes}`;
}

const reviewedDigests: ReviewedDigest[] = [
	{
		name: "complete authored contract prose and literals",
		consumer: "TASK-143.01.07, TASK-143.01.19, TASK-143.05.03, and TASK-143.07.07",
		expected: "82c647b4fc133c965a5c839b76082f0108143cf689221ab213a285213eecae47",
		read: () => contractBytes,
	},
	{
		name: "dynamic coordination approval policy manifest",
		consumer: "TASK-143.01.20, TASK-143.01.21, TASK-143.05.04, and TASK-143.03.07",
		expected: "c1140c7ab6e7627b1efc3e680266db4ceff87b6b79e8ef00c45a81ad87a6e8d5",
		read: () => fenceAfter("The strict manifest is the semantic source", "json"),
	},
	{
		name: "canonical additional-context policy manifest",
		consumer: "TASK-143.01.07, TASK-143.01.08, TASK-143.01.09, TASK-143.07.03, and TASK-143.07.04",
		expected: "4a74b68c5be278a53fe8bc6de40833b12d91cbb3c124dde0949116ce0eaa2119",
		read: () => fenceAfter("### Additional-context policy manifest", "json"),
	},
	{
		name: "workhorse developer instructions",
		consumer: "TASK-143.01.07",
		expected: "257b4ab944737418ee0713b4a748405446f8bc009d0dfc4557b099cd2c1038e6",
		read: workhorse,
	},
	{
		name: "coordinator role extension",
		consumer: "TASK-143.01.07",
		expected: "c187f85f75515bf07091904f96fee503080f23ce84afb606674e040c80e2d87b",
		read: coordinatorExtension,
	},
	{
		name: "coordinator instruction separator",
		consumer: "TASK-143.01.07",
		expected: "e64743b591f47a59eea6118686fc5b9f0bcca3e2d4e6af2dd8acfe55fe97653a",
		read: () => coordinatorSeparator,
	},
	{
		name: "composed coordinator instructions",
		consumer: "TASK-143.01.07",
		expected: "de6b52ca41c65ea73cdf24e2ecaf9fa0c1c2ea68178119c252f266f8ac90b61c",
		read: composeCoordinatorInstructions,
	},
	{
		name: "archboard_app namespace manifest",
		consumer: "TASK-143.05.03",
		expected: "df0fc2b1b33d985a7b84e54431162d6c00a3da0f8cecd98a18730e55bc7b272e",
		read: () => namespaceBytes("archboard_app"),
	},
	{
		name: "archboard_workhorse namespace manifest",
		consumer: "TASK-143.07.07",
		expected: "fe8dd9bfaf91b37cbae31136ccdfc4eb1106728b40d2bc3ea01036606d6f748f",
		read: () => namespaceBytes("archboard_workhorse"),
	},
	{
		name: "archboard_voice namespace manifest",
		consumer: "TASK-143.07.07",
		expected: "792d6ec96edc2fbffc8400ce0d1304a56662bee5436e95914505cb848356c393",
		read: () => namespaceBytes("archboard_voice"),
	},
	{
		name: "spoken approval classifier instructions",
		consumer: "TASK-143.07.07",
		expected: "215bd565500a9188f5e8f0d920a078113937f36296535054c56d7f12d74d1c6f",
		read: () =>
			fenceAfter(
				"The later ordinary coordinator turn receives these exact UTF-8 template bytes",
				"text",
			),
	},
];

describe("Codex authored contract repository policy", () => {
	test("keeps one strict JSON value in every reviewed JSON fence", () => {
		expect(jsonBlocks()).toHaveLength(25);
		expect(() => parseStrictJson('{"manifest":{"name":"first","name":"second"}}', "probe")).toThrow(
			'duplicate key "name" at $.manifest',
		);
	});

	test("keeps all dynamic-tool namespaces eager, closed, and ordered", () => {
		expect(namespaceToolNames("archboard_app")).toEqual([
			"create_thread",
			"fork_thread",
			"list_threads",
			"read_thread",
			"send_message_to_thread",
			"wait_threads",
		]);
		expect(namespaceToolNames("archboard_workhorse")).toEqual([
			"inspect_workhorse",
			"delegate_to_workhorse",
			"manage_workhorse_queue",
			"steer_workhorse",
		]);
		expect(namespaceToolNames("archboard_voice")).toEqual(["resolve_spoken_approval"]);
	});

	test("pins the closed coordinator callback byte and route policy", () => {
		expect(contract).toContain("### Coordinator callback bytes");
		expect(contract).toContain(
			"operation: accepted, queued, started, progress, attention, completed, failed, outcome_unknown",
		);
		expect(contract).toContain("semantic: change, focus, selection");
		expect(contract).toMatch(/Every\s+object key is serialized in lexical order, recursively\./u);
		expect(contract).toMatch(
			/Inactive operation callbacks send that message to `coordinatorThreadId`/u,
		);
		expect(contract).toContain("with role `developer`");
		expect(contract).toContain("is never the callback mutation target");
		for (const row of [
			"| `add`           | `thread/queue/add`     |",
			"| `update`        | `thread/queue/update`  |",
			"| `delete`        | `thread/queue/delete`  |",
			"| `reorder`       | `thread/queue/reorder` |",
			"| `start`         | `thread/queue/start`   |",
		]) {
			expect(contract).toContain(row);
		}
		expect(contract).toMatch(
			/Both the singular\s+`correlation\.queuedSubmissionId` and each `queuedSubmissionIds` entry allow at\s+most 1,024 UTF-8 bytes\./u,
		);
	});

	test("keeps exactly one blank line before the coordinator marker", () => {
		const workhorseBytes = workhorse();
		const extensionBytes = coordinatorExtension();
		const composed = composeCoordinatorInstructions();
		const boundary = composed.slice(
			workhorseBytes.length - 1,
			workhorseBytes.length + coordinatorSeparator.length + 3,
		);
		expect(boundary).toBe("\n\n--- ARCHBOARD COORDINATOR ROLE ---\nYou");
		expect(composed.match(/\n\n--- ARCHBOARD COORDINATOR ROLE ---\n/g)).toHaveLength(1);

		const attacks: [string, string, string][] = [
			[workhorseBytes.slice(0, -1), coordinatorSeparator, extensionBytes],
			[`${workhorseBytes}\n`, coordinatorSeparator, extensionBytes],
			[workhorseBytes, coordinatorSeparator.slice(1), extensionBytes],
			[workhorseBytes, `\n${coordinatorSeparator}`, extensionBytes],
			[workhorseBytes, coordinatorSeparator.slice(0, -1), extensionBytes],
			[workhorseBytes, `${coordinatorSeparator}\n`, extensionBytes],
		];
		for (const [changedWorkhorse, changedSeparator, unchangedExtension] of attacks) {
			expect(() =>
				composeCoordinatorInstructions(changedWorkhorse, changedSeparator, unchangedExtension),
			).toThrow();
		}
	});

	test("pins human-reviewed prose, instruction, classifier, and manifest bytes", () => {
		expect(contractBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
		expect(contract).not.toContain("\r");
		expect(contract.endsWith("\n")).toBe(true);
		expect(contract.endsWith("\n\n")).toBe(false);
		expect(contract.match(/`\\n--- ARCHBOARD COORDINATOR ROLE ---\\n`/g)).toHaveLength(1);
		for (const digest of reviewedDigests) requireReviewedDigest(digest);
	});
});
