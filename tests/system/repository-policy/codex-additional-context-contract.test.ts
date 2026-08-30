import { describe, expect, test } from "bun:test";
import {
	canonical,
	cloneManifest,
	evidenceRows,
	linkPolicy,
	manifest,
	operationPolicy,
	producerRows,
	reasonRows,
	record,
	records,
	strings,
	transitionRows,
	tupleRows,
	validateCanonicalContext,
	validateManifest,
} from "./support/codex-additional-context-policy.js";

describe("Codex additional-context authored policy", () => {
	test("matches the canonical context and fixed structured manifest", () => {
		expect(() => validateManifest(manifest)).not.toThrow();
		expect(() => validateCanonicalContext(canonical)).not.toThrow();
	});

	test("rejects reason deletion, reorder, addition, and duplication", () => {
		for (const [index, expected] of reasonRows.entries()) {
			const changed = cloneManifest();
			records(linkPolicy(changed).reasonPrecedence, "reasons").splice(index, 1);
			expect(() => validateManifest(changed)).toThrow(
				`threadLink reasons is missing ${expected.reason}`,
			);
		}
		const reordered = cloneManifest();
		const reorderedRows = records(linkPolicy(reordered).reasonPrecedence, "reasons");
		[reorderedRows[0], reorderedRows[1]] = [reorderedRows[1]!, reorderedRows[0]!];
		expect(() => validateManifest(reordered)).toThrow("threadLink reasons reordered stale_child");
		const added = cloneManifest();
		records(linkPolicy(added).reasonPrecedence, "reasons").push({
			reason: "unreviewed_reason",
			condition: "unreviewed_condition",
		});
		expect(() => validateManifest(added)).toThrow("threadLink reasons has extra unreviewed_reason");
		const duplicated = cloneManifest();
		const duplicatedRows = records(linkPolicy(duplicated).reasonPrecedence, "reasons");
		duplicatedRows.push(structuredClone(duplicatedRows[0]!));
		expect(() => validateManifest(duplicated)).toThrow(
			"threadLink reasons has duplicate stale_child",
		);
	});

	test("rejects producer structure and every producer contradiction", () => {
		for (const [index, expected] of producerRows.entries()) {
			const deleted = cloneManifest();
			records(operationPolicy(deleted).producers, "producers").splice(index, 1);
			expect(() => validateManifest(deleted)).toThrow(
				`operation producers is missing ${expected.kind}`,
			);

			for (const field of ["rpcs", "operationIdSource", "omitWhen"] as const) {
				const contradicted = cloneManifest();
				const producer = records(operationPolicy(contradicted).producers, "producers")[index]!;
				producer[field] = field === "operationIdSource" ? "wrong_source" : ["wrong_value"];
				expect(() => validateManifest(contradicted)).toThrow(
					`operation producers ${expected.kind} changed`,
				);
			}
		}
		const reordered = cloneManifest();
		const rows = records(operationPolicy(reordered).producers, "producers");
		[rows[0], rows[1]] = [rows[1]!, rows[0]!];
		expect(() => validateManifest(reordered)).toThrow(
			"operation producers reordered composer_message",
		);
		const added = cloneManifest();
		records(operationPolicy(added).producers, "producers").push({
			kind: "unreviewed_operation",
			rpcs: ["turn/start"],
			operationIdSource: "host_minted",
			omitWhen: [],
		});
		expect(() => validateManifest(added)).toThrow(
			"operation producers has extra unreviewed_operation",
		);
		const duplicated = cloneManifest();
		const duplicateRows = records(operationPolicy(duplicated).producers, "producers");
		duplicateRows.push(structuredClone(duplicateRows[0]!));
		expect(() => validateManifest(duplicated)).toThrow(
			"operation producers has duplicate composer_message",
		);
	});

	test("rejects every tuple-state mutation and transition drift", () => {
		for (const [index, expected] of tupleRows.entries()) {
			const changed = cloneManifest();
			records(operationPolicy(changed).tupleStates, "tuple states")[index]!.outcome = "wrong";
			expect(() => validateManifest(changed)).toThrow(`tuple states ${expected.state} changed`);
		}
		for (const [index, expected] of transitionRows.entries()) {
			const changed = cloneManifest();
			records(operationPolicy(changed).outcomeTransitions, "transitions").splice(index, 1);
			expect(() => validateManifest(changed)).toThrow(
				`outcome transitions is missing ${expected.from}:${expected.event}`,
			);
		}
		const reordered = cloneManifest();
		const reorderedRows = records(operationPolicy(reordered).outcomeTransitions, "transitions");
		[reorderedRows[0], reorderedRows[1]] = [reorderedRows[1]!, reorderedRows[0]!];
		expect(() => validateManifest(reordered)).toThrow(
			"outcome transitions reordered null:rpc_settled_successfully",
		);
		const duplicated = cloneManifest();
		const duplicateRows = records(operationPolicy(duplicated).outcomeTransitions, "transitions");
		duplicateRows.push(structuredClone(duplicateRows[0]!));
		expect(() => validateManifest(duplicated)).toThrow(
			"outcome transitions has duplicate null:rpc_settled_successfully",
		);
		const downgraded = cloneManifest();
		const transitions = records(operationPolicy(downgraded).outcomeTransitions, "transitions");
		transitions[3]!.to = "not_delivered";
		expect(() => validateManifest(downgraded)).toThrow(
			"outcome transitions outcome_unknown:exact_positive_correlation changed",
		);
		const illegal = cloneManifest();
		records(operationPolicy(illegal).outcomeTransitions, "transitions").push({
			from: "delivered",
			event: "turn_failed",
			to: "not_delivered",
		});
		expect(() => validateManifest(illegal)).toThrow(
			"outcome transitions has extra delivered:turn_failed",
		);
	});

	test("rejects lifecycle deletion, reorder, downgrade, and premature clearing", () => {
		for (const [index, expected] of evidenceRows.entries()) {
			const key = `${expected.event}:${"status" in expected ? expected.status : "-"}`;
			const deleted = cloneManifest();
			records(operationPolicy(deleted).turnEvidence, "turn evidence").splice(index, 1);
			expect(() => validateManifest(deleted)).toThrow(`turn evidence is missing ${key}`);

			const downgraded = cloneManifest();
			records(operationPolicy(downgraded).turnEvidence, "turn evidence")[index]!.outcome =
				"not_delivered";
			expect(() => validateManifest(downgraded)).toThrow(`turn evidence ${key} changed`);
		}
		const reordered = cloneManifest();
		const evidence = records(operationPolicy(reordered).turnEvidence, "turn evidence");
		[evidence[0], evidence[1]] = [evidence[1]!, evidence[0]!];
		expect(() => validateManifest(reordered)).toThrow("turn evidence reordered turn/started:-");
		const duplicated = cloneManifest();
		const duplicatedEvidence = records(operationPolicy(duplicated).turnEvidence, "turn evidence");
		duplicatedEvidence.push(structuredClone(duplicatedEvidence[0]!));
		expect(() => validateManifest(duplicated)).toThrow(
			"turn evidence has duplicate turn/started:-",
		);
		const earlyClear = cloneManifest();
		const earlyTerminal = record(operationPolicy(earlyClear).terminal, "terminal");
		earlyTerminal.clear = "before_terminal_callback_or_event";
		expect(() => validateManifest(earlyClear)).toThrow("terminal policy changed");
		for (const field of ["id", "kind", "rpc", "outcome"]) {
			const incompleteClear = cloneManifest();
			const terminal = record(operationPolicy(incompleteClear).terminal, "terminal");
			const clearFields = strings(terminal.clearFields, "clear fields");
			clearFields.splice(clearFields.indexOf(field), 1);
			expect(() => validateManifest(incompleteClear)).toThrow("terminal policy changed");
		}
		const repeatedTerminal = cloneManifest();
		record(operationPolicy(repeatedTerminal).terminal, "terminal").emit = "repeated";
		expect(() => validateManifest(repeatedTerminal)).toThrow("terminal policy changed");
	});

	test("rejects retry, recency inference, and thread-link nullability drift", () => {
		const retried = cloneManifest();
		operationPolicy(retried).retryAfterOutcomeUnknown = true;
		expect(() => validateManifest(retried)).toThrow("retry after outcome_unknown changed");
		const inferredLink = cloneManifest();
		linkPolicy(inferredLink).inferThreadFromRecency = true;
		expect(() => validateManifest(inferredLink)).toThrow("threadLink recency inference changed");
		const inferredStart = cloneManifest();
		record(
			operationPolicy(inferredStart).threadStartOutcomeUnknown,
			"thread/start uncertainty",
		).inferFromRecency = true;
		expect(() => validateManifest(inferredStart)).toThrow("thread/start uncertainty changed");
		for (const [field, label, value] of [
			["reasonNullStates", "reason-null states", "unbound"],
			["reasonRequiredStates", "reason-required states", "inspect_only"],
			["nonExecutableStatuses", "non-executable statuses", "systemError"],
		] as const) {
			const changed = cloneManifest();
			const values = strings(linkPolicy(changed)[field], label);
			values.splice(values.indexOf(value), 1);
			expect(() => validateManifest(changed)).toThrow(`${label} is missing ${value}`);
		}
	});

	test("rejects classification, omission, nested-id, and exclusion drift", () => {
		for (const failure of ["repeated_cursor", "transport_failure", "list_exhaustion_failure"]) {
			const changed = cloneManifest();
			const values = strings(linkPolicy(changed).classificationFailures, "failures");
			values.splice(values.indexOf(failure), 1);
			expect(() => validateManifest(changed)).toThrow(
				`classification failures is missing ${failure}`,
			);
			const stabilized = cloneManifest();
			records(linkPolicy(stabilized).reasonPrecedence, "reasons").push({
				reason: failure,
				condition: "classification_failed",
			});
			expect(() => validateManifest(stabilized)).toThrow(`threadLink reasons has extra ${failure}`);
		}
		for (const kind of ["create_thread_initial_turn", "fork_thread_initial_turn"]) {
			const changed = cloneManifest();
			const producer = records(operationPolicy(changed).producers, "producers").find(
				(row) => row.kind === kind,
			)!;
			producer.operationIdSource = "outer_operation_id";
			expect(() => validateManifest(changed)).toThrow(`operation producers ${kind} changed`);
		}
		const promptlessFork = cloneManifest();
		const fork = records(operationPolicy(promptlessFork).producers, "producers").find(
			(row) => row.kind === "fork_thread_initial_turn",
		)!;
		fork.omitWhen = [];
		expect(() => validateManifest(promptlessFork)).toThrow(
			"operation producers fork_thread_initial_turn changed",
		);
		for (const exclusion of [
			"interrupt",
			"queue",
			"semantic_injection",
			"callback_injection",
			"realtime_transport",
		]) {
			const changed = cloneManifest();
			const values = strings(operationPolicy(changed).excludedBoundaries, "excluded boundaries");
			values.splice(values.indexOf(exclusion), 1);
			expect(() => validateManifest(changed)).toThrow(
				`excluded boundaries is missing ${exclusion}`,
			);
		}
	});
});
