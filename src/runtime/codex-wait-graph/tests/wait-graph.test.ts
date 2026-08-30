import { describe, expect, test } from "bun:test";

import { createCodexWaitGraph, type OwnedWaitCleanupCause, type WaitOwner } from "../index.ts";
import { createIdentityAuthority } from "../../../shared/codex-workbench-identity/index.ts";

function identities() {
	const authority = createIdentityAuthority();
	return {
		child: authority.validator.childId,
		thread: (raw: string) => authority.decoder.adoptThreadId(raw),
		turn: (raw: string) => authority.decoder.adoptTurnId(raw),
		call: (raw: string) => authority.decoder.adoptDynamicToolCallId(raw),
	};
}

function owner(ids: ReturnType<typeof identities>, caller: string, label: string): WaitOwner {
	return {
		child: ids.child,
		caller: ids.thread(caller),
		turn: ids.turn(`${label}-turn`),
		call: ids.call(`${label}-call`),
	};
}

describe("Codex wait graph", () => {
	test("inserts a canonical multi-target edge set without mutating its input", () => {
		const ids = identities();
		const graph = createCodexWaitGraph();
		const waitOwner = owner(ids, "caller", "multi");
		const targets = [ids.thread("target-c"), ids.thread("target-a"), ids.thread("target-c")];

		const result = graph.addEdgeSet({ owner: waitOwner, targets });

		expect(result).toMatchObject({ ok: true });
		if (!result.ok) throw new Error("expected the edge set to be accepted");
		expect(result.edges.map((edge) => edge.target)).toEqual([
			ids.thread("target-a"),
			ids.thread("target-c"),
		]);
		expect(targets.map(String)).toEqual([
			ids.thread("target-c"),
			ids.thread("target-a"),
			ids.thread("target-c"),
		]);
		expect(graph.inspect()).toEqual(result.edges);
		expect(Object.isFrozen(result.edges)).toBe(true);
		expect(Object.isFrozen(result.edges[0])).toBe(true);
	});

	test("replaces one owner's edge set atomically and keeps its owner identity", () => {
		const ids = identities();
		const graph = createCodexWaitGraph();
		const waitOwner = owner(ids, "caller", "replace");

		expect(graph.addEdgeSet({ owner: waitOwner, targets: [ids.thread("old-target")] }).ok).toBe(
			true,
		);
		const replacement = graph.addEdgeSet({
			owner: waitOwner,
			targets: [ids.thread("new-target")],
		});

		expect(replacement).toMatchObject({ ok: true });
		expect(graph.inspect().map((edge) => edge.target)).toEqual([ids.thread("new-target")]);
		expect(graph.inspect()[0]?.owner).toEqual(waitOwner);
	});

	test("keeps the previous edge set when a replacement would create a cycle", () => {
		const ids = identities();
		const graph = createCodexWaitGraph();
		const first = owner(ids, "a", "atomic-a");
		const second = owner(ids, "b", "atomic-b");
		const oldTarget = ids.thread("old-target");

		expect(graph.addEdgeSet({ owner: first, targets: [oldTarget] }).ok).toBe(true);
		expect(graph.addEdgeSet({ owner: second, targets: [first.caller] }).ok).toBe(true);
		const refused = graph.addEdgeSet({ owner: first, targets: [second.caller] });

		expect(refused).toMatchObject({ ok: false, reason: "cycle" });
		expect(graph.inspect()).toEqual([
			{ owner: expect.objectContaining(first), target: oldTarget },
			{ owner: expect.objectContaining(second), target: first.caller },
		]);
	});

	test("refuses a direct self-wait and leaves no edge behind", () => {
		const ids = identities();
		const graph = createCodexWaitGraph();
		const waitOwner = owner(ids, "self", "direct");

		const result = graph.addEdgeSet({ owner: waitOwner, targets: [waitOwner.caller] });

		expect(result).toEqual({
			ok: false,
			reason: "cycle",
			child: ids.child,
			cycle: [waitOwner.caller, waitOwner.caller],
		});
		expect(graph.inspect()).toEqual([]);
	});

	test("refuses a deterministic two-node cycle", () => {
		const ids = identities();
		const graph = createCodexWaitGraph();
		const first = owner(ids, "a", "two-a");
		const second = owner(ids, "b", "two-b");

		expect(graph.addEdgeSet({ owner: first, targets: [second.caller] }).ok).toBe(true);
		const result = graph.addEdgeSet({ owner: second, targets: [first.caller] });

		expect(result).toMatchObject({
			ok: false,
			reason: "cycle",
			child: ids.child,
			cycle: [first.caller, second.caller, first.caller],
		});
		expect(graph.inspect()).toHaveLength(1);
	});

	test("refuses three-node and longer transitive cycles with closed paths", () => {
		const ids = identities();
		const graph = createCodexWaitGraph();
		const nodes = ["a", "b", "c", "d", "e"].map((name, index) => owner(ids, name, `long-${index}`));

		expect(graph.addEdgeSet({ owner: nodes[0]!, targets: [nodes[1]!.caller] }).ok).toBe(true);
		expect(graph.addEdgeSet({ owner: nodes[1]!, targets: [nodes[2]!.caller] }).ok).toBe(true);
		const three = graph.addEdgeSet({ owner: nodes[2]!, targets: [nodes[0]!.caller] });
		expect(three).toMatchObject({
			ok: false,
			reason: "cycle",
			cycle: [nodes[0]!.caller, nodes[1]!.caller, nodes[2]!.caller, nodes[0]!.caller],
		});

		expect(graph.addEdgeSet({ owner: nodes[2]!, targets: [nodes[3]!.caller] }).ok).toBe(true);
		expect(graph.addEdgeSet({ owner: nodes[3]!, targets: [nodes[4]!.caller] }).ok).toBe(true);
		const long = graph.addEdgeSet({ owner: nodes[4]!, targets: [nodes[0]!.caller] });
		expect(long).toMatchObject({
			ok: false,
			reason: "cycle",
			cycle: [
				nodes[0]!.caller,
				nodes[1]!.caller,
				nodes[2]!.caller,
				nodes[3]!.caller,
				nodes[4]!.caller,
				nodes[0]!.caller,
			],
		});
	});

	test("chooses the same exact cycle path regardless of edge insertion order", () => {
		const ids = identities();
		const first = owner(ids, "a", "path-a");
		const second = owner(ids, "b", "path-b");
		const third = owner(ids, "c", "path-c");
		const graph = createCodexWaitGraph();
		const reverse = createCodexWaitGraph();

		expect(graph.addEdgeSet({ owner: first, targets: [third.caller, second.caller] }).ok).toBe(
			true,
		);
		expect(graph.addEdgeSet({ owner: second, targets: [third.caller] }).ok).toBe(true);
		expect(graph.addEdgeSet({ owner: third, targets: [first.caller] })).toEqual({
			ok: false,
			reason: "cycle",
			child: ids.child,
			cycle: [first.caller, second.caller, third.caller, first.caller],
		});

		expect(reverse.addEdgeSet({ owner: third, targets: [first.caller] }).ok).toBe(true);
		expect(reverse.addEdgeSet({ owner: second, targets: [third.caller] }).ok).toBe(true);
		expect(reverse.addEdgeSet({ owner: first, targets: [second.caller, third.caller] })).toEqual({
			ok: false,
			reason: "cycle",
			child: ids.child,
			cycle: [first.caller, second.caller, third.caller, first.caller],
		});
	});

	test("removes only the exact owner for each non-child cleanup cause", () => {
		const causes: readonly OwnedWaitCleanupCause[] = [
			"settle",
			"decline",
			"cancellation",
			"interruption",
			"disconnect",
		];
		for (const [index, cause] of causes.entries()) {
			const ids = identities();
			const graph = createCodexWaitGraph();
			const waitOwner = owner(ids, `caller-${index}`, `cleanup-${index}`);
			const survivor = owner(ids, `survivor-${index}`, `survivor-${index}`);
			const target = ids.thread(`target-${index}`);

			expect(graph.addEdgeSet({ owner: waitOwner, targets: [target] }).ok).toBe(true);
			expect(graph.addEdgeSet({ owner: survivor, targets: [target] }).ok).toBe(true);
			expect(graph.release({ cause, owner: waitOwner })).toHaveLength(1);
			expect(graph.inspect()).toEqual([{ owner: expect.objectContaining(survivor), target }]);
			expect(graph.release({ cause, owner: waitOwner })).toEqual([]);
		}
	});

	test("child exit removes all of that child and preserves another child", () => {
		const first = identities();
		const second = identities();
		const graph = createCodexWaitGraph();
		const firstOwner = owner(first, "same-thread-a", "child-a");
		const firstOtherOwner = owner(first, "same-thread-b", "child-b");
		const secondOwner = owner(second, "same-thread-a", "child-c");
		const firstTarget = first.thread("same-target");
		const secondTarget = second.thread("same-target");

		expect(graph.addEdgeSet({ owner: firstOwner, targets: [firstTarget] }).ok).toBe(true);
		expect(graph.addEdgeSet({ owner: firstOtherOwner, targets: [firstTarget] }).ok).toBe(true);
		expect(graph.addEdgeSet({ owner: secondOwner, targets: [secondTarget] }).ok).toBe(true);

		expect(graph.release({ cause: "child-exit", child: first.child })).toHaveLength(2);
		expect(graph.inspect()).toEqual([
			{ owner: expect.objectContaining(secondOwner), target: secondTarget },
		]);
	});

	test("overlapping owners do not share cleanup or leave stale edges", () => {
		const ids = identities();
		const graph = createCodexWaitGraph();
		const first = owner(ids, "same-caller", "first");
		const second = owner(ids, "same-caller", "second");
		const target = ids.thread("same-target");

		expect(graph.addEdgeSet({ owner: first, targets: [target] }).ok).toBe(true);
		expect(graph.addEdgeSet({ owner: second, targets: [target] }).ok).toBe(true);
		expect(graph.release({ cause: "cancellation", owner: first })).toHaveLength(1);
		expect(graph.inspect()).toEqual([{ owner: expect.objectContaining(second), target }]);

		expect(graph.release({ cause: "disconnect", owner: first })).toEqual([]);
		expect(graph.release({ cause: "settle", owner: second })).toHaveLength(1);
		expect(
			graph.addEdgeSet({ owner: second, targets: [ids.thread("after-cleanup")] }),
		).toMatchObject({
			ok: true,
		});
	});

	test("isolates identical thread identities across child lifetimes", () => {
		const first = identities();
		const second = identities();
		const graph = createCodexWaitGraph();
		const firstA = owner(first, "a", "first-a");
		const firstB = owner(first, "b", "first-b");
		const secondA = owner(second, "a", "second-a");
		const secondB = owner(second, "b", "second-b");

		expect(firstA.caller).toBe(secondA.caller);
		expect(firstB.caller).toBe(secondB.caller);
		expect(graph.addEdgeSet({ owner: firstA, targets: [firstB.caller] }).ok).toBe(true);
		expect(graph.addEdgeSet({ owner: secondB, targets: [secondA.caller] }).ok).toBe(true);
		expect(graph.inspect()).toHaveLength(2);
		expect(graph.release({ cause: "child-exit", child: first.child })).toHaveLength(1);
		expect(graph.inspect()).toEqual([
			{ owner: expect.objectContaining(secondB), target: secondA.caller },
		]);
	});
});
