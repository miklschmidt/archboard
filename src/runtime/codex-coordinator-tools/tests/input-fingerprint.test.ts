import { describe, expect, test } from "bun:test";

import type { CoordinatorToolName } from "../../codex-coordinator-tool-contract/index.js";
import type { DynamicServerRequest } from "../../codex-transport/index.js";
import type { CoordinatorToolsServerRequest } from "../index.js";
import { copyRequest, fixture, responseEnvelope, type CoordinatorToolsFixture } from "./support.js";

type ToolArguments = DynamicServerRequest["params"]["arguments"];

interface FingerprintCase {
	readonly name: string;
	readonly tool: CoordinatorToolName;
	readonly owner: ToolArguments;
	readonly exact: ToolArguments;
	readonly mismatches: readonly ToolArguments[];
	readonly invalid: readonly ToolArguments[];
}

const CASES: readonly FingerprintCase[] = [
	{
		name: "inspect empty input",
		tool: "inspect_workhorse",
		owner: {},
		exact: {},
		mismatches: [],
		invalid: [null, [], "default", { extra: true }],
	},
	{
		name: "delegate fields and UTF-8",
		tool: "delegate_to_workhorse",
		owner: { input: "héllo🙂", transcriptDelta: "københavn" },
		exact: { transcriptDelta: "københavn", input: "héllo🙂" },
		mismatches: [
			{ input: "héllo🙃", transcriptDelta: "københavn" },
			{ input: "héllo🙂", transcriptDelta: "københåvn" },
		],
		invalid: [null, {}, { input: "héllo🙂" }, { input: "héllo🙂", transcriptDelta: "", extra: 1 }],
	},
	{
		name: "queue list operation",
		tool: "manage_workhorse_queue",
		owner: { operation: "list" },
		exact: { operation: "list" },
		mismatches: [{ operation: "add", prompt: "queued" }],
		invalid: [null, {}, { operation: "default" }, { operation: "list", extra: true }],
	},
	{
		name: "queue add prompt and operation",
		tool: "manage_workhorse_queue",
		owner: { operation: "add", prompt: "kø🙂" },
		exact: { prompt: "kø🙂", operation: "add" },
		mismatches: [{ operation: "add", prompt: "kø🙃" }, { operation: "list" }],
		invalid: [null, {}, { operation: "add" }, { operation: "add", prompt: "kø🙂", extra: 1 }],
	},
	{
		name: "queue update target, prompt, and operation",
		tool: "manage_workhorse_queue",
		owner: { operation: "update", submissionId: "submission-a", prompt: "first" },
		exact: { prompt: "first", submissionId: "submission-a", operation: "update" },
		mismatches: [
			{ operation: "update", submissionId: "submission-b", prompt: "first" },
			{ operation: "update", submissionId: "submission-a", prompt: "second" },
			{ operation: "delete", submissionId: "submission-a" },
		],
		invalid: [null, {}, { operation: "update", submissionId: "submission-a" }],
	},
	{
		name: "queue delete target and operation",
		tool: "manage_workhorse_queue",
		owner: { operation: "delete", submissionId: "submission-a" },
		exact: { submissionId: "submission-a", operation: "delete" },
		mismatches: [
			{ operation: "delete", submissionId: "submission-b" },
			{ operation: "start", submissionId: "submission-a" },
		],
		invalid: [
			null,
			{},
			{ operation: "delete" },
			{ operation: "delete", submissionId: "a", extra: 1 },
		],
	},
	{
		name: "queue reorder ids, order, and operation",
		tool: "manage_workhorse_queue",
		owner: { operation: "reorder", orderedSubmissionIds: ["submission-a", "submission-b"] },
		exact: { orderedSubmissionIds: ["submission-a", "submission-b"], operation: "reorder" },
		mismatches: [
			{ operation: "reorder", orderedSubmissionIds: ["submission-b", "submission-a"] },
			{ operation: "reorder", orderedSubmissionIds: ["submission-a", "submission-c"] },
			{ operation: "list" },
		],
		invalid: [null, {}, { operation: "reorder", orderedSubmissionIds: [] }],
	},
	{
		name: "queue start target and operation",
		tool: "manage_workhorse_queue",
		owner: { operation: "start", submissionId: "submission-a" },
		exact: { submissionId: "submission-a", operation: "start" },
		mismatches: [
			{ operation: "start", submissionId: "submission-b" },
			{ operation: "delete", submissionId: "submission-a" },
		],
		invalid: [
			null,
			{},
			{ operation: "start" },
			{ operation: "start", submissionId: "a", extra: 1 },
		],
	},
	{
		name: "steer input and UTF-8",
		tool: "steer_workhorse",
		owner: { input: "styr mod øst🙂" },
		exact: { input: "styr mod øst🙂" },
		mismatches: [{ input: "styr mod vest🙂" }, { input: "styr mod øst🙃" }],
		invalid: [null, {}, { input: "" }, { input: "styr", extra: true }],
	},
	{
		name: "spoken accept verdict",
		tool: "resolve_spoken_approval",
		owner: { verdict: "accept" },
		exact: { verdict: "accept" },
		mismatches: [{ verdict: "decline" }],
		invalid: [
			null,
			{},
			{ verdict: null },
			{ verdict: "default" },
			{ verdict: "accept", extra: true },
		],
	},
	{
		name: "spoken decline verdict",
		tool: "resolve_spoken_approval",
		owner: { verdict: "decline" },
		exact: { verdict: "decline" },
		mismatches: [{ verdict: "accept" }],
		invalid: [
			null,
			{},
			{ verdict: null },
			{ verdict: "default" },
			{ verdict: "decline", extra: true },
		],
	},
] as const;

function replayRequest(
	h: CoordinatorToolsFixture,
	request: ReturnType<CoordinatorToolsFixture["request"]>,
	label: string,
	argumentsValue: ToolArguments,
): ReturnType<CoordinatorToolsFixture["request"]> {
	const requestId = h.identity.decoder.adoptJsonRpcRequestId(label);
	return {
		...copyRequest(request),
		requestId,
		correlation: h.identity.decoder.createWireRequestCorrelation({ requestId }),
		params: { ...request.params, arguments: argumentsValue },
	};
}

function effectCount(h: CoordinatorToolsFixture, tool: CoordinatorToolName): number {
	switch (tool) {
		case "inspect_workhorse":
			return h.operations.calls.inspect.length;
		case "delegate_to_workhorse":
			return h.operations.calls.delegate.length;
		case "manage_workhorse_queue":
			return h.operations.calls.manageQueue.length;
		case "steer_workhorse":
			return h.operations.calls.steer.length;
		case "resolve_spoken_approval":
			return h.spokenApproval.calls.length;
	}
}

async function dispatch(
	h: CoordinatorToolsFixture,
	request: ReturnType<CoordinatorToolsFixture["request"]>,
) {
	return h.dispatcher.dispatch(request as CoordinatorToolsServerRequest);
}

describe("coordinator canonical input fingerprint boundary", () => {
	for (const fingerprintCase of CASES) {
		test(fingerprintCase.name, async () => {
			const h = fixture();
			const ownerRequest = h.request(fingerprintCase.tool, {
				arguments: fingerprintCase.owner,
			});
			const owner = await dispatch(h, ownerRequest);
			const exact = await dispatch(
				h,
				replayRequest(h, ownerRequest, `${fingerprintCase.name}-exact`, fingerprintCase.exact),
			);
			expect(exact.response).toEqual(owner.response);
			expect(responseEnvelope(exact.response).operationId).toBe(
				responseEnvelope(owner.response).operationId,
			);
			expect(effectCount(h, fingerprintCase.tool)).toBe(1);

			for (const [index, mismatch] of fingerprintCase.mismatches.entries()) {
				const request = replayRequest(
					h,
					ownerRequest,
					`${fingerprintCase.name}-mismatch-${index}`,
					mismatch,
				);
				const result = await dispatch(h, request);
				expect(result.response.success).toBe(false);
				expect(responseEnvelope(result.response)).toMatchObject({
					tag: "refused",
					reason: "invalid_call",
				});
				expect(result.response).not.toEqual(owner.response);
				expect(effectCount(h, fingerprintCase.tool)).toBe(1);
				expect(
					h.transport.writes.filter(({ request: write }) => write.requestId === request.requestId),
				).toHaveLength(1);
			}

			for (const [index, invalid] of fingerprintCase.invalid.entries()) {
				const request = replayRequest(
					h,
					ownerRequest,
					`${fingerprintCase.name}-invalid-${index}`,
					invalid,
				);
				const result = await dispatch(h, request);
				expect(result.response.success).toBe(false);
				expect(responseEnvelope(result.response)).toMatchObject({
					tag: "refused",
					reason: "invalid_call",
				});
				expect(result.response).not.toEqual(owner.response);
				expect(effectCount(h, fingerprintCase.tool)).toBe(1);
				expect(
					h.transport.writes.filter(({ request: write }) => write.requestId === request.requestId),
				).toHaveLength(1);
			}
		});
	}
});
