// What a canvas selection can be, as the inspector shows it. Pure: no React,
// no DOM. The shell receives one of these and never touches the element.

import type { CodeBinding } from "@/shared/code-target";

/** The metadata keys archboard reads from `customData.archboard`, in display order. */
const SELECTION_METADATA_KEYS = ["node", "kind", "name", "variant", "level"] as const;

/** One of the five metadata keys. */
type SelectionMetadataKey = (typeof SELECTION_METADATA_KEYS)[number];

/** The metadata an element carries, by key; absent keys were not set. */
type SelectionMetadata = Readonly<Partial<Record<SelectionMetadataKey, string>>>;

/** The selected element as the inspector needs it: identity, type and metadata. */
interface SelectedElement {
	id: string;
	type: string;
	metadata: SelectionMetadata;
}

/** Nothing is selected; the inspector is hidden. */
interface EmptySelection {
	kind: "empty";
}

/** More than one element is selected; only the count is shown. */
interface MultipleSelection {
	kind: "multiple";
	count: number;
}

/** The selected id is not on the board any more. */
interface MissingSelection {
	kind: "missing";
	id: string;
}

/** One element without a code binding. */
interface UnboundSelection {
	kind: "unbound";
	element: SelectedElement;
}

/** One element whose persisted binding could not be read. */
interface MalformedSelection {
	kind: "malformed";
	element: SelectedElement;
	/** Plain words for the person: what about the binding is unreadable. */
	explanation: string;
}

/** One element with a readable code binding. */
interface BoundSelection {
	kind: "bound";
	element: SelectedElement;
	binding: CodeBinding;
}

/**
 * What the inspector shows. A projection of the selection, never the element
 * itself: the shell cannot write the board.
 */
type SelectionProjection =
	| EmptySelection
	| MultipleSelection
	| MissingSelection
	| UnboundSelection
	| MalformedSelection
	| BoundSelection;

/** The projections that carry one element. */
type ElementSelection = UnboundSelection | MalformedSelection | BoundSelection;

/**
 * Whether a projection carries one element.
 * @param projection Any projection.
 * @returns True for the unbound, malformed and bound kinds.
 */
function hasSelectedElement(projection: SelectionProjection): projection is ElementSelection {
	return (
		projection.kind === "unbound" || projection.kind === "malformed" || projection.kind === "bound"
	);
}

/**
 * The element's display title: its `name` metadata when set, else its id.
 * @param element The selected element.
 * @returns A short title.
 */
function selectedElementTitle(element: SelectedElement): string {
	return element.metadata.name ?? element.id;
}

/**
 * Whether two metadata records hold the same keys and values.
 * @param left One record.
 * @param right The other.
 * @returns True when every key reads the same.
 */
function sameMetadata(left: SelectionMetadata, right: SelectionMetadata): boolean {
	return SELECTION_METADATA_KEYS.every((key) => left[key] === right[key]);
}

/**
 * Whether two selected elements are the same element in the same state.
 * @param left One element.
 * @param right The other.
 * @returns True when id, type and metadata match.
 */
function sameSelectedElement(left: SelectedElement, right: SelectedElement): boolean {
	return (
		left.id === right.id && left.type === right.type && sameMetadata(left.metadata, right.metadata)
	);
}

/**
 * Whether two bindings name the same code at the same point in history.
 * @param left One binding.
 * @param right The other.
 * @returns True when every field matches.
 */
function sameBinding(left: CodeBinding, right: CodeBinding): boolean {
	return (
		left.repo === right.repo &&
		left.path === right.path &&
		left.branch === right.branch &&
		left.commit === right.commit &&
		left.confirmedAt === right.confirmedAt
	);
}

/**
 * Whether two element-carrying projections of the same kind read the same.
 * @param left One projection.
 * @param right Another of the same kind.
 * @returns True when the element and, where present, the binding or explanation match.
 */
function sameElementProjection(left: ElementSelection, right: ElementSelection): boolean {
	if (!sameSelectedElement(left.element, right.element)) {
		return false;
	}
	if (left.kind === "bound" && right.kind === "bound") {
		return sameBinding(left.binding, right.binding);
	}
	if (left.kind === "malformed" && right.kind === "malformed") {
		return left.explanation === right.explanation;
	}
	return true;
}

/**
 * Whether two projections would render identically, so a re-render can be
 * skipped when the canvas reports the same selection again.
 * @param left One projection.
 * @param right The other.
 * @returns True when nothing the inspector shows differs.
 */
function sameSelectionProjection(left: SelectionProjection, right: SelectionProjection): boolean {
	if (hasSelectedElement(left)) {
		return (
			left.kind === right.kind && hasSelectedElement(right) && sameElementProjection(left, right)
		);
	}
	return sameElementlessProjection(left, right);
}

/**
 * Whether an element-less projection matches another projection.
 * @param left The empty, multiple or missing projection.
 * @param right Any projection.
 * @returns True when the other is the same kind with the same count or id.
 */
function sameElementlessProjection(
	left: EmptySelection | MultipleSelection | MissingSelection,
	right: SelectionProjection,
): boolean {
	if (left.kind === "empty") {
		return right.kind === "empty";
	}
	if (left.kind === "multiple") {
		return right.kind === "multiple" && left.count === right.count;
	}
	return right.kind === "missing" && left.id === right.id;
}

export {
	SELECTION_METADATA_KEYS,
	type SelectionMetadataKey,
	type SelectionMetadata,
	type SelectedElement,
	type EmptySelection,
	type MultipleSelection,
	type MissingSelection,
	type UnboundSelection,
	type MalformedSelection,
	type BoundSelection,
	type ElementSelection,
	type SelectionProjection,
	hasSelectedElement,
	selectedElementTitle,
	sameSelectionProjection,
};
