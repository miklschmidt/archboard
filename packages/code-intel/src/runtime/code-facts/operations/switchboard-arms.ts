// The operations a switchboard picks (ADR 0082), from the arms its grammar
// reads. A switchboard is a callable that picks what it runs by a closed key
// its caller passes; each operation it picks is a name its callers learn.
//
// An arm runs an operation when it calls something, or when it only writes
// state, as `Departure::Stayed => self.leaving = None` does. An arm that only
// selects or builds data runs none: a keyed getter and a failure built from
// its description stay one name. Two arms run one operation when they make
// the same calls, compared by callee and number of arguments, and an arm whose
// calls hold another arm's calls runs that arm's operation plus checks:
// `variantContent` parses with the shared schema path and checks more. So a
// shared default arm counts once, and each bespoke arm beside it counts too.

import type { PickedOperation, Switchboard } from "#runtime/code-facts/operations/facts.ts";

/** One arm of a pick, as a grammar reads it. */
interface Arm {
	/** The keys that pick it; `*` stands for every key no other arm names. */
	readonly keys: readonly string[];
	/** Whether a guard can let a named key continue to the catch-all. */
	readonly guarded?: boolean;
	/** The line it starts on. */
	readonly line: number;
	/** The calls it makes, outermost only, each as `callee/arguments`. */
	readonly calls: ReadonlySet<string>;
	/** The state it writes, as the code spells each target. */
	readonly writes: ReadonlySet<string>;
}

/**
 * Whether one set holds every member of another.
 * @param outer The set that may hold.
 * @param inner The set that may be held.
 * @returns True when it does.
 */
function holds(outer: ReadonlySet<string>, inner: ReadonlySet<string>): boolean {
	return [...inner].every((each) => outer.has(each));
}

/**
 * The identity of the operation an arm runs: its calls, or, for an arm that
 * only writes state, what it writes; undefined for an arm that runs none.
 * @param arm The arm.
 * @param arms Every arm of the pick.
 * @returns The identity.
 */
function operationOf(arm: Arm, arms: readonly Arm[]): string | undefined {
	if (arm.calls.size === 0) {
		return arm.writes.size === 0 ? undefined : `=${[...arm.writes].toSorted().join(",")}`;
	}
	const under = arms
		.filter(
			(other) =>
				other.calls.size > 0 && other.calls.size < arm.calls.size && holds(arm.calls, other.calls),
		)
		.toSorted((left, right) => left.calls.size - right.calls.size)[0];
	return [...(under ?? arm).calls].toSorted().join(",");
}

/**
 * The operations the arms of a pick run, in the order the body first picks each.
 * @param arms The arms, in the order the body tests them.
 * @returns The operations, with the keys of every arm that runs each.
 */
function operationsOf(arms: readonly Arm[]): PickedOperation[] {
	const operations = new Map<string, { keys: string[]; line: number }>();
	for (const arm of arms) {
		const identity = operationOf(arm, arms);
		if (identity === undefined) continue;
		const known = operations.get(identity);
		if (known === undefined) operations.set(identity, { keys: [...arm.keys], line: arm.line });
		else known.keys.push(...arm.keys);
	}
	return [...operations.values()];
}

/**
 * The operations with `*` spelled out as the keys of the closed set that no arm names.
 * @template T An operation or an arm with its effects.
 * @param operations The operations.
 * @param closed Every key of the closed set.
 * @param named The explicitly handled keys, including arms that run no operation.
 * @returns The reachable operations.
 */
function restSpelled<T extends PickedOperation>(
	operations: readonly T[],
	closed: readonly string[],
	named: readonly string[],
): T[] {
	const rest = closed.filter((key) => !named.includes(key));
	return operations.flatMap((each) => {
		const keys = each.keys.flatMap((key) => (key === "*" ? rest : [key]));
		return keys.length === 0 ? [] : [{ ...each, keys }];
	});
}

/**
 * Measure a dispatch, retaining both outcomes when the catch-all's reach is deferred.
 * @param arms The dispatch arms.
 * @param closed The closed keys, when known.
 * @param type The type that can close the key later.
 * @returns The operation facts, if either outcome can widen the interface.
 */
function dispatchOperations(
	arms: readonly Arm[],
	closed: readonly string[] | undefined,
	type: string | undefined,
): Pick<Switchboard, "type" | "namedKeys" | "exhaustiveOperations" | "operations"> | undefined {
	const namedKeys = arms.flatMap((arm) =>
		arm.guarded ? [] : arm.keys.filter((key) => key !== "*"),
	);
	const operations = operationsOf(
		closed === undefined ? arms : restSpelled(arms, closed, namedKeys),
	);
	const exhaustiveOperations =
		type !== undefined && arms.some((arm) => arm.keys.includes("*"))
			? operationsOf(restSpelled(arms, namedKeys, namedKeys))
			: operations;
	if (Math.max(operations.length, exhaustiveOperations.length) < 2) return undefined;
	return {
		operations,
		...(type === undefined ? {} : { type, namedKeys, exhaustiveOperations }),
	};
}

export { type Arm, dispatchOperations, restSpelled };
