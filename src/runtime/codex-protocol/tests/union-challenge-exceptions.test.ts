import { describe, expect, test } from "bun:test";

import {
	ProtocolDecodeError,
	SERVER_NOTIFICATION_METHODS,
	decodeServerNotification,
} from "../index.js";
import { threadFixture } from "./fixtures.js";
import { notificationFixture } from "./notification-fixtures.js";
import { SERVER_NOTIFICATION_UNION_CHALLENGES } from "./union-challenges.js";

const EXPECTED_FUNCTION_CALL_OUTPUT_COLLAPSES = [
	"thread/started:thread.turns.items.functionCallOutput.output.input_image.detail",
	"thread/started:thread.turns.items.functionCallOutput.output.type",
	"turn/started:turn.items.functionCallOutput.output.input_image.detail",
	"turn/started:turn.items.functionCallOutput.output.type",
	"turn/completed:turn.items.functionCallOutput.output.input_image.detail",
	"turn/completed:turn.items.functionCallOutput.output.type",
	"item/started:item.functionCallOutput.output.input_image.detail",
	"item/started:item.functionCallOutput.output.type",
	"item/completed:item.functionCallOutput.output.input_image.detail",
	"item/completed:item.functionCallOutput.output.type",
	"rawResponseItem/completed:item.custom_tool_call_output.output.input_image.detail",
	"rawResponseItem/completed:item.custom_tool_call_output.output.type",
	"rawResponseItem/completed:item.function_call_output.output.input_image.detail",
	"rawResponseItem/completed:item.function_call_output.output.type",
] as const;

const DIRECT_REGULAR_UNION_CHALLENGES = [
	["error", "error.codexErrorInfo.activeTurnNotSteerable.turnKind"],
	["thread/started", "thread.source.subAgent"],
	["thread/started", "thread.turns.error.codexErrorInfo.activeTurnNotSteerable.turnKind"],
	["turn/started", "turn.error.codexErrorInfo.activeTurnNotSteerable.turnKind"],
	["turn/completed", "turn.error.codexErrorInfo.activeTurnNotSteerable.turnKind"],
] as const;

function issuePath(issue: unknown): string[] {
	if (typeof issue !== "object" || issue === null || !("path" in issue)) {
		return [];
	}
	return Array.isArray(issue.path) ? issue.path.map(String) : [];
}

function issueCode(issue: unknown): unknown {
	return typeof issue === "object" && issue !== null && "code" in issue ? issue.code : undefined;
}

describe("protocol union diagnostics", () => {
	test("contains only the 14 FunctionCallOutputBody output collapses", () => {
		const actual = SERVER_NOTIFICATION_METHODS.flatMap((method) =>
			SERVER_NOTIFICATION_UNION_CHALLENGES[method]
				.filter((challenge) => {
					const prepared = challenge.prepare(notificationFixture(method));
					return challenge.mutate(prepared).allowedContainingUnionPaths.length > 0;
				})
				.map((challenge) => `${method}:${challenge.name}`),
		).toSorted();

		expect(actual).toHaveLength(14);
		expect(actual).toEqual([...EXPECTED_FUNCTION_CALL_OUTPUT_COLLAPSES].toSorted());
	});

	test("normalizes the five regular union targets directly", () => {
		const observed = DIRECT_REGULAR_UNION_CHALLENGES.map(([method, name]) => {
			const challenge = SERVER_NOTIFICATION_UNION_CHALLENGES[method].find(
				(candidate) => candidate.name === name,
			);
			if (!challenge) {
				throw new Error(`missing challenge ${method}:${name}`);
			}
			const prepared = challenge.prepare(notificationFixture(method));
			const mutation = challenge.mutate(prepared);
			expect(mutation.allowedContainingUnionPaths).toEqual([]);
			try {
				decodeServerNotification({ method, params: mutation.params });
				throw new Error(`expected ${method}:${name} to fail`);
			} catch (error) {
				if (!(error instanceof ProtocolDecodeError)) {
					throw error;
				}
				expect(error.issues).toHaveLength(1);
				const [issue] = error.issues;
				const actualPath = issuePath(issue);
				expect(actualPath).toEqual(mutation.targetPath.map(String));
				return `${method}:${name}`;
			}
		});

		expect(observed).toEqual(
			DIRECT_REGULAR_UNION_CHALLENGES.map(([method, name]) => `${method}:${name}`),
		);
	});

	test("retains independent issues while normalizing a regular union", () => {
		let thrown: unknown;
		try {
			decodeServerNotification({
				method: "thread/started",
				params: {
					thread: {
						...threadFixture,
						id: 7,
						source: { subAgent: "futureUnionMember" },
					},
				},
			});
		} catch (error) {
			thrown = error;
		}
		if (!(thrown instanceof ProtocolDecodeError)) {
			throw new Error("expected independent protocol diagnostics");
		}
		expect(
			thrown.issues.map((issue) => ({
				path: issuePath(issue),
				code: issueCode(issue),
			})),
		).toEqual([
			{ path: ["thread", "id"], code: "invalid_type" },
			{ path: ["thread", "source", "subAgent"], code: "invalid_type" },
		]);
	});
});
