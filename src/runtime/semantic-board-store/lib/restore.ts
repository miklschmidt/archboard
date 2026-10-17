// Ordinary edits may bring absent nodes, relationships and flows back under
// their original ids. An id the direct predecessor or the recorded
// reconciliation base holds comes back without asking. An id that only another
// variant of the board holds comes back only when the edit confirms it, and the
// answer then names each one: a sibling's or an older ancestor's subject is
// usually a mistake, and sometimes exactly the repair somebody needs. When a
// restoration also answers an open removal disagreement, the restoration and
// the settlement share the same atomic family write.

import {
	everyStep,
	nextVersion,
	type FlowStepInput,
	type SemanticBoard,
	type SemanticVariant,
	type VariantContent,
	type VariantEditInput,
} from "@/shared/semantic-board/index";
import { refuse, type SemanticRefusal } from "@/runtime/semantic-board-store/lib/outcome";
import { caughtUp, type Settlement } from "@/runtime/semantic-board-store/lib/settle";
import { propagateEdit } from "@/runtime/semantic-board-store/lib/propagate";
import type { WriteNotice } from "@/runtime/semantic-board-store/lib/replaced-relationships";

/** Absent identities an edit may restore, by kind. A flow maps to the step ids it may keep. */
interface RestorableSubjects {
	readonly nodes: ReadonlySet<string>;
	readonly edges: ReadonlySet<string>;
	readonly flows: ReadonlyMap<string, ReadonlySet<string>>;
}

/** What an edit may restore, and what its answer says about it. */
type Restoration =
	| {
			readonly ok: true;
			readonly restorable: RestorableSubjects;
			readonly notices: readonly WriteNotice[];
	  }
	| SemanticRefusal;

/** One stated id that only other variants of the board hold. */
interface HeldElsewhere {
	readonly what: "node" | "relationship" | "flow" | "step";
	readonly path: string;
	readonly id: string;
	/** The names of the variants that hold it. */
	readonly holders: readonly string[];
}

/** One other variant, by name, with the absent identities it holds. */
interface OtherHolder {
	readonly name: string;
	readonly content: VariantContent;
	readonly held: RestorableSubjects;
}

/**
 * The identities some contents hold that this variant lacks, by kind.
 * @param present The variant's content before the edit.
 * @param sources The contents whose identities may come back.
 * @returns The absent identities; each flow with every step id its sources hold.
 */
function absentIn(present: VariantContent, sources: readonly VariantContent[]): RestorableSubjects {
	/**
	 * Absent ids of one kind.
	 * @param kind The collection.
	 * @returns The ids the sources hold and the variant lacks.
	 */
	const absent = (kind: "nodes" | "edges") => {
		const here = new Set(present[kind].map((subject) => subject.id));
		const ids = sources.flatMap((source) => source[kind].map((subject) => subject.id));
		return new Set(ids.filter((id) => !here.has(id)));
	};
	const flowsHere = new Set(present.flows.map((flow) => flow.id));
	const flows = new Map<string, Set<string>>();
	for (const flow of sources.flatMap((source) => source.flows)) {
		if (flowsHere.has(flow.id)) continue;
		const steps = flows.get(flow.id) ?? new Set<string>();
		for (const step of everyStep(flow.steps)) steps.add(step.id);
		flows.set(flow.id, steps);
	}
	return { nodes: absent("nodes"), edges: absent("edges"), flows };
}

/**
 * What one edit may restore. The direct predecessor and the recorded
 * reconciliation base are sources without asking; every other variant of the
 * board is a source only when the edit confirms `RESTORE_UNCONFIRMED`.
 * @param board The variant family.
 * @param variant The variant before the edit.
 * @param input The edit as stated.
 * @returns The restorable identities and the notices, or the refusal naming each unconfirmed id.
 */
function restoration(
	board: SemanticBoard,
	variant: SemanticVariant,
	input: VariantEditInput,
): Restoration {
	const parent = board.variants.find((one) => one.id === variant.parent);
	const inheritedSources = [parent?.content, variant.reconciliation?.base].filter(
		(source) => source !== undefined,
	);
	const inherited = absentIn(variant.content, inheritedSources);
	const others = board.variants
		.filter((one) => one.id !== variant.id)
		.map(({ name, content }) => ({ name, content, held: absentIn(variant.content, [content]) }));
	const elsewhere = statedElsewhere(input, inherited, others);
	if (elsewhere.length === 0) {
		return { ok: true, restorable: inherited, notices: [] };
	}
	if (input.confirm?.includes("RESTORE_UNCONFIRMED") !== true) {
		return refuse("RESTORE_UNCONFIRMED", unconfirmed(elsewhere));
	}
	const everySource = [...inheritedSources, ...others.map((one) => one.content)];
	return {
		ok: true,
		restorable: absentIn(variant.content, everySource),
		notices: elsewhere.map(restoredNotice),
	};
}

/**
 * Every id the edit states that this variant and its inheritance lack, and
 * that another variant holds as the same kind of subject.
 * @param input The edit as stated.
 * @param inherited What the predecessor and the base may restore.
 * @param others Every other variant, with what it may restore.
 * @returns Each such id with the variants that hold it.
 */
function statedElsewhere(
	input: VariantEditInput,
	inherited: RestorableSubjects,
	others: readonly OtherHolder[],
): HeldElsewhere[] {
	/**
	 * One stated id, when only other variants hold it.
	 * @param what The kind of subject, for the answer to name.
	 * @param path Where it sits, less its id.
	 * @param id The stated id, when there is one.
	 * @param holds Whether some restorable identities hold it.
	 * @returns The id with its holders, or nothing.
	 */
	const found = (
		what: HeldElsewhere["what"],
		path: string,
		id: string | undefined,
		holds: (held: RestorableSubjects, stated: string) => boolean,
	): HeldElsewhere[] => {
		if (id === undefined || holds(inherited, id)) return [];
		const holders = others.filter((other) => holds(other.held, id)).map((other) => other.name);
		return holders.length === 0 ? [] : [{ what, path: `${path}.${id}`, id, holders }];
	};
	return [
		...input.nodes.flatMap((node) =>
			found("node", "nodes", node.id, (held, id) => held.nodes.has(id)),
		),
		...input.edges.flatMap((edge) =>
			found("relationship", "edges", edge.id, (held, id) => held.edges.has(id)),
		),
		...input.flows.flatMap((flow) => [
			...found("flow", "flows", flow.id, (held, id) => held.flows.has(id)),
			...statedStepIds(flow.steps).flatMap((step) =>
				found("step", `flows.${flow.id ?? ""}.steps`, step, (held, id) =>
					stepHeld(held, flow.id, id),
				),
			),
		]),
	];
}

/**
 * Whether restorable identities hold a step in the restored flow it is stated in.
 * @param held The restorable identities.
 * @param flow The id of the flow the step is stated in, when it states one.
 * @param step The step id.
 * @returns True when that flow, absent here, holds the step there.
 */
function stepHeld(held: RestorableSubjects, flow: string | undefined, step: string): boolean {
	return flow !== undefined && held.flows.get(flow)?.has(step) === true;
}

/**
 * Every step id a stated flow names, at any depth.
 * @param steps The steps as stated.
 * @returns Their ids, where they state one.
 */
function statedStepIds(steps: readonly FlowStepInput[]): string[] {
	return steps.flatMap((step) => [
		...(step.id === undefined ? [] : [step.id]),
		...statedStepIds(heldSteps(step)),
	]);
}

/**
 * The steps a stated decision or loop holds.
 * @param step The step as stated.
 * @returns The steps inside it; a message holds none.
 */
function heldSteps(step: FlowStepInput): readonly FlowStepInput[] {
	if (step.kind === "decision") return step.alternatives.flatMap((one) => one.steps);
	if (step.kind === "loop") return step.steps;
	return [];
}

/**
 * Each id that needs confirming, with the variants that hold it.
 * @param elsewhere The ids.
 * @returns The phrase.
 */
function heldBy(elsewhere: readonly HeldElsewhere[]): string {
	return elsewhere
		.map(
			(one) =>
				`${one.what} "${one.id}" (held by ${one.holders.map((name) => `"${name}"`).join(", ")})`,
		)
		.join("; ");
}

/**
 * Why an edit that states ids only other variants hold was refused.
 * @param elsewhere The ids.
 * @returns The sentence.
 */
function unconfirmed(elsewhere: readonly HeldElsewhere[]): string {
	return (
		`this edit states ${heldBy(elsewhere)}, which this variant's direct predecessor and ` +
		"recorded reconciliation base do not hold (RESTORE_UNCONFIRMED). Add --confirm " +
		"RESTORE_UNCONFIRMED to restore them under those ids, or leave each id out to add a new subject"
	);
}

/**
 * What the answer says about one id restored from another variant.
 * @param one The id.
 * @returns The notice.
 */
function restoredNotice(one: HeldElsewhere): WriteNotice {
	return {
		code: "RESTORED_FROM_OTHER_VARIANT",
		path: one.path,
		message: `restored ${heldBy([one])} under its id, though this variant's predecessor does not hold it`,
	};
}

/**
 * Settle the disagreements an ordinary edit answered by restoring what this
 * proposal had removed, and carry the answer down like any other settlement.
 *
 * The edit's content is this proposal's third answer, whole: the base moves
 * to the predecessor's version of each restored subject, so what the restored
 * subject says here reads as this proposal's own change and nothing reopens the
 * argument. Disagreements the edit did not touch stay exactly as they were.
 * @param board The board as it stands.
 * @param draft The proposal as it stood before the edit.
 * @param content Its content as the edit leaves it.
 * @param restored The ids the edit brought back.
 * @param atVersion The version the board will carry once this write lands.
 * @returns The family afterwards, or the refusal.
 */
function settleByRestoring(
	board: SemanticBoard,
	draft: SemanticVariant,
	content: SemanticVariant["content"],
	restored: ReadonlySet<string>,
	atVersion: number,
): Settlement {
	const standing = draft.reconciliation;
	if (standing === undefined) {
		return refuse("NOTHING_TO_SETTLE", `"${draft.name}" is not waiting on anything`);
	}
	const parent = board.variants.find((one) => one.id === standing.against);
	if (parent === undefined) {
		return refuse(
			"UNKNOWN_VARIANT",
			`"${draft.name}" is waiting on a variant this board no longer has`,
		);
	}
	const taken = standing.issues.filter(
		(issue) => issue.kind === "deleted-and-changed" && restored.has(issue.subject),
	);
	const kept = standing.issues.filter((issue) => !taken.includes(issue));
	return caughtUp(board, { draft, parent, standing, atVersion }, content, { taken, kept });
}

/**
 * The ids an edit's content holds that it was allowed to restore.
 * @param content The content as the edit leaves it.
 * @param restorable The absent identities the edit could restore.
 * @returns The restored ids, of every kind.
 */
function restoredIds(content: VariantContent, restorable: RestorableSubjects): Set<string> {
	return new Set([
		...content.nodes.map((node) => node.id).filter((id) => restorable.nodes.has(id)),
		...content.edges.map((edge) => edge.id).filter((id) => restorable.edges.has(id)),
		...content.flows.map((flow) => flow.id).filter((id) => restorable.flows.has(id)),
	]);
}

/**
 * The family after one edit: every draft derived from this variant answers the
 * change in the same candidate, so the parent's new state and its consequences
 * are one write and one version, never a parent that landed and children that
 * have not caught up (ADR 0023). An edit that restores a subject this draft was
 * arguing about answers the draft's own disagreement, and that settlement is
 * part of the same write too: the restored subject, the settled standing and the
 * descendants' answers land as one version. A command that changes only the
 * board's views leaves the variant family alone.
 * @param board The board as it stands.
 * @param variant The edited variant, as it stood.
 * @param content Its content as the edit leaves it.
 * @param edit What the edit could and did do.
 * @param edit.restorable The absent identities this edit may restore.
 * @param edit.changesContent Whether the command edited variant content.
 * @returns The variant family and effects, or the refusal.
 */
function carriedFamily(
	board: SemanticBoard,
	variant: SemanticVariant,
	content: SemanticVariant["content"],
	edit: { readonly restorable: RestorableSubjects; readonly changesContent: boolean },
): Settlement {
	const restored = restoredIds(content, edit.restorable);
	const settles = variant.reconciliation?.issues.some(
		(issue) => issue.kind === "deleted-and-changed" && restored.has(issue.subject),
	);
	if (settles === true) {
		return settleByRestoring(board, variant, content, restored, nextVersion(board));
	}
	return {
		ok: true,
		...(edit.changesContent
			? propagateEdit(board, { ...variant, content }, nextVersion(board))
			: { variants: board.variants, descendants: [] }),
	};
}

export { type RestorableSubjects, carriedFamily, restoration };
