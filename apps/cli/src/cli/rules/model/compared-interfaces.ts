// What `model compare` says in words ahead of its answer (ADR 0044): each
// container's interface changes first, because an interface change costs every
// caller, then the measures of each state side by side. The read derives both,
// and this file only says them. A line ranks no state and gives no verdict.

import type { Model } from "@archboard/model/content";
import { readingName } from "#cli/rules/model/inspection.ts";

type Comparison = NonNullable<Model["comparison"]>;
type InterfaceChange = Comparison["interfaceChanges"]["changed"][number];
type MeasuredOn = Comparison["interfaceMeasures"]["containers"][number]["byState"][number];

const MEASURE_ORDER = "entry points, hidden parts, callers, outgoing, pass-through";

/**
 * What one container's interface changed, in words.
 * @param change The container's change.
 * @returns The line.
 */
function interfaceChangeLine(change: InterfaceChange): string {
	const moved = [
		["entry points added", change.entryPointsAdded],
		["entry points removed", change.entryPointsRemoved],
		["now entry points", change.becameEntryPoints],
		["now hidden", change.becameHidden],
		["callers gained", change.callersGained],
		["callers lost", change.callersLost],
	] as const;
	const stated = moved
		.filter(([, parts]) => parts.length > 0)
		.map(([label, parts]) => `${label} ${parts.map((part) => part.name).join(", ")}`)
		.join("; ");
	const { before, after } = change.holdsParts;
	const side = before === after ? "" : after ? " (a new container)" : " (no longer a container)";
	// Only a container that appeared or emptied can have moved nothing: nothing outside reaches it.
	return `Interface of "${change.container.name}"${side}: ${stated || "no entry points and no callers"}.`;
}

/**
 * The interface changes in words, or the claim that there are none.
 * @param comparison The comparison.
 * @returns One line for each container whose interface changed.
 */
function describedChanges(comparison: Comparison): string[] {
	const { changed, unchanged } = comparison.interfaceChanges;
	if (changed.length > 0) return changed.map(interfaceChangeLine);
	return [
		unchanged.length === 0
			? "Interface: neither state has a container."
			: `Interface: no container's interface changed (${unchanged.length} read).`,
	];
}

/**
 * One container's counts in one state.
 * @param on What the state says about it.
 * @returns The counts in the fixed order, or the fact that it holds no parts.
 */
function countsOn(on: MeasuredOn): string {
	if (!on.holdsParts) return "holds no parts";
	const { entryPoints, hiddenParts, callers, outgoing, passThrough } = on.measures;
	const counts = `${entryPoints}, ${hiddenParts}, ${callers}, ${outgoing}, ${passThrough}`;
	// With no caller there is no entry point, so no pass-through entry point either.
	if (callers === 0) return `${counts} (draws no caller)`;
	if (on.passThrough.length === 0) return counts;
	return `${counts} (pass-through: ${on.passThrough.map((part) => part.name).join(", ")})`;
}

/**
 * What each state is called in words. Independent proposals can share a name,
 * so a shared name carries its identity.
 * @param comparison The comparison.
 * @returns One name for each state, in the order that the answer lists them.
 */
function stateNames(comparison: Comparison): string[] {
	const { states } = comparison.interfaceMeasures;
	const names = states.map(readingName);
	return states.map((column) => {
		const name = readingName(column);
		return names.indexOf(name) === names.lastIndexOf(name) ? name : `${name} (${column.state?.id})`;
	});
}

/**
 * The measures in words, side by side. A container whose counts match in every
 * state has nothing to set side by side, so one line counts those, and the
 * answer keeps every row.
 * @param comparison The comparison.
 * @returns The lines.
 */
function describedMeasures(comparison: Comparison): string[] {
	const { containers } = comparison.interfaceMeasures;
	const names = stateNames(comparison);
	const differing = containers.filter(({ byState }) => new Set(byState.map(countsOn)).size > 1);
	const same = containers.length - differing.length;
	return [
		...differing.map(({ container, byState }) => {
			const sides = byState.map((on, column) => `"${names[column]}" ${countsOn(on)}`);
			return `Interface measures of "${container.name}" (${MEASURE_ORDER}): ${sides.join("; ")}.`;
		}),
		...(same === 0 ? [] : [`Interface measures: ${same} container(s) match in every state.`]),
	];
}

/**
 * The rest of the comparison, counted, so that a reader knows what the answer holds.
 * @param comparison The comparison.
 * @returns The line.
 */
function describedSubjects(comparison: Comparison): string {
	const counts = (["added", "removed", "changed", "unchanged"] as const).map(
		(kind) =>
			[kind, comparison.subjects.filter((subject) => subject.kind === kind).length] as const,
	);
	const stated = counts.filter(([, count]) => count > 0).map(([kind, count]) => `${count} ${kind}`);
	return `Subjects: ${stated.join(", ") || "none"}.`;
}

/**
 * What to say ahead of a comparison's answer.
 * @param model The reading or its refusal.
 * @returns The lines. A refusal says its own.
 */
function describedComparison(model: Model | { readonly success: false }): string[] {
	if (!model.success) return [];
	const { comparison } = model;
	if (comparison === undefined) {
		return ["No comparison: select a draft with --state, or name a base with --against."];
	}
	const [selected, against] = stateNames(comparison);
	return [
		`"${selected}" read against "${against}" (${comparison.reason}).`,
		...describedChanges(comparison),
		...describedMeasures(comparison),
		describedSubjects(comparison),
	];
}

export { describedComparison };
