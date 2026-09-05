// The right inspector: the selected element, its metadata and its code binding.

import { RiExternalLinkLine, RiFocus3Line } from "@remixicon/react";
import { useCallback } from "react";

import type { CodeBinding } from "@/shared/code-target";
import { Badge } from "@/ui/components/badge";
import { Button } from "@/ui/components/button";
import { Separator } from "@/ui/components/separator";
import type {
	SelectionMetadataRow,
	SelectionProjection,
	ShellActions,
} from "@/ui/shell/lib/contracts";

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

/** Inputs for one metadata row. */
interface MetadataRowProps {
	row: SelectionMetadataRow;
}

/**
 * One metadata row: a label and a value, mono when the value is technical.
 * @param props The row.
 * @returns A definition pair.
 */
function MetadataRow(props: MetadataRowProps): React.JSX.Element {
	const { row } = props;
	return (
		<div className="flex items-baseline justify-between gap-3 text-sm">
			<dt className="text-muted-foreground shrink-0">{row.label}</dt>
			<dd className={row.technical ? "truncate font-mono text-xs" : "truncate"}>{row.value}</dd>
		</div>
	);
}

/** Inputs for the binding rows. */
interface BindingRowsProps {
	binding: CodeBinding;
}

/**
 * The persisted code binding: repository, path and, when known, branch and
 * commit, all in the mono face.
 * @param props The binding.
 * @returns The bound repository rows.
 */
function BindingRows(props: BindingRowsProps): React.JSX.Element {
	const { binding } = props;
	return (
		<dl className="flex flex-col gap-1 font-mono text-xs">
			<div className="flex justify-between gap-3">
				<dt className="text-muted-foreground">repo</dt>
				<dd className="truncate">{binding.repo}</dd>
			</div>
			<div className="flex justify-between gap-3">
				<dt className="text-muted-foreground">path</dt>
				<dd className="truncate">{binding.path}</dd>
			</div>
			{binding.branch !== undefined && (
				<div className="flex justify-between gap-3">
					<dt className="text-muted-foreground">branch</dt>
					<dd className="truncate">{binding.branch}</dd>
				</div>
			)}
			{binding.commit !== undefined && (
				<div className="flex justify-between gap-3">
					<dt className="text-muted-foreground">commit</dt>
					<dd className="truncate">{binding.commit}</dd>
				</div>
			)}
		</dl>
	);
}

/** Inputs for the inspector and its binding section. */
interface InspectorProps {
	selection: SelectionProjection;
	actions: ShellActions;
}

/**
 * The bound-repository section with its two actions.
 * @param props The selection and the actions.
 * @returns The section, with an unbound line when the element has no binding.
 */
function BindingSection(props: InspectorProps): React.JSX.Element {
	const { selection, actions } = props;
	const { elementId, binding } = selection;
	const handleOpen = useCallback(() => actions.openCode(elementId), [actions, elementId]);
	const handleFocus = useCallback(() => actions.focusPath(elementId), [actions, elementId]);
	return (
		<section className="flex flex-col gap-2">
			<SectionLabel>Bound repository</SectionLabel>
			{binding ? (
				<BindingRows binding={binding} />
			) : (
				<p className="text-muted-foreground text-sm">Not bound to code.</p>
			)}
			<div className="flex gap-1.5">
				<Button variant="outline" size="sm" onClick={handleOpen} disabled={binding === null}>
					<RiExternalLinkLine data-icon="inline-start" />
					Open code
				</Button>
				<Button variant="outline" size="sm" onClick={handleFocus}>
					<RiFocus3Line data-icon="inline-start" />
					Focus path
				</Button>
			</div>
		</section>
	);
}

/**
 * The inspector for the selected element.
 * @param props The selection and the actions.
 * @returns The 280px inspector column.
 */
function Inspector(props: InspectorProps): React.JSX.Element {
	const { selection } = props;
	return (
		<aside
			aria-label="Inspector"
			className="border-border bg-sidebar flex w-[280px] shrink-0 flex-col gap-4 overflow-y-auto border-l p-4"
		>
			<SectionLabel>Inspect</SectionLabel>
			<div className="flex items-start justify-between gap-2">
				<h2 className="text-base leading-tight font-semibold">{selection.title}</h2>
				<Badge variant="outline" className="shrink-0 uppercase">
					{selection.elementType}
				</Badge>
			</div>
			<dl className="flex flex-col gap-1.5">
				{selection.metadata.map((row) => (
					<MetadataRow key={row.label} row={row} />
				))}
			</dl>
			<Separator />
			<BindingSection selection={selection} actions={props.actions} />
		</aside>
	);
}

export { Inspector, type InspectorProps };
