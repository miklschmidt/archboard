// The right inspector: the selected element, its metadata, its code binding
// and the path-focus controls. Reads a projection; never touches the element.

import { RiExternalLinkLine, RiFocus3Line, RiFocusLine } from "@remixicon/react";
import { useCallback } from "react";

import type { CodeBinding } from "@/shared/code-target";
import { Badge } from "@/ui/components/badge";
import { Button } from "@/ui/components/button";
import { Separator } from "@/ui/components/separator";
import { describePathFocusReason, type PathFocusSnapshot } from "@/ui/path-focus";
import {
	SELECTION_METADATA_KEYS,
	hasSelectedElement,
	selectedElementTitle,
	type ElementSelection,
	type SelectedElement,
	type SelectionProjection,
} from "@/ui/selection-inspector";

/** What the inspector can ask for. */
interface InspectorActions {
	openCode(elementId: string): void;
	focusPath(elementId: string): void;
	exitPathFocus(): void;
}

/** Inputs for a section heading. */
interface SectionLabelProps {
	children: string;
}

/**
 * A small uppercase section heading.
 * @param props The heading text.
 * @returns The heading.
 */
function SectionLabel(props: SectionLabelProps): React.JSX.Element {
	return (
		<h3 className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
			{props.children}
		</h3>
	);
}

/** Inputs for one definition row. */
interface RowProps {
	label: string;
	value: string;
	/** True for identifiers, paths and times, which are set in the mono face. */
	technical: boolean;
}

/**
 * One row: a label and a value, mono when the value is technical.
 * @param props The row.
 * @returns A definition pair.
 */
function Row(props: RowProps): React.JSX.Element {
	return (
		<div className="flex items-baseline justify-between gap-3 text-sm">
			<dt className="text-muted-foreground shrink-0">{props.label}</dt>
			<dd className={props.technical ? "truncate font-mono text-xs" : "truncate"}>{props.value}</dd>
		</div>
	);
}

/** Inputs for the element rows. */
interface ElementRowsProps {
	element: SelectedElement;
}

/**
 * The element's id and its metadata keys, in the fixed order.
 * @param props The element.
 * @returns The rows.
 */
function ElementRows(props: ElementRowsProps): React.JSX.Element {
	const { element } = props;
	return (
		<dl className="flex flex-col gap-1.5">
			<Row label="Element" value={element.id} technical />
			{SELECTION_METADATA_KEYS.map((key) => {
				const value = element.metadata[key];
				return value === undefined ? null : (
					<Row key={key} label={key} value={value} technical={key === "node" || key === "level"} />
				);
			})}
		</dl>
	);
}

/** Inputs for the binding rows. */
interface BindingRowsProps {
	binding: CodeBinding;
}

/**
 * The persisted code binding: repository, path and, when known, branch,
 * commit and confirmation time, all in the mono face.
 * @param props The binding.
 * @returns The bound repository rows.
 */
function BindingRows(props: BindingRowsProps): React.JSX.Element {
	const { binding } = props;
	return (
		<dl className="flex flex-col gap-1">
			<Row label="repo" value={binding.repo} technical />
			<Row label="path" value={binding.path} technical />
			{binding.branch !== undefined && <Row label="branch" value={binding.branch} technical />}
			{binding.commit !== undefined && <Row label="commit" value={binding.commit} technical />}
			{binding.confirmedAt !== undefined && (
				<Row label="confirmed" value={binding.confirmedAt} technical />
			)}
		</dl>
	);
}

/** Inputs for the binding section. */
interface BindingSectionProps {
	selection: ElementSelection;
	actions: InspectorActions;
}

/**
 * The bound-repository section and its "Open code" action.
 * @param props The selection and the actions.
 * @returns The section.
 */
function BindingSection(props: BindingSectionProps): React.JSX.Element {
	const { selection, actions } = props;
	const elementId = selection.element.id;
	const handleOpen = useCallback(() => actions.openCode(elementId), [actions, elementId]);
	return (
		<section className="flex flex-col gap-2">
			<SectionLabel>Bound repository</SectionLabel>
			{selection.kind === "bound" && <BindingRows binding={selection.binding} />}
			{selection.kind === "unbound" && (
				<p className="text-muted-foreground text-sm">Not bound to code.</p>
			)}
			{selection.kind === "malformed" && (
				<p className="text-destructive text-sm">
					The binding cannot be read. {selection.explanation}
				</p>
			)}
			{selection.kind === "bound" && (
				<Button variant="outline" size="sm" className="self-start" onClick={handleOpen}>
					<RiExternalLinkLine data-icon="inline-start" />
					Open code
				</Button>
			)}
		</section>
	);
}

/** Inputs for the path-focus section. */
interface PathFocusSectionProps {
	elementId: string;
	pathFocus: PathFocusSnapshot;
	actions: InspectorActions;
}

/**
 * The path-focus section: enter focus, or see why there is no path, or the
 * connected count and the exit.
 * @param props The element, the focus state and the actions.
 * @returns The section.
 */
function PathFocusSection(props: PathFocusSectionProps): React.JSX.Element {
	const { elementId, pathFocus, actions } = props;
	const handleFocus = useCallback(() => actions.focusPath(elementId), [actions, elementId]);
	const handleExit = useCallback(() => actions.exitPathFocus(), [actions]);
	return (
		<section className="flex flex-col gap-2">
			<SectionLabel>Path focus</SectionLabel>
			{pathFocus.kind === "no-path" && (
				<p className="text-muted-foreground text-sm">{describePathFocusReason(pathFocus.reason)}</p>
			)}
			{pathFocus.kind === "connected" && (
				<p className="text-sm">
					<span className="font-mono">{pathFocus.elementIds.length}</span> connected elements
				</p>
			)}
			{pathFocus.kind === "connected" ? (
				<Button variant="outline" size="sm" className="self-start" onClick={handleExit}>
					<RiFocusLine data-icon="inline-start" />
					Exit focus
				</Button>
			) : (
				<Button variant="outline" size="sm" className="self-start" onClick={handleFocus}>
					<RiFocus3Line data-icon="inline-start" />
					Focus path
				</Button>
			)}
		</section>
	);
}

/** Inputs for the inspector. */
interface InspectorProps {
	selection: SelectionProjection;
	pathFocus: PathFocusSnapshot;
	actions: InspectorActions;
}

/** Inputs for a one-line inspector body. */
interface LineProps {
	text: string;
}

/**
 * A single plain line, for the kinds that carry no element.
 * @param props The text.
 * @returns The line.
 */
function Line(props: LineProps): React.JSX.Element {
	return <p className="text-muted-foreground text-sm">{props.text}</p>;
}

/** Inputs for the element body. */
interface ElementInspectorProps {
	selection: ElementSelection;
	pathFocus: PathFocusSnapshot;
	actions: InspectorActions;
}

/**
 * The inspector body for one element.
 * @param props The element selection, the focus state and the actions.
 * @returns Title, rows, binding and focus sections.
 */
function ElementInspector(props: ElementInspectorProps): React.JSX.Element {
	const { selection } = props;
	return (
		<>
			<div className="flex items-start justify-between gap-2">
				<h2 className="text-base leading-tight font-semibold">
					{selectedElementTitle(selection.element)}
				</h2>
				<Badge variant="outline" className="shrink-0 uppercase">
					{selection.element.type}
				</Badge>
			</div>
			<ElementRows element={selection.element} />
			<Separator />
			<BindingSection selection={selection} actions={props.actions} />
			<Separator />
			<PathFocusSection
				elementId={selection.element.id}
				pathFocus={props.pathFocus}
				actions={props.actions}
			/>
		</>
	);
}

/**
 * The inspector body by projection kind.
 * @param props The selection, the focus state and the actions.
 * @returns The body, or null for an empty selection.
 */
function InspectorBody(props: InspectorProps): React.JSX.Element | null {
	const { selection } = props;
	if (hasSelectedElement(selection)) {
		return (
			<ElementInspector selection={selection} pathFocus={props.pathFocus} actions={props.actions} />
		);
	}
	if (selection.kind === "multiple") {
		return <Line text={`${selection.count} elements selected.`} />;
	}
	if (selection.kind === "missing") {
		return (
			<p className="text-muted-foreground text-sm">
				Element <span className="font-mono">{selection.id}</span> is no longer on the board.
			</p>
		);
	}
	return null;
}

/**
 * The inspector for the selected element. Hidden while nothing is selected.
 * @param props The selection, the focus state and the actions.
 * @returns The 280px inspector column, or nothing.
 */
function Inspector(props: InspectorProps): React.JSX.Element | null {
	if (props.selection.kind === "empty") {
		return null;
	}
	return (
		<aside
			aria-label="Inspector"
			className="border-border bg-sidebar flex w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-l p-4"
		>
			<SectionLabel>Inspect</SectionLabel>
			<InspectorBody {...props} />
		</aside>
	);
}

export { Inspector, type InspectorProps, type InspectorActions };
