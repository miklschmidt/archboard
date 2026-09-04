import { describe, expect, test } from "bun:test";

import { createCodexBrowserModel } from "../../../shared/codex-browser-model/index.js";
import {
	createIdentityAuthorities,
	type IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import { createCodexApprovalBroker } from "../../../runtime/codex-approvals/index.js";
import { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "../../../runtime/codex-spoken-approval/index.js";
import type { ThreadLinkSnapshot } from "../../../runtime/codex-thread-link/index.js";
import { projectCodexBrowserState } from "../index.js";
import type { BrowserProjectionInput, CodexQueueProjectionInput } from "../index.js";

const authorities = createIdentityAuthorities();
const identity = authorities.identity;
const model = createCodexBrowserModel(authorities);
const RAW_THREAD_ID = "queue-thread";
const threadId = identity.decoder.adoptThreadId(RAW_THREAD_ID);

type LinkStatus = Extract<ThreadLinkSnapshot, { readonly state: "executable" }>["status"];

function link(status: LinkStatus): ThreadLinkSnapshot {
	return {
		kind: "thread_link",
		state: "executable",
		childId: identity.validator.childId,
		epoch: identity.validator.epoch,
		threadId,
		source: "appServer",
		status,
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

function submissions(
	entries: readonly (readonly [string, string | null])[],
): CodexQueueProjectionInput {
	return {
		kind: "codex_queue",
		submissions: entries.map(([id, operationId]) => ({
			id: identity.decoder.adoptQueuedSubmissionId(id),
			input: [{ type: "text", text: `prompt for ${id}`, text_elements: [] }],
			operationId:
				operationId === null ? null : authorities.operation.decoder.parseOperationId(operationId),
		})) as CodexQueueProjectionInput["submissions"],
	};
}

/** A pending approval on the queue's own workhorse thread. */
function pendingApproval(): BrowserProjectionInput["approvals"] {
	const broker = createCodexApprovalBroker({
		identity,
		transport: { respond: () => Promise.resolve() },
	});
	const requestId = identity.decoder.adoptJsonRpcRequestId("queue-approval");
	const pending = broker.receive({
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		requestId,
		correlation: identity.decoder.createWireRequestCorrelation({ requestId }),
		method: "item/commandExecution/requestApproval",
		params: {
			threadId: RAW_THREAD_ID,
			turnId: "queue-turn",
			itemId: "queue-item",
			kind: "command",
			startedAtMs: 10,
			approvalId: "queue-approval-id",
			environmentId: null,
			reason: "Run the gate",
			networkApprovalContext: null,
			command: "bun run check",
			cwd: "/repo",
			commandActions: null,
			additionalPermissions: null,
			proposedExecpolicyAmendment: null,
			proposedNetworkPolicyAmendments: null,
			availableDecisions: ["accept", "decline"],
		},
		owner: "codex-approvals",
	} as never);
	return [broker.view(pending.requestId)];
}

function projectionInput(
	queue: CodexQueueProjectionInput,
	status: LinkStatus,
	approvals: BrowserProjectionInput["approvals"] = [],
): BrowserProjectionInput {
	return {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: {
			kind: "codex_account_response",
			response: {
				account: { type: "chatgpt", email: "queue@example.test", planType: "plus" },
				requiresOpenaiAuth: true,
			},
		},
		login: { kind: "login", state: "idle" },
		threadLink: link(status),
		threadCandidates: { kind: "codex_thread_candidates", state: "unknown" },
		timeline: null,
		queue,
		settings: [],
		approvals,
		dynamicApprovals: [],
		semantic: { kind: "codex_semantic", outcome: null, freshness: null },
		coordinator: {
			kind: "codex_coordinator",
			state: "ready",
			threadId,
			configured: null,
			effective: null,
			reason: null,
		},
		voice: {
			kind: "codex_voice",
			mediaReady: false,
			generation: null,
			coordinatorState: "ready",
			transcript: [],
		},
		spokenApproval: EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
		lease: null,
		operation: null,
	};
}

function projectedQueue(
	queue: CodexQueueProjectionInput,
	status: LinkStatus = "idle",
	approvals: BrowserProjectionInput["approvals"] = [],
) {
	const result = projectCodexBrowserState(
		model,
		identity.decoder,
		projectionInput(queue, status, approvals),
	);
	if (result.tag !== "projected")
		throw new Error(`queue projection was refused: ${result.message}`);
	return result.snapshot.queue;
}

const ONE = [["submission-one", null]] as const;

describe("workhorse queue projection", () => {
	test("derives the region status from the authoritative link and its approvals", () => {
		expect(projectedQueue({ kind: "codex_queue", submissions: null }).status).toBe("unavailable");
		expect(projectedQueue(submissions([])).status).toBe("empty");
		expect(projectedQueue(submissions(ONE), "idle").status).toBe("queued");
		expect(projectedQueue(submissions(ONE), "active").status).toBe("running");
		expect(projectedQueue(submissions(ONE), "active", pendingApproval()).status).toBe(
			"approval_blocked",
		);
	});

	test("an empty queue reads as empty whatever the workhorse is doing", () => {
		for (const status of ["idle", "active"] as const)
			expect(projectedQueue(submissions([]), status).status).toBe("empty");
	});

	test("carries the Archboard operation that queued each entry, and null for foreign ones", () => {
		const ours = authorities.operation.issuer.mintOperationId();
		const queue = projectedQueue(
			submissions([
				["ours", ours],
				["theirs", null],
			]),
		);

		expect(queue.entries.map((entry) => entry.operationId)).toEqual([ours, null]);
		expect(queue.entries.map((entry) => entry.prompt)).toEqual([
			"prompt for ours",
			"prompt for theirs",
		]);
	});

	test("every listed submission is pending, because the authoritative list holds only those", () => {
		const queue = projectedQueue(
			submissions([
				["one", null],
				["two", null],
			]),
			"active",
		);

		expect(queue.status).toBe("running");
		expect(queue.entries.map((entry) => entry.status)).toEqual(["queued", "queued"]);
	});

	test("a non-text submission is presented without inventing a prompt", () => {
		const queue = projectedQueue({
			kind: "codex_queue",
			submissions: [
				{
					id: identity.decoder.adoptQueuedSubmissionId("image-only"),
					input: [{ type: "image", url: "https://example.test/a.png" }],
					operationId: null,
				},
			] as CodexQueueProjectionInput["submissions"],
		});

		expect(queue.entries[0]?.prompt).toBe("[non-text input]");
	});
});

function authoritiesForOwnership(): IdentityAuthorities {
	return authorities;
}

test("the queue projection never invents an operation this authority did not issue", () => {
	const other = createIdentityAuthorities();
	const foreign = other.operation.decoder.serializeOperationId(
		other.operation.issuer.mintOperationId(),
	);

	expect(() => authoritiesForOwnership().operation.decoder.parseOperationId(foreign)).toThrow();
});
