import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.js";
import type {
	CodexEpochStore,
	EpochManifest,
	EpochOperationOutcome,
	EpochOperationStatus,
	EpochSnapshot,
} from "../index.js";
import {
	ATOMIC_PHASES,
	input,
	injectedFileSystem,
	makeStore,
	sentinel,
	withState,
	type AtomicPhase,
	type StateTarget,
	type TestState,
} from "./storage-failure-support.js";

type Transition = "stage" | "commit" | "rollback" | "outcome_unknown";
type RestartState = "before" | "corrupt" | "after";

interface Scenario {
	readonly before: EpochSnapshot;
	readonly operationId: string;
	readonly status: EpochOperationStatus;
	readonly outcome: EpochOperationOutcome;
	readonly order: "manifest-first" | "records-first";
	readonly action: (store: CodexEpochStore) => unknown;
}

const TRANSITIONS: readonly Transition[] = ["stage", "commit", "rollback", "outcome_unknown"];

describe("codex epoch durability boundaries", () => {
	for (const transition of TRANSITIONS) {
		test(`${transition} covers both twin targets and every atomic boundary`, () => {
			withState((state) => {
				const scenario = prepareScenario(state, transition);
				const beforeBytes = stateBytes(state);
				const beforeCodex = sentinel(state.codexHome);
				const beforeSqlite = sentinel(state.sqliteHome);
				for (const [targetIndex, target] of targetsFor(scenario.order).entries()) {
					for (const phase of ATOMIC_PHASES) {
						restoreState(state, beforeBytes);
						exerciseFailure(state, scenario, phase, targetIndex, target, beforeBytes);
						expect(sentinel(state.codexHome)).toEqual(beforeCodex);
						expect(sentinel(state.sqliteHome)).toEqual(beforeSqlite);
					}
				}
			});
		});
	}

	test("preserves the primary fsync failure when temp cleanup also fails", () => {
		withState((state) => {
			const authority = createIdentityAuthority();
			const store = makeStore(
				state,
				injectedFileSystem(state, {
					phase: "temp_fsync",
					target: "records",
					failCleanup: true,
				}),
			);
			const failure = captureFailure(() =>
				store.stageEpoch(input(authority, "cleanup-failure", "epoch_start")),
			);
			expect(failure).toMatchObject({ code: "durability_failed", cause: { phase: "temp_fsync" } });
			expect(readdirSync(state.root).some((entry) => entry.endsWith(".tmp"))).toBe(true);
		});
	});
});

function exerciseFailure(
	state: TestState,
	scenario: Scenario,
	phase: AtomicPhase,
	targetIndex: number,
	target: StateTarget,
	beforeBytes: StateBytes,
): void {
	const store = makeStore(state, injectedFileSystem(state, { phase, target }));
	const failure = captureFailure(() => scenario.action(store));
	expect(failure).toMatchObject({ code: "durability_failed" });
	expect(() =>
		store.stageEpoch(input(createIdentityAuthority(), "quarantine", "epoch_start")),
	).toThrowError(expect.objectContaining({ code: "durability_failed" }));
	assertRestart(state, scenario, expectedRestart(targetIndex, phase), beforeBytes);
}

function prepareScenario(state: TestState, transition: Transition): Scenario {
	const authority = createIdentityAuthority();
	const prepared = makeStore(state, injectedFileSystem(state));
	if (transition === "stage") {
		return {
			before: prepared.snapshot(),
			operationId: "epoch-stage",
			status: "staged",
			outcome: "pending",
			order: "records-first",
			action: (store) => store.stageEpoch(input(authority, "epoch-stage", "epoch_start")),
		};
	}
	prepared.startEpoch(input(authority, "epoch-start", "epoch_start"));
	const operationId = `operation-${transition}`;
	const kind = transitionKind(transition);
	const transaction = prepared.stageOperation(
		input(authority, operationId, kind, prepared.snapshot().cas),
	);
	const before = prepared.snapshot();
	if (transition === "commit") {
		const threadId = authority.decoder.adoptThreadId("committed-thread");
		return {
			before,
			operationId,
			status: "committed",
			outcome: "delivered",
			order: "manifest-first",
			action: (store) => store.commitOperation(transaction, { threadId }),
		};
	}
	if (transition === "rollback") {
		return {
			before,
			operationId,
			status: "rolled_back",
			outcome: "not_delivered",
			order: "manifest-first",
			action: (store) => store.rollbackOperation(transaction, "not delivered"),
		};
	}
	return {
		before,
		operationId,
		status: "inspect_only",
		outcome: "outcome_unknown",
		order: "manifest-first",
		action: (store) => store.markOutcomeUnknown(transaction, "settlement lost"),
	};
}

function transitionKind(transition: Transition): string {
	if (transition === "commit") return "link";
	if (transition === "outcome_unknown") return "create_thread";
	return "other";
}

function targetsFor(order: Scenario["order"]): readonly StateTarget[] {
	return order === "records-first" ? ["records", "manifest"] : ["manifest", "records"];
}

function expectedRestart(targetIndex: number, phase: AtomicPhase): RestartState {
	const afterRename = phase.startsWith("directory_");
	if (targetIndex === 0 && !afterRename) return "before";
	if (targetIndex === 1 && afterRename) return "after";
	return "corrupt";
}

interface StateBytes {
	readonly manifest: string | null;
	readonly records: string | null;
}

function stateBytes(state: TestState): StateBytes {
	return {
		manifest: readOptional(join(state.root, "epoch-manifest.json")),
		records: readOptional(join(state.root, "epoch-records.json")),
	};
}

function readOptional(path: string): string | null {
	return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function restoreState(state: TestState, baseline: StateBytes): void {
	const stateFiles = new Set(["epoch-manifest.json", "epoch-records.json"]);
	expect(readdirSync(state.root).filter((entry) => !stateFiles.has(entry))).toEqual([]);
	restoreFile(join(state.root, "epoch-manifest.json"), baseline.manifest);
	restoreFile(join(state.root, "epoch-records.json"), baseline.records);
	expect(stateBytes(state)).toEqual(baseline);
}

function restoreFile(path: string, contents: string | null): void {
	if (contents === null) {
		if (existsSync(path)) unlinkSync(path);
		return;
	}
	writeFileSync(path, contents, { mode: 0o600 });
}

function assertRestart(
	state: TestState,
	scenario: Scenario,
	restart: RestartState,
	beforeBytes: StateBytes,
): void {
	const afterBytes = stateBytes(state);
	if (restart === "before") {
		expect(makeStore(state).snapshot().manifest).toEqual(scenario.before.manifest);
		expect(afterBytes).toEqual(beforeBytes);
		return;
	}
	if (restart === "corrupt") {
		expect(() => makeStore(state).snapshot()).toThrowError(
			expect.objectContaining({ code: "corrupt_manifest" }),
		);
		expect(changedFileCount(beforeBytes, afterBytes)).toBe(1);
		return;
	}
	const snapshot = makeStore(state).snapshot();
	expect(snapshot.manifest.revision).toBe(scenario.before.manifest.revision + 1);
	expect(record(snapshot.manifest, scenario.operationId)).toMatchObject({
		status: scenario.status,
		outcome: scenario.outcome,
	});
	expect(afterBytes.manifest).toBe(afterBytes.records);
}

function changedFileCount(before: StateBytes, after: StateBytes): number {
	return Number(before.manifest !== after.manifest) + Number(before.records !== after.records);
}

function record(manifest: EpochManifest, operationId: string) {
	return manifest.records.find((candidate) => candidate.correlation.operationId === operationId);
}

function captureFailure(action: () => unknown): unknown {
	try {
		action();
	} catch (error) {
		return error;
	}
	throw new Error("expected injected durability failure");
}
