// What the picture says about a subject the pointer rests on, beyond what it
// already draws of it.
//
// A card drawn near shows its name and responsibility, so its tip is its
// description; seen from far away it shows its name alone, so its tip is its
// responsibility and description. A label shows its words, so its tip names the
// kind of relationship or message it labels. A tip that would say nothing new
// is not shown. Every tip is headed by what it is about, drawn the way the
// picture draws it, so it reads on its own beside the part it explains.

import type { SemanticEdge, SemanticNode, SemanticVariant } from "@/shared/semantic-board/index";
import { drawnAppearance, type AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";

/** The attribute naming the subject a group of the picture draws. */
const SUBJECT_ATTRIBUTE = "data-semantic-id";
/** The attribute on a subject's header or label group (the renderer's `PART_ATTRIBUTE`). */
const PART_ATTRIBUTE = "data-semantic-part";

/** The part of the picture a tip explains, and the element it stands against. */
interface TipTarget {
	readonly id: string;
	readonly part: "card" | "header" | "label";
	readonly anchor: Element;
}

/** What a tip says, each line only when there is something to say. */
interface SubjectTip {
	/** What the tip is about: a card's name, a label's words. */
	readonly title: string;
	/** What kind of part, relationship or message it is, as the picture names it. */
	readonly kind: string | undefined;
	/** How the picture draws it, when the picture names its type. */
	readonly appearance: AppliedAppearance | undefined;
	/** What the far view hides: a card's responsibility. */
	readonly lead: string | undefined;
	/** The longer account: a description. */
	readonly body: string | undefined;
	/** What a double-click does, when it does something. */
	readonly hint: string | undefined;
}

/**
 * The part of the picture under the pointer that has a tip: a card, a
 * container's header band or a label. A container's frame below its header
 * has none, so moving between the cards inside it never shows the container's.
 * @param target What the pointer is over.
 * @param clientY Where the pointer is, down the screen.
 * @returns The part and the element to place its tip against, or null.
 */
function tipTargetAt(target: EventTarget | null, clientY: number): TipTarget | null {
	const group = target instanceof Element ? target.closest(`[${SUBJECT_ATTRIBUTE}]`) : null;
	const id = group?.getAttribute(SUBJECT_ATTRIBUTE) ?? null;
	return group === null || id === null ? null : partOf(group, id, clientY);
}

/**
 * Which part of a subject one of its groups is, when it has a tip.
 * @param group The subject's group under the pointer.
 * @param id The subject.
 * @param clientY Where the pointer is, down the screen.
 * @returns The part, or null.
 */
function partOf(group: Element, id: string, clientY: number): TipTarget | null {
	const part = group.getAttribute(PART_ATTRIBUTE);
	if (part !== null) {
		// A participant's lifeline runs the page's height: its card says who it is.
		return part === "label" || part === "header" ? { id, part, anchor: group } : null;
	}
	const kind = group.getAttribute("data-semantic-kind");
	if (kind === "node") {
		return { id, part: "card", anchor: group };
	}
	return kind === "region" ? headerBand(group, id, clientY) : null;
}

/**
 * A container's header, when the pointer is over the band of its frame above
 * the rule under the header: the frame is painted there, beneath the header's
 * words, and a pointer between two words is still on the header.
 * @param frame The container's frame group.
 * @param id The container.
 * @param clientY Where the pointer is, down the screen.
 * @returns The header target, or null below the rule.
 */
function headerBand(frame: Element, id: string, clientY: number): TipTarget | null {
	const rule = frame.querySelector(":scope > line");
	const header = frame
		.closest("svg")
		?.querySelector(`[${SUBJECT_ATTRIBUTE}="${id}"][${PART_ATTRIBUTE}="header"]`);
	if (rule === null || header === null || header === undefined) {
		return null;
	}
	return clientY <= rule.getBoundingClientRect().top
		? { id, part: "header", anchor: header }
		: null;
}

/**
 * The subject a double-click under the pointer opens: a card, or a container
 * by its header, the parts whose tips say what a double-click does.
 * @param target What the pointer is over.
 * @param clientY Where the pointer is, down the screen.
 * @returns The subject, or null over a label or anywhere else.
 */
function openableAt(target: EventTarget | null, clientY: number): string | null {
	const part = tipTargetAt(target, clientY);
	return part === null || part.part === "label" ? null : part.id;
}

/**
 * What the tip over one part of the picture says.
 * @param variant The variant the picture draws.
 * @param target The part under the pointer.
 * @param far Whether the picture is seen from far away, showing names alone.
 * @returns The tip, or null when it would say nothing the picture does not.
 */
function subjectTip(variant: SemanticVariant, target: TipTarget, far: boolean): SubjectTip | null {
	if (target.part === "label") {
		return labelTip(variant, target);
	}
	const node = variant.content.nodes.find((candidate) => candidate.id === target.id);
	return node === undefined ? null : cardTip(node, target, far);
}

/**
 * The tip over a card or a container's header: what the picture leaves out
 * about the node at this distance, and what a double-click opens.
 * @param node The node.
 * @param target The part under the pointer.
 * @param far Whether the picture is seen from far away.
 * @returns The tip, or null when it would say nothing the picture does not.
 */
function cardTip(node: SemanticNode, target: TipTarget, far: boolean): SubjectTip | null {
	const said = {
		lead: far ? node.responsibility : undefined,
		body: node.description,
		hint: node.drillDown === undefined ? undefined : `Double-click to open ${node.drillDown.board}`,
	};
	if (!Object.values(said).some((line) => line !== undefined && line !== "")) {
		return null;
	}
	const appearance = drawnAppearance(target.anchor, target.id);
	return { title: node.name, kind: appearance?.typeName ?? node.kind, appearance, ...said };
}

/**
 * The tip over a relationship's or a message's label: its words, what kind of
 * line it labels, and its description.
 * @param variant The variant the picture draws.
 * @param target The label under the pointer.
 * @returns The tip, or null when the variant does not hold the subject.
 */
function labelTip(variant: SemanticVariant, target: TipTarget): SubjectTip | null {
	const appearance = drawnAppearance(target.anchor, target.id);
	const edge = variant.content.edges.find((candidate) => candidate.id === target.id);
	if (edge !== undefined) {
		return edgeTip(edge, appearance);
	}
	const step = variant.content.flows
		.flatMap((flow) => flow.steps)
		.find((candidate) => candidate.id === target.id);
	return step === undefined
		? null
		: { ...UNSAID, title: step.label, kind: messageKind(step.kind), appearance };
}

/**
 * The tip over a relationship's label.
 * @param edge The relationship.
 * @param appearance How the picture draws its line, when it names its kind.
 * @returns The tip.
 */
function edgeTip(edge: SemanticEdge, appearance: AppliedAppearance | undefined): SubjectTip {
	const kind = appearance?.typeName ?? edge.kind;
	return { ...UNSAID, title: edge.label ?? kind, kind, appearance, body: edge.description };
}

/**
 * What kind of message a step is, named as the other kinds are.
 * @param kind The step's kind.
 * @returns The name, such as "Sync message".
 */
function messageKind(kind: string): string {
	return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} message`;
}

/** The lines a label's tip leaves out unless it has them. */
const UNSAID = { lead: undefined, body: undefined, hint: undefined } as const;

export { openableAt, subjectTip, tipTargetAt, type SubjectTip, type TipTarget };
