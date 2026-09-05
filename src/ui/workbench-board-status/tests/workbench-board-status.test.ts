import { describe, expect, test } from "bun:test";

import type { DoingEntry, LockHolder } from "@/ui/types";
import {
	claimFromLockHolder,
	projectWorkbenchBoardStatus,
	type WorkbenchBoardClaim,
	type WorkbenchBoardConnectionState,
	type WorkbenchSemanticContextState,
	type WorkbenchTakeBackState,
} from "@/ui/workbench-board-status";

const CONNECTION_STATES: readonly WorkbenchBoardConnectionState[] = [
	"disconnected",
	"reconnecting",
	"connected",
];
const TAKE_BACK_STATES: readonly WorkbenchTakeBackState[] = [
	"idle",
	"available",
	"pending",
	"success",
	"failure",
];
const SEMANTIC_STATES: readonly WorkbenchSemanticContextState[] = [
	{ state: "unavailable" },
	{ state: "fresh", detail: "Delivered to the linked workhorse." },
	{ state: "stale", reason: "The board cursor moved after capture." },
	{ state: "ambiguous", reasons: ["Two loaded thread matches."] },
	{ state: "refused", reason: "The linked thread is not loaded." },
	{ state: "outcome_unknown", reason: "The response was lost after send." },
];

const CLAIM: WorkbenchBoardClaim = Object.freeze({
	state: "claimed",
	holderId: "agent-7",
	holderKind: "agent",
	claimedAt: "2026-08-31T15:00:00.000Z",
	reason: "Rerouting the payment campaign",
});
const DOING: readonly DoingEntry[] = Object.freeze([
	Object.freeze({
		doing: "Moving the queue edge",
		at: "2026-08-31T15:01:00.000Z",
		by: "agent-7",
		kind: "agent",
		claimed: true,
	}),
	Object.freeze({
		doing: "Relabelling the checkout boundary",
		at: "2026-08-31T15:02:00.000Z",
		by: "agent-7",
		kind: "agent",
		claimed: true,
	}),
]);

/** The fields a projection case may vary. */
interface ProjectionOptions {
	readonly connection?: WorkbenchBoardConnectionState;
	readonly claim?: WorkbenchBoardClaim;
	readonly semanticContext?: WorkbenchSemanticContextState;
	readonly takeBack?: WorkbenchTakeBackState;
}

/**
 * Project one case.
 * @param options The fields that differ from the default.
 * @returns The snapshot.
 */
function project(options: ProjectionOptions = {}): ReturnType<typeof projectWorkbenchBoardStatus> {
	return projectWorkbenchBoardStatus({
		paneLabel: "Pane B",
		connection: options.connection ?? "connected",
		claim: options.claim ?? CLAIM,
		doing: DOING,
		takeBack: options.takeBack ?? "available",
		semanticContext: options.semanticContext ?? { state: "fresh", detail: "Delivered." },
	});
}

describe("workbench board status projection", () => {
	test("projects every closed connection, take-back, and semantic state by name", () => {
		for (const connection of CONNECTION_STATES) {
			const snapshot = project({ connection });
			expect(snapshot.connection.state).toBe(connection);
			expect(snapshot.connection.label.toLowerCase()).toBe(connection);
			expect(snapshot.activity).toBe(connection === "connected" ? "working" : "offline");
		}
		expect(project({ claim: { state: "unclaimed" } }).activity).toBe("ready");

		for (const takeBack of TAKE_BACK_STATES) {
			const snapshot = project({ takeBack });
			expect(snapshot.takeBack.state).toBe(takeBack);
			expect(snapshot.takeBack.label.length).toBeGreaterThan(0);
			expect(Object.isFrozen(snapshot.takeBack)).toBe(true);
		}
		expect(project({ takeBack: "failure" }).takeBack.announcement).toContain("Try again");

		for (const semanticContext of SEMANTIC_STATES) {
			const snapshot = project({ semanticContext });
			expect(snapshot.semanticContext.state).toBe(semanticContext.state);
			expect(snapshot.semanticContext.label.length).toBeGreaterThan(0);
			expect(snapshot.semanticContext.description.length).toBeGreaterThan(0);
		}
		expect(
			project({ semanticContext: { state: "ambiguous", reasons: [] } }).semanticContext,
		).toMatchObject({ description: "The semantic target is ambiguous." });
	});

	test("keeps campaign claim and per-write doing as separate immutable values", () => {
		const snapshot = project();
		expect(snapshot.claim).toMatchObject({
			state: "claimed",
			reason: "Rerouting the payment campaign",
		});
		expect(snapshot.doing.current?.doing).toBe("Relabelling the checkout boundary");
		expect(snapshot.doing.history.map((entry) => entry.doing)).toEqual([
			"Moving the queue edge",
			"Relabelling the checkout boundary",
		]);
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.claim)).toBe(true);
		expect(Object.isFrozen(snapshot.doing)).toBe(true);
		expect(Object.isFrozen(snapshot.doing.history)).toBe(true);
		expect(snapshot.doing.history).not.toBe(DOING);
		expect(DOING[0]?.doing).toBe("Moving the queue edge");
	});

	test("adapts only durable claims and retains their holder identity and reason", () => {
		const ordinaryWrite: LockHolder = {
			id: "agent-write",
			kind: "agent",
			since: "2026-08-31T14:00:00.000Z",
			until: "2026-08-31T14:00:01.000Z",
			process: "canvas",
			reason: "one write",
		};
		const durableClaim: LockHolder = { ...ordinaryWrite, claimed: true, reason: "campaign" };

		expect(claimFromLockHolder(null)).toEqual({ state: "unclaimed" });
		expect(claimFromLockHolder(ordinaryWrite)).toEqual({ state: "unclaimed" });
		expect(claimFromLockHolder(durableClaim)).toEqual({
			state: "claimed",
			holderId: "agent-write",
			holderKind: "agent",
			claimedAt: "2026-08-31T14:00:00.000Z",
			reason: "campaign",
		});
	});

	test("does not accept Codex execution state as board-status input", () => {
		const keys = Object.keys({
			paneLabel: "Pane B",
			connection: "connected",
			claim: CLAIM,
			doing: DOING,
			takeBack: "available",
			semanticContext: SEMANTIC_STATES[1],
		}).toSorted();
		expect(keys).toEqual([
			"claim",
			"connection",
			"doing",
			"paneLabel",
			"semanticContext",
			"takeBack",
		]);
		for (const forbidden of ["approval", "coordinator", "queue", "thread", "turn", "voice"]) {
			expect(keys).not.toContain(forbidden);
		}
	});
});
