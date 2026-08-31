import { describe, expect, test } from "bun:test";

import {
	decisionOutcomes,
	dispatcherOrder,
	effectFields,
	identityFields,
	revalidationFailures,
	waitReleaseEvents,
} from "./support/codex-dynamic-approval-fixed.js";
import {
	clonePolicy,
	policy,
	record,
	records,
	strings,
	validatePolicy,
	type JsonRecord,
} from "./support/codex-dynamic-approval-policy.js";

type Selector<T> = (root: JsonRecord) => T;

function request(root: JsonRecord): JsonRecord {
	return record(root.request, "request");
}

function decision(root: JsonRecord): JsonRecord {
	return record(root.decision, "decision");
}

function revalidation(root: JsonRecord): JsonRecord {
	return record(root.revalidation, "revalidation");
}

function operationIds(root: JsonRecord): JsonRecord {
	return record(root.operationIds, "operation IDs");
}

function dispatcher(root: JsonRecord): JsonRecord {
	return record(root.dispatcher, "dispatcher");
}

function waitPolicy(root: JsonRecord): JsonRecord {
	return record(root.waitThreads, "wait_threads");
}

function attackOrdered(
	selector: Selector<string[]>,
	expected: readonly string[],
	label: string,
): void {
	const missing = clonePolicy();
	selector(missing).splice(0, 1);
	expect(() => validatePolicy(missing)).toThrow(`${label} is missing ${expected[0]}`);

	const extra = clonePolicy();
	selector(extra).push("unreviewed");
	expect(() => validatePolicy(extra)).toThrow(`${label} has extra unreviewed`);

	const duplicate = clonePolicy();
	selector(duplicate).push(expected[0]!);
	expect(() => validatePolicy(duplicate)).toThrow(`${label} has duplicate ${expected[0]}`);

	const reordered = clonePolicy();
	selector(reordered).splice(0, 2, expected[1]!, expected[0]!);
	expect(() => validatePolicy(reordered)).toThrow(`${label} is reordered`);
}

function attackRows(selector: Selector<JsonRecord[]>): void {
	const original = selector(policy);
	for (const [index, row] of original.entries()) {
		for (const field of Object.keys(row)) {
			const changed = clonePolicy();
			selector(changed)[index]![field] = "unreviewed";
			expect(() => validatePolicy(changed)).toThrow();
		}
	}
	const missing = clonePolicy();
	selector(missing).pop();
	expect(() => validatePolicy(missing)).toThrow();
	const duplicate = clonePolicy();
	selector(duplicate).push(structuredClone(selector(duplicate)[0]!));
	expect(() => validatePolicy(duplicate)).toThrow();
	const reordered = clonePolicy();
	selector(reordered).reverse();
	expect(() => validatePolicy(reordered)).toThrow();
}

function attackObject(selector: Selector<JsonRecord>, label: string): void {
	const original = selector(policy);
	for (const field of Object.keys(original)) {
		const changed = clonePolicy();
		selector(changed)[field] = "unreviewed";
		expect(() => validatePolicy(changed)).toThrow(label);
	}
	const missing = clonePolicy();
	delete selector(missing)[Object.keys(original)[0]!];
	expect(() => validatePolicy(missing)).toThrow(label);
	const extra = clonePolicy();
	selector(extra).unreviewed = true;
	expect(() => validatePolicy(extra)).toThrow(label);
}

describe("dynamic coordination approval authored policy", () => {
	test("accepts the closed reviewed policy", () => {
		expect(() => validatePolicy(policy)).not.toThrow();
		expect(policy.schema).toBe(1);
	});

	test("rejects missing, extra, duplicate, or reordered request identity and effect fields", () => {
		attackOrdered(
			(root) => strings(request(root).identityFields, "identity fields"),
			identityFields,
			"identity fields",
		);
		attackOrdered(
			(root) => strings(request(root).effectFields, "effect fields"),
			effectFields,
			"effect fields",
		);
		attackOrdered(
			(root) => strings(request(root).fieldOrder, "request field order"),
			["identity", "effect", "effectHash", "createdAtMs", "expiresAtMs"],
			"request field order",
		);
	});

	test("rejects every effect variant and fork-boundary drift", () => {
		attackRows((root) => records(request(root).effects, "effects"));
		attackObject(
			(root) => record(request(root).selfForkBoundary, "self-fork boundary"),
			"self-fork boundary changed",
		);
		attackObject(
			(root) => record(request(root).otherForkBoundary, "other-fork boundary"),
			"other-fork boundary changed",
		);
		attackObject(
			(root) => record(request(root).hash, "effect hash policy"),
			"effect hash policy changed",
		);
	});

	test("rejects expiry, freshness, and any cached or reused authority", () => {
		attackObject((root) => record(request(root).expiry, "expiry policy"), "expiry policy changed");
		attackObject(
			(root) => record(request(root).freshness, "freshness policy"),
			"freshness policy changed",
		);
	});

	test("rejects decision union, echo, cause, cancellation, and disconnect drift", () => {
		attackOrdered(
			(root) => strings(decision(root).outcomes, "decision outcomes"),
			decisionOutcomes,
			"decision outcomes",
		);
		attackOrdered(
			(root) => strings(decision(root).fieldOrder, "decision fields"),
			["outcome", "identity", "effectHash", "decidedAtMs", "cause"],
			"decision fields",
		);
		attackObject(
			(root) => record(decision(root).timestampAuthority, "decision timestamp authority"),
			"decision timestamp authority changed",
		);
		attackOrdered(
			(root) => strings(decision(root).personDecisionOutcomes, "person decision outcomes"),
			["approved", "declined"],
			"person decision outcomes",
		);
		attackOrdered(
			(root) => strings(decision(root).hostTerminalOutcomes, "host terminal outcomes"),
			["expired", "cancelled", "disconnected"],
			"host terminal outcomes",
		);
		attackOrdered(
			(root) => strings(decision(root).personDecisionAcceptedWhen, "person decision acceptance"),
			[
				"request_is_pending",
				"identity_exactly_echoes_request",
				"effect_hash_exactly_echoes_request",
				"same_host_nowMs_stamped_as_decidedAtMs_is_before_expiresAtMs",
			],
			"person decision acceptance",
		);
		attackRows((root) => records(decision(root).causes, "decision causes"));
		const callerTimestamp = clonePolicy();
		record(
			decision(callerTimestamp).timestampAuthority,
			"decision timestamp authority",
		).callerSupplied = true;
		expect(() => validatePolicy(callerTimestamp)).toThrow("decision timestamp authority changed");
		const splitClock = clonePolicy();
		record(
			decision(splitClock).timestampAuthority,
			"decision timestamp authority",
		).personDecisionAcceptedWhen = "browser_decidedAtMs < expiresAtMs";
		expect(() => validatePolicy(splitClock)).toThrow("decision timestamp authority changed");
		const causes = records(decision(policy).causes, "decision causes").map(
			(row) => `${String(row.outcome)}:${String(row.cause)}`,
		);
		expect(causes).toEqual([
			"approved:person_approved",
			"declined:person_declined",
			"expired:deadline_reached",
			"cancelled:call_cancelled",
			"cancelled:caller_turn_interrupted",
			"cancelled:host_shutdown",
			"disconnected:browser_disconnected",
			"disconnected:child_disconnected",
		]);
	});

	test("rejects late-decision, duplicate-decision, or approval_required resume paths", () => {
		attackObject(
			(root) => record(decision(root).terminal, "decision terminal policy"),
			"decision terminal policy changed",
		);
		attackObject(
			(root) => record(decision(root).approvalRequired, "approval_required policy"),
			"approval_required policy changed",
		);
		const resumable = clonePolicy();
		record(decision(resumable).approvalRequired, "approval_required").resumable = true;
		expect(() => validatePolicy(resumable)).toThrow("approval_required policy changed");
		const resumeCommand = clonePolicy();
		record(decision(resumeCommand).approvalRequired, "approval_required").resumeCommand =
			"resume_dynamic_call";
		expect(() => validatePolicy(resumeCommand)).toThrow("approval_required policy changed");
	});

	test("rejects every stale revalidation and refusal mapping change", () => {
		attackRows((root) => records(revalidation(root).failures, "revalidation failures"));
		const failures = records(revalidation(policy).failures, "revalidation failures");
		expect(failures.find((row) => row.condition === "logical_call_no_longer_executing")).toEqual({
			condition: "logical_call_no_longer_executing",
			reason: "invalid_call",
		});
		expect(
			failures.find((row) => row.condition === "non_self_fork_or_send_target_became_active"),
		).toEqual({
			condition: "non_self_fork_or_send_target_became_active",
			reason: "busy",
		});
		expect(failures.some((row) => row.condition === "fork_or_send_target_became_active")).toBe(
			false,
		);
		const stoppedCallRace = clonePolicy();
		const stoppedCall = records(
			revalidation(stoppedCallRace).failures,
			"revalidation failures",
		).find((row) => row.condition === "logical_call_no_longer_executing");
		if (stoppedCall === undefined) throw new Error("logical call race row is missing");
		stoppedCall.reason = "approval_required";
		expect(() => validatePolicy(stoppedCallRace)).toThrow("revalidation failures changed");
		expect(revalidationFailures.map((row) => row.reason)).toEqual([
			"invalid_call",
			"invalid_call",
			"stale_child",
			"prior_epoch",
			"unknown_provenance",
			"not_loaded",
			"not_controllable",
			"system_error",
			"busy",
			"cycle",
			"invalid_call",
			"expired",
		]);
		attackObject(
			(root) => record(revalidation(root).freshContext, "fresh context policy"),
			"fresh context policy changed",
		);
		attackObject(
			(root) => record(revalidation(root).staleApprovedDecision, "stale decision"),
			"stale approved decision changed",
		);
	});

	test("rejects every operation-ID boundary or reuse change", () => {
		attackRows((root) => records(operationIds(root).boundaries, "operation ID boundaries"));
		attackRows((root) => records(operationIds(root).contextOperations, "context operation rows"));
		attackObject(
			(root) =>
				record(operationIds(root).unresolvedTerminalAuthority, "unresolved terminal authority"),
			"unresolved terminal authority changed",
		);
		for (const field of [
			"clientUserMessageId",
			"retireOn",
			"consumeOn",
			"reusable",
			"newIdForRetry",
			"callerSuppliedId",
			"castFromAnotherIdentity",
			"adHocMinting",
		]) {
			const changed = clonePolicy();
			operationIds(changed)[field] = true;
			expect(() => validatePolicy(changed)).toThrow();
		}
	});

	test("rejects any dispatcher reorder, retry, duplicate settlement, or response path", () => {
		attackOrdered(
			(root) => strings(dispatcher(root).order, "dispatcher order"),
			dispatcherOrder,
			"dispatcher order",
		);
		attackRows((root) => records(dispatcher(root).operationGroups, "operation groups"));
		for (const field of [
			"initialTurnCondition",
			"mutationRetry",
			"provenanceSettlement",
			"toolResultConstruction",
			"transportResponseAttempt",
			"childDisconnectResponse",
		]) {
			const changed = clonePolicy();
			dispatcher(changed)[field] = "unreviewed";
			expect(() => validatePolicy(changed)).toThrow("dispatcher terminal rules changed");
		}
	});

	test("rejects wait owner or release drift for every reachable terminal event", () => {
		attackOrdered(
			(root) => strings(waitPolicy(root).ownerFields, "wait owner fields"),
			[
				"child",
				"epoch",
				"threadId",
				"turnId",
				"callId",
				"namespace",
				"tool",
				"manifestHash",
				"sortedTargetThreadIds",
			],
			"wait owner fields",
		);
		attackRows((root) => records(waitPolicy(root).release, "wait releases"));
		expect(records(waitPolicy(policy).release, "wait releases").map((row) => row.event)).toEqual(
			waitReleaseEvents,
		);
		for (const field of ["retainedOwnerAfterRelease", "reusedOwner", "releaseAfterResponse"]) {
			const changed = clonePolicy();
			waitPolicy(changed)[field] = true;
			expect(() => validatePolicy(changed)).toThrow("wait terminal policy changed");
		}
	});

	test("rejects port responsibility, forbidden fallback, or ownership drift", () => {
		attackRows((root) => records(root.ports, "ports"));
		attackObject((root) => record(root.ownership, "ownership"), "ownership changed");
	});
});
