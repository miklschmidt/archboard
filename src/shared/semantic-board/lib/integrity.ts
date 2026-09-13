// The rules a shape cannot state.
//
// Zod says a node's `parent` is an id. It cannot say that the id names a node
// on the same board, that following parents never returns to where it started,
// or that the board's `current` designation points at a variant that exists.
// Those are the properties that make a document mean something, and a document
// that fails one of them is refused rather than drawn, because every one of
// them would otherwise surface as a renderer crash or a silently missing box.
//
// Every check runs on the way in — on what is read from disk and on every
// candidate before it is written — so a board on disk is always coherent, and
// a refused write leaves the last coherent board exactly where it was.

import type { SemanticBoard } from "@/shared/semantic-board/lib/aggregate";
import { familyIssues, frameIssues, versionIssues } from "@/shared/semantic-board/lib/family";
import { repeated, walkReturns, type IntegrityIssue } from "@/shared/semantic-board/lib/rules";
import {
	BEAT_SUBJECT_KINDS,
	subjectsOf,
	type SubjectKind,
	type VariantContent,
} from "@/shared/semantic-board/lib/content";
import type { SemanticFlow } from "@/shared/semantic-board/lib/views";
import type { WalkthroughBeat } from "@/shared/semantic-board/lib/walkthrough";

/**
 * Check the nodes of one variant: unique ids, containment that resolves, and
 * containment that terminates.
 * @param content The variant's content.
 * @param at The path the variant is reported under.
 * @returns The issues found.
 */
function nodeIssues(content: VariantContent, at: string): IntegrityIssue[] {
	const issues: IntegrityIssue[] = [];
	const byId = new Map(content.nodes.map((node) => [node.id, node]));
	for (const node of content.nodes) {
		const parent = node.parent;
		if (parent === undefined) {
			continue;
		}
		if (!byId.has(parent)) {
			issues.push({
				at: `${at}.nodes.${node.id}.parent`,
				problem: `contained by "${parent}", which is not a node on this board`,
			});
		} else if (walkReturns(node.id, (id) => byId.get(id)?.parent)) {
			issues.push({
				at: `${at}.nodes.${node.id}.parent`,
				problem: "containment closes on itself; a node cannot contain itself",
			});
		}
	}
	return issues;
}

/**
 * Check the edges of one variant: endpoints that name nodes on the same board.
 * @param content The variant's content.
 * @param at The path the variant is reported under.
 * @returns The issues found.
 */
function edgeIssues(content: VariantContent, at: string): IntegrityIssue[] {
	const issues: IntegrityIssue[] = [];
	const nodeIds = new Set(content.nodes.map((node) => node.id));
	for (const edge of content.edges) {
		for (const [end, id] of [["from", edge.from] as const, ["to", edge.to] as const]) {
			if (!nodeIds.has(id)) {
				issues.push({
					at: `${at}.edges.${edge.id}.${end}`,
					problem: `"${id}" is not a node on this board`,
				});
			}
		}
	}
	return issues;
}

/** What each kind of subject is called in a refusal, singly and severally. */
const SUBJECT_WORDS: Readonly<Record<SubjectKind, readonly [string, string]>> = {
	node: ["node", "nodes"],
	edge: ["relationship", "relationships"],
	flow: ["flow", "flows"],
	step: ["step", "steps"],
	view: ["view", "views"],
	walkthrough: ["walkthrough", "walkthroughs"],
	beat: ["beat", "beats"],
};

/**
 * Check that no two subjects of one variant share an identity.
 *
 * Nodes, relationships, flows, their steps and views are one namespace, not
 * five, and this is the single owner of that rule for all of them — including
 * two steps of *different* flows, which each flow reading itself would never
 * see. Everything downstream keys on an id alone — an atlas box, a selection, a
 * view's scope, a comparison between two variants — so an id held twice is an
 * id that resolves to whichever holder the reader happened to look in first.
 *
 * Across variants is a different matter and deliberately unconstrained: a
 * proposal inherits its parent's entities with their identities, and that is
 * what makes two variants comparable at all.
 * @param content The variant's content.
 * @param at The path the variant is reported under.
 * @returns The issues found.
 */
function identityIssues(content: VariantContent, at: string): IntegrityIssue[] {
	const seen = new Map<string, SubjectKind>();
	const issues: IntegrityIssue[] = [];
	for (const subject of subjectsOf(content)) {
		const already = seen.get(subject.id);
		if (already !== undefined) {
			issues.push({ at, problem: sharedIdentity(subject.id, already, subject.kind) });
		}
		seen.set(subject.id, subject.kind);
	}
	return issues;
}

/**
 * What to say about two subjects holding one id.
 * @param id The id they share.
 * @param first The kind that had it.
 * @param second The kind that took it as well.
 * @returns The sentence.
 */
function sharedIdentity(id: string, first: SubjectKind, second: SubjectKind): string {
	if (first === second) {
		return `two ${SUBJECT_WORDS[first][1]} share the id "${id}"`;
	}
	return `a ${SUBJECT_WORDS[second][0]} and a ${SUBJECT_WORDS[first][0]} both answer to the id "${id}"`;
}

/**
 * Check the flows of one variant: names that name one flow, and participants
 * and endpoints that name nodes on the same variant.
 *
 * A flow is a second reading of the variant's own nodes rather than a cast of
 * its own, so a participant that names nothing is a flow about an architecture
 * this variant does not describe.
 * @param content The variant's content.
 * @param at The path the variant is reported under.
 * @returns The issues found.
 */
function flowIssues(content: VariantContent, at: string): IntegrityIssue[] {
	const issues: IntegrityIssue[] = [];
	const nodeIds = new Set(content.nodes.map((node) => node.id));
	issues.push(...nameIssues(content.flows, `${at}.flows`, "flow"));
	for (const flow of content.flows) {
		issues.push(...flowNodeIssues(flow, nodeIds, `${at}.flows.${flow.id}`));
	}
	return issues;
}

/**
 * Check that one flow's participants and step endpoints are nodes of this
 * variant, and that a step goes between nodes the flow has a column for.
 * @param flow The flow.
 * @param nodeIds The nodes of the variant.
 * @param at The path the flow is reported under.
 * @returns The issues found.
 */
function flowNodeIssues(
	flow: SemanticFlow,
	nodeIds: ReadonlySet<string>,
	at: string,
): IntegrityIssue[] {
	const issues: IntegrityIssue[] = [];
	const columns = new Set(flow.participants);
	for (const participant of flow.participants) {
		if (!nodeIds.has(participant)) {
			issues.push({
				at: `${at}.participants`,
				problem: `"${participant}" is not a node on this board`,
			});
		}
	}
	for (const step of flow.steps) {
		for (const [end, id] of [["from", step.from] as const, ["to", step.to] as const]) {
			if (!columns.has(id)) {
				issues.push({
					at: `${at}.steps.${step.id}.${end}`,
					problem: `"${id}" is not one of this flow's participants`,
				});
			}
		}
	}
	return issues;
}

/**
 * Check that no two of one kind of explanation answer to one name.
 *
 * A flow and a view are each addressed by name — in a view's scope, in the
 * viewer's address bar, on the command line — and a name that fits two of them
 * means the reader gets whichever was written first, with no way to ask for the
 * other and nothing saying a choice was made. Nodes are deliberately not held
 * to this: two containers can each hold a `client`, and a name that fits more
 * than one node is refused where it is used rather than where it is written.
 * @param named The flows or the views.
 * @param at The path they are reported under.
 * @param what What one of them is called.
 * @returns The issues found.
 */
function nameIssues(
	named: readonly { readonly name: string }[],
	at: string,
	what: string,
): IntegrityIssue[] {
	return repeated(named.map((one) => one.name)).map((name) => ({
		at,
		problem: `two ${what}s are called "${name}"; a ${what} is addressed by name`,
	}));
}

/**
 * Check the walkthroughs of one variant: names that name one walkthrough,
 * explanations that explain something, and beats about this variant.
 *
 * What a beat may be about is looked up in the one collection that knows what a
 * variant holds, rather than in a list of kinds kept here.
 * @param content The variant's content.
 * @param at The path the variant is reported under.
 * @returns The issues found.
 */
function walkthroughIssues(content: VariantContent, at: string): IntegrityIssue[] {
	const holds = new Map([...subjectsOf(content)].map((one) => [one.id, one.kind] as const));
	const issues = nameIssues(content.walkthroughs, `${at}.walkthroughs`, "walkthrough");
	for (const walkthrough of content.walkthroughs) {
		const where = `${at}.walkthroughs.${walkthrough.id}`;
		if (walkthrough.beats.length === 0) {
			issues.push({
				at: where,
				problem: `"${walkthrough.name}" is a walkthrough with no beats; an explanation that says nothing explains nothing`,
			});
		}
		for (const beat of walkthrough.beats) {
			issues.push(...beatIssues(beat, holds, `${where}.beats.${beat.id}`));
		}
	}
	return issues;
}

/**
 * Check that one beat is about subjects this variant has, and is told through a
 * view this variant has. A beat about something that is not here is an
 * explanation of a different architecture: a viewer given one has nothing to
 * highlight and no way to say why, so it is refused where it was written.
 * @param beat The beat.
 * @param holds What the variant holds, by id.
 * @param at The path the beat is reported under.
 * @returns The issues found.
 */
function beatIssues(
	beat: WalkthroughBeat,
	holds: ReadonlyMap<string, SubjectKind>,
	at: string,
): IntegrityIssue[] {
	const issues: IntegrityIssue[] = [];
	for (const id of beat.subjects) {
		const kind = holds.get(id);
		if (kind === undefined || !BEAT_SUBJECT_KINDS.has(kind)) {
			issues.push({
				at: `${at}.subjects`,
				problem: `"${id}" is not something on this variant for a beat to be about`,
			});
		}
	}
	return issues;
}

/**
 * Everything wrong with what one variant holds, beyond its shape.
 *
 * The single owner of that question. Reconciliation asks it of a candidate it
 * has just merged, the same rules that a document read off disk is held to —
 * because a second, shorter list of what may not dangle is a list that drifts,
 * and the one that drifts is always the one nobody is reading.
 * @param content The variant's content.
 * @param at The path it is reported under.
 * @returns The issues found; empty when it is coherent.
 */
function checkVariantContent(content: VariantContent, at: string): IntegrityIssue[] {
	return [
		...identityIssues(content, at),
		...nodeIssues(content, at),
		...edgeIssues(content, at),
		...flowIssues(content, at),
		...walkthroughIssues(content, at),
	];
}

/**
 * Everything wrong with a board beyond its shape, in document order.
 * @param board A board that has already been parsed.
 * @returns The issues found; empty when the board is coherent.
 */
function checkSemanticBoard(board: SemanticBoard): IntegrityIssue[] {
	const issues = [
		...versionIssues(board),
		...familyIssues(board),
		...frameIssues(board),
		...nameIssues(board.views, "views", "view"),
	];
	const views = new Set(board.views.map((view) => view.id));
	for (const id of repeated(board.views.map((view) => view.id))) {
		issues.push({ at: "views", problem: `two views share the id "${id}"` });
	}
	for (const variant of board.variants) {
		issues.push(...checkVariantContent(variant.content, `variants.${variant.id}.content`));
		issues.push(...walkthroughViewIssues(variant.content, views, `variants.${variant.id}.content`));
	}
	return issues;
}

/**
 * The issues as one line, for a refusal a person or an agent reads.
 * @param issues The issues.
 * @returns One sentence naming each issue.
 */
function describeIntegrityIssues(issues: readonly IntegrityIssue[]): string {
	return issues.map((issue) => `${issue.at}: ${issue.problem}`).join("; ");
}

export { type IntegrityIssue, checkSemanticBoard, checkVariantContent, describeIntegrityIssues };

/**
 * Validate walkthrough targets against the board-owned views.
 * @param content The variant content.
 * @param views The board view identities.
 * @param at The variant path.
 * @returns Missing view references.
 */
function walkthroughViewIssues(
	content: VariantContent,
	views: ReadonlySet<string>,
	at: string,
): IntegrityIssue[] {
	return content.walkthroughs.flatMap((walkthrough) =>
		walkthrough.beats
			.filter((beat) => beat.view !== undefined && !views.has(beat.view))
			.map((beat) => ({
				at: `${at}.walkthroughs.${walkthrough.id}.beats.${beat.id}.view`,
				problem: `"${beat.view}" is not a view of this board to read a beat through`,
			})),
	);
}
