import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
	AUTHORED_INSTRUCTION_DIGESTS,
	COORDINATOR_DEVELOPER_INSTRUCTIONS,
	COORDINATOR_ROLE_EXTENSION,
	COORDINATOR_ROLE_EXTENSION_SHA256,
	COORDINATOR_SEPARATOR,
	COORDINATOR_SEPARATOR_SHA256,
	COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
	WORKHORSE_DEVELOPER_INSTRUCTIONS,
	WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
	ArchboardContextSchema,
	AdditionalContextSchema,
	assertCanonicalInstructionBytes,
	ThreadForkParamsSchema,
	ThreadInjectItemsParamsSchema,
	TurnStartParamsSchema,
	TurnSteerParamsSchema,
	canonicalContext,
	createAdditionalContext,
	createSelfThreadForkParams,
	createTextUserInput,
	createThreadForkParams,
	createThreadInjectItemsParams,
	createTurnStartParams,
	createTurnSteerParams,
	decodeCanonicalContext,
	encodeCanonicalContext,
	verifyAuthoredInstructionIntegrity,
} from "../index.js";
import { contextFixture, instructionByteMutations } from "./fixtures.js";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const canonicalCwd = path.sep === "/" ? "/repo/archboard" : "C:\\repo\\archboard";
const reviewedContract = readFileSync(
	path.join(repoRoot, "docs/design/codex-workbench-authored-contracts.md"),
	"utf8",
);

function reviewedText(anchor: string): string {
	const anchorOffset = reviewedContract.indexOf(anchor);
	if (anchorOffset < 0) throw new Error(`Missing reviewed anchor ${anchor}`);
	const startMarker = "```text\n";
	const bodyOffset = reviewedContract.indexOf(startMarker, anchorOffset);
	if (bodyOffset < 0) throw new Error(`Missing reviewed text fence after ${anchor}`);
	const start = bodyOffset + startMarker.length;
	const end = reviewedContract.indexOf("\n```", start);
	if (end < 0) throw new Error(`Unterminated reviewed text fence after ${anchor}`);
	return `${reviewedContract.slice(start, end)}\n`;
}

function sha256(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

function reverseRecords(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(reverseRecords);
	if (typeof value !== "object" || value === null) return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.toReversed()
			.map(([key, child]) => [key, reverseRecords(child)]),
	);
}

describe("Codex instruction bytes", () => {
	test("loads the reviewed role documents without rewriting them", () => {
		expect(WORKHORSE_DEVELOPER_INSTRUCTIONS).toBe(
			reviewedText("### Workhorse developer instructions"),
		);
		expect(COORDINATOR_ROLE_EXTENSION).toBe(reviewedText("### Coordinator role extension"));
		expect(WORKHORSE_DEVELOPER_INSTRUCTIONS).not.toContain("\r");
		expect(COORDINATOR_ROLE_EXTENSION).not.toContain("\r");
		expect(WORKHORSE_DEVELOPER_INSTRUCTIONS.endsWith("\n")).toBe(true);
		expect(COORDINATOR_ROLE_EXTENSION.endsWith("\n")).toBe(true);
		expect(sha256(WORKHORSE_DEVELOPER_INSTRUCTIONS)).toBe(WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256);
		expect(sha256(COORDINATOR_ROLE_EXTENSION)).toBe(COORDINATOR_ROLE_EXTENSION_SHA256);
	});

	test("composes the coordinator with one blank line and fixed digests", () => {
		expect(COORDINATOR_DEVELOPER_INSTRUCTIONS).toBe(
			`${WORKHORSE_DEVELOPER_INSTRUCTIONS}${COORDINATOR_SEPARATOR}${COORDINATOR_ROLE_EXTENSION}`,
		);
		expect(COORDINATOR_DEVELOPER_INSTRUCTIONS).toContain(
			"\n\n--- ARCHBOARD COORDINATOR ROLE ---\n",
		);
		expect(
			COORDINATOR_DEVELOPER_INSTRUCTIONS.match(/\n\n--- ARCHBOARD COORDINATOR ROLE ---\n/g),
		).toHaveLength(1);
		expect(sha256(COORDINATOR_SEPARATOR)).toBe(COORDINATOR_SEPARATOR_SHA256);
		expect(sha256(COORDINATOR_DEVELOPER_INSTRUCTIONS)).toBe(
			COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
		);
		expect(AUTHORED_INSTRUCTION_DIGESTS).toEqual({
			workhorse: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
			coordinatorExtension: COORDINATOR_ROLE_EXTENSION_SHA256,
			separator: COORDINATOR_SEPARATOR_SHA256,
			composedCoordinator: COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
		});
		expect(verifyAuthoredInstructionIntegrity()).toEqual({
			workhorseSha256: WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256,
			coordinatorExtensionSha256: COORDINATOR_ROLE_EXTENSION_SHA256,
			separatorSha256: COORDINATOR_SEPARATOR_SHA256,
			composedCoordinatorSha256: COMPOSED_COORDINATOR_INSTRUCTIONS_SHA256,
		});
	});

	test("keeps byte mutation fixtures distinct from every reviewed digest", () => {
		const workhorseMutations = [
			instructionByteMutations.bom(WORKHORSE_DEVELOPER_INSTRUCTIONS),
			instructionByteMutations.crlf(WORKHORSE_DEVELOPER_INSTRUCTIONS),
			instructionByteMutations.missingTerminalLf(WORKHORSE_DEVELOPER_INSTRUCTIONS),
			instructionByteMutations.extraTerminalLf(WORKHORSE_DEVELOPER_INSTRUCTIONS),
			instructionByteMutations.trailingSpace(WORKHORSE_DEVELOPER_INSTRUCTIONS),
		];
		for (const mutation of workhorseMutations) {
			expect(() => assertCanonicalInstructionBytes("workhorse", mutation)).toThrow();
			expect(sha256(mutation)).not.toBe(WORKHORSE_DEVELOPER_INSTRUCTIONS_SHA256);
		}
		const separatorMutation = instructionByteMutations.wrongSeparator(COORDINATOR_SEPARATOR);
		expect(() => assertCanonicalInstructionBytes("separator", separatorMutation)).toThrow();
		expect(sha256(separatorMutation)).not.toBe(COORDINATOR_SEPARATOR_SHA256);

		const composedMutations = [
			instructionByteMutations.missingTerminalLf(COORDINATOR_DEVELOPER_INSTRUCTIONS),
			instructionByteMutations.extraTerminalLf(COORDINATOR_DEVELOPER_INSTRUCTIONS),
			instructionByteMutations.trailingSpace(COORDINATOR_DEVELOPER_INSTRUCTIONS),
			COORDINATOR_DEVELOPER_INSTRUCTIONS.replace(
				COORDINATOR_SEPARATOR,
				instructionByteMutations.wrongSeparator(COORDINATOR_SEPARATOR),
			),
			`${WORKHORSE_DEVELOPER_INSTRUCTIONS.slice(0, -1)}${COORDINATOR_SEPARATOR}${COORDINATOR_ROLE_EXTENSION}`,
			`${WORKHORSE_DEVELOPER_INSTRUCTIONS}\n${COORDINATOR_SEPARATOR}${COORDINATOR_ROLE_EXTENSION}`,
		];
		for (const mutation of composedMutations)
			expect(() => assertCanonicalInstructionBytes("composedCoordinator", mutation)).toThrow();
	});
});

describe("canonical additional context", () => {
	test("emits the one application entry and the reviewed key order", () => {
		const encoded = encodeCanonicalContext(contextFixture);
		const additionalContext = createAdditionalContext(contextFixture);
		expect(Object.keys(additionalContext)).toEqual(["archboard"]);
		expect(Object.keys(additionalContext.archboard)).toEqual(["kind", "value"]);
		expect(additionalContext).toEqual({
			archboard: { kind: "application", value: encoded },
		});
		expect(JSON.stringify(JSON.parse(encoded))).toBe(encoded);
		expect(decodeCanonicalContext(encoded)).toEqual(canonicalContext(contextFixture));
		expect(Object.isFrozen(additionalContext)).toBe(true);
		expect(Object.isFrozen(additionalContext.archboard)).toBe(true);
	});

	test("normalizes input order but rejects noncanonical encoded order and whitespace", () => {
		const encoded = encodeCanonicalContext(contextFixture);
		const reordered = JSON.stringify(reverseRecords(JSON.parse(encoded)));
		expect(encodeCanonicalContext(reverseRecords(contextFixture) as typeof contextFixture)).toBe(
			encoded,
		);
		expect(() => decodeCanonicalContext(reordered)).toThrow(/order/);
		expect(() => decodeCanonicalContext(` ${encoded}`)).toThrow(/whitespace/);
		expect(() => decodeCanonicalContext(encoded.replace('"schema":1', '"schema":2'))).toThrow();
	});

	test("rejects prose, unknown fields, omitted fields, and limit overflow", () => {
		expect(() =>
			encodeCanonicalContext({
				...contextFixture,
				prose: "caller-authored instructions",
			} as typeof contextFixture),
		).toThrow();
		expect(() =>
			encodeCanonicalContext({
				...contextFixture,
				board: { ...contextFixture.board, unknown: true },
			} as typeof contextFixture),
		).toThrow();
		const { operation: omittedOperation, ...omitted } = contextFixture;
		void omittedOperation;
		expect(() => encodeCanonicalContext(omitted as typeof contextFixture)).toThrow();
		expect(() =>
			encodeCanonicalContext({
				...contextFixture,
				semantic: { ...contextFixture.semantic, brief: "😀".repeat(2_049) },
			} as typeof contextFixture),
		).toThrow(/semantic brief/);
		expect(() =>
			encodeCanonicalContext({
				...contextFixture,
				selection: { ...contextFixture.selection, elementIds: ["x".repeat(65)] },
			} as typeof contextFixture),
		).toThrow(/selection element id/);
		expect(() =>
			encodeCanonicalContext({
				...contextFixture,
				ambiguity: ["x".repeat(257)],
			} as typeof contextFixture),
		).toThrow(/ambiguity/);
		expect(() =>
			encodeCanonicalContext({
				...contextFixture,
				board: { ...contextFixture.board, cursor: "x".repeat(1_025) },
			} as typeof contextFixture),
		).toThrow(/cursor/);
		expect(() => ArchboardContextSchema.parse({ ...contextFixture, schema: 2 })).toThrow();
	});
});

describe("literal turn and injection bodies", () => {
	test("builds exactly one generated UserInput for turn/start and turn/steer", () => {
		const start = createTurnStartParams({
			threadId: "thread-1",
			clientUserMessageId: "message-1",
			prompt: "Inspect the selected node.",
			context: contextFixture,
		});
		const steer = createTurnSteerParams({
			threadId: "thread-1",
			clientUserMessageId: "message-2",
			prompt: "Keep the same target.",
			context: contextFixture,
			expectedTurnId: "turn-1",
		});
		expect(Object.keys(start)).toEqual([
			"threadId",
			"clientUserMessageId",
			"input",
			"turnTrigger",
			"additionalContext",
		]);
		expect(start.input).toEqual([
			{ type: "text", text: "Inspect the selected node.", text_elements: [] },
		]);
		expect(Object.keys(steer)).toEqual([
			"threadId",
			"clientUserMessageId",
			"input",
			"additionalContext",
			"expectedTurnId",
		]);
		expect(steer.input[0]?.type).toBe("text");
		expect(steer.input[0]?.text_elements).toEqual([]);
		expect(createTextUserInput("standalone")).toEqual({
			type: "text",
			text: "standalone",
			text_elements: [],
		});
		expect(JSON.stringify(start)).not.toContain('"role":"developer"');
		expect(TurnStartParamsSchema.parse(start)).toEqual(start);
		expect(TurnSteerParamsSchema.parse(steer)).toEqual(steer);
		expect(Object.isFrozen(start.input[0])).toBe(true);
	});

	test("keeps developer-role input_text exclusive to thread/inject_items", () => {
		const injection = createThreadInjectItemsParams({
			threadId: "thread-1",
			context: contextFixture,
		});
		expect(injection).toEqual({
			threadId: "thread-1",
			items: [
				{
					type: "message",
					role: "developer",
					content: [{ type: "input_text", text: encodeCanonicalContext(contextFixture) }],
				},
			],
		});
		expect(ThreadInjectItemsParamsSchema.parse(injection)).toEqual(injection);
		expect(Object.keys(injection.items[0]!)).toEqual(["type", "role", "content"]);
		expect(Object.isFrozen(injection.items[0]!.content[0])).toBe(true);
		expect(() =>
			TurnStartParamsSchema.parse({
				...createTurnStartParams({
					threadId: "thread-1",
					clientUserMessageId: "message-1",
					prompt: "text",
					context: contextFixture,
				}),
				input: [
					{
						type: "message",
						role: "developer",
						content: [{ type: "input_text", text: "wrong channel" }],
					},
				],
			}),
		).toThrow();
	});

	test("rejects body schema, omission, prose, and prompt limit mutations", () => {
		const start = createTurnStartParams({
			threadId: "thread-1",
			clientUserMessageId: "message-1",
			prompt: "text",
			context: contextFixture,
		});
		expect(() => TurnStartParamsSchema.parse({ ...start, prose: "wrong" })).toThrow();
		const { additionalContext, ...withoutContext } = start;
		void additionalContext;
		expect(() => TurnStartParamsSchema.parse(withoutContext)).toThrow();
		expect(() =>
			createTurnStartParams({
				threadId: "thread-1",
				clientUserMessageId: "message-1",
				prompt: "😀".repeat(4_097),
				context: contextFixture,
			}),
		).toThrow(/16,384/);
		const steer = createTurnSteerParams({
			threadId: "thread-1",
			clientUserMessageId: "message-2",
			prompt: "text",
			context: contextFixture,
			expectedTurnId: "turn-1",
		});
		const { expectedTurnId, ...withoutExpectedTurnId } = steer;
		void expectedTurnId;
		expect(() => TurnSteerParamsSchema.parse(withoutExpectedTurnId)).toThrow();
		expect(() => AdditionalContextSchema.parse({ archboard: additionalContext })).toThrow();
	});
});

describe("literal fork body", () => {
	test("uses the reviewed profile and only the optional beforeTurnId", () => {
		const fork = createThreadForkParams({ threadId: "thread-1", cwd: canonicalCwd });
		expect(Object.keys(fork)).toEqual([
			"threadId",
			"cwd",
			"runtimeWorkspaceRoots",
			"developerInstructions",
			"ephemeral",
			"threadSource",
			"excludeTurns",
		]);
		expect(fork).toMatchObject({
			threadId: "thread-1",
			cwd: canonicalCwd,
			runtimeWorkspaceRoots: [canonicalCwd],
			developerInstructions: WORKHORSE_DEVELOPER_INSTRUCTIONS,
			ephemeral: false,
			threadSource: "archboard",
			excludeTurns: true,
		});
		const bounded = createThreadForkParams({
			threadId: "thread-1",
			cwd: canonicalCwd,
			beforeTurnId: "turn-1",
		});
		expect(Object.keys(bounded)).toEqual([
			"threadId",
			"beforeTurnId",
			"cwd",
			"runtimeWorkspaceRoots",
			"developerInstructions",
			"ephemeral",
			"threadSource",
			"excludeTurns",
		]);
		expect(ThreadForkParamsSchema.parse(bounded)).toEqual(bounded);
		expect(() =>
			createThreadForkParams({
				threadId: "thread-1",
				cwd: "relative/repo",
			}),
		).toThrow(/absolute/);
		expect(() => ThreadForkParamsSchema.parse({ ...fork, lastTurnId: "turn-1" })).toThrow();
	});

	test("self-fork sets the executing turn and ignores no other profile fields", () => {
		const fork = createSelfThreadForkParams({
			threadId: "thread-1",
			cwd: canonicalCwd,
			executingTurnId: "executing-turn",
		});
		expect(fork.beforeTurnId).toBe("executing-turn");
		expect(Object.keys(fork)).toContain("beforeTurnId");
		expect(() =>
			createThreadForkParams({
				threadId: "thread-1",
				cwd: canonicalCwd,
				beforeTurnId: undefined,
				unexpected: true,
			} as unknown as Parameters<typeof createThreadForkParams>[0]),
		).toThrow();
	});
});
