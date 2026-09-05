// What a canvas selection can be, as the inspector shows it. Pure: no React,
// no DOM. The shell receives one of these and never touches the element.

export {
	projectSelection,
	type SelectionElement,
} from "@/ui/selection-inspector/lib/project-selection";
export {
	SELECTION_METADATA_KEYS,
	hasSelectedElement,
	sameSelectionProjection,
	selectedElementTitle,
	type BoundSelection,
	type ElementSelection,
	type EmptySelection,
	type MalformedSelection,
	type MissingSelection,
	type MultipleSelection,
	type SelectedElement,
	type SelectionMetadata,
	type SelectionMetadataKey,
	type SelectionProjection,
	type UnboundSelection,
} from "@/ui/selection-inspector/lib/projection";
