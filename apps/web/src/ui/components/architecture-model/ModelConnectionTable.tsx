import { RiArrowLeftRightLine, RiArrowRightLine } from "@remixicon/react";
import { useCallback, useMemo, type CSSProperties, type JSX, type ReactNode } from "react";
import type { Model, projectModel } from "@archboard/model/content";
import { cn } from "@archboard/ui-kit/components";
import { ModelAboutTable } from "#ui/components/architecture-model/ModelAboutTable.tsx";
import { lineEnds, moduleName } from "#ui/components/architecture-model/ModelConnections.tsx";
import { KindIcon, RelationshipChip } from "#ui/components/canvas/KindMarks.tsx";
import { useModelPick } from "#ui/hooks/architecture-model/use-model-pick.ts";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import type { KindLook } from "#ui/rules/canvas/reading/kind-look.ts";

type Connection = ReturnType<typeof projectModel>["connections"][number];

/** Inputs for a table of connections. */
interface ModelConnectionTableProps {
	model: Model;
	reference: Model | undefined;
	connections: readonly Connection[];
	selected: ReadonlySet<string>;
	look: KindLook;
	onSelect: ModelSelection["select"];
	/** Pick a subject out and show it on the diagram. */
	onShow: (id: string) => void;
	/** What a row adds under its cells. */
	detail?: ((connection: Connection) => ReactNode) | undefined;
}

/** The table's columns: from, to after its arrow, what it carries, and its kind. */
const CONNECTION_GRID =
	"grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_176px] items-start gap-x-4 pl-3 pr-1";

/**
 * Keyboard users inspect the same projected lines as pointer users: a table of both ends, what
 * each line carries and its kinds. A row lights while a module at either end is selected.
 * @param props The lines and the selection action.
 * @returns The table.
 */
function ModelConnectionTable(props: ModelConnectionTableProps): JSX.Element {
	return (
		<div className="-mx-3">
			<ModelAboutTable.Head grid={CONNECTION_GRID}>
				<span>From</span>
				<span>To</span>
				<span>What it carries</span>
				<span>Kind</span>
			</ModelAboutTable.Head>
			<ul data-slot="model-connections" className="border-border border-t">
				{props.connections.map((connection) => (
					<ConnectionRow key={connection.line.id} {...props} connection={connection} />
				))}
			</ul>
		</div>
	);
}

/**
 * The distinct kinds that a line joins, in authored order.
 * @param joins The relationships behind the line.
 * @returns The kinds.
 */
function kindsOf(joins: Connection["joins"]): readonly string[] {
	return [...new Set(joins.map((edge) => edge.kind))];
}

/**
 * Keep the projected endpoints and kind visible before inspection.
 * @param props The line and its selection action.
 * @returns A keyboard-accessible row.
 */
function ConnectionRow(
	props: ModelConnectionTableProps & { readonly connection: Connection },
): JSX.Element {
	const { model, reference, connection, selected, look, onSelect, onShow } = props;
	const { line, joins } = connection;
	const pick = useModelPick(line.id, onSelect);
	const show = useCallback((): void => onShow(line.id), [onShow, line.id]);
	const picked = joins.every((edge) => selected.has(edge.id));
	const Arrow = line.twoWay === true ? RiArrowLeftRightLine : RiArrowRightLine;
	return (
		<li
			data-lit={selected.has(line.from) || selected.has(line.to) || undefined}
			className="border-border hover:bg-muted/50 has-aria-pressed:bg-sidebar-accent data-lit:bg-primary-subtle relative flex min-w-0 items-stretch border-b"
		>
			<div className="min-w-0 flex-1">
				<button
					type="button"
					data-connection-id={line.id}
					data-from={line.from}
					data-to={line.to}
					data-kind={line.kind}
					aria-pressed={picked}
					{...pick}
					className={cn(CONNECTION_GRID, "text-control min-h-10 w-full py-2 text-left")}
				>
					<ConnectionEnd id={line.from} model={model} reference={reference} look={look} />
					<span className="flex min-w-0 items-center gap-2">
						<Arrow aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
						<ConnectionEnd id={line.to} model={model} reference={reference} look={look} />
					</span>
					<span className="text-foreground/85 min-w-0 font-normal">{line.label}</span>
					<span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
						{kindsOf(joins).map((kind) => (
							<RelationshipChip key={kind} look={look} kind={kind} />
						))}
					</span>
				</button>
				{props.detail?.(connection)}
			</div>
			<ModelAboutTable.Show name={lineEnds(line, model, reference)} onShow={show} />
		</li>
	);
}

/**
 * One end of a line: its kind's icon in its kind's colour and its name.
 * @param props The module at the end.
 * @param props.id Its identity.
 * @param props.model The model that names it.
 * @param props.reference The coherent base for a removed end.
 * @param props.look How the vault's kinds look.
 * @returns The end.
 */
function ConnectionEnd(props: {
	readonly id: string;
	readonly model: Model;
	readonly reference: Model | undefined;
	readonly look: KindLook;
}): JSX.Element {
	const { id, model, reference, look } = props;
	const kind = [...model.modules, ...(reference?.modules ?? [])].find(
		(module) => module.id === id,
	)?.kind;
	const ink = useMemo<CSSProperties | undefined>(
		() => (kind === undefined ? undefined : { color: look.nodeColor(kind) }),
		[look, kind],
	);
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			{kind !== undefined && <KindIcon look={look} kind={kind} className="size-4" style={ink} />}
			<span className="truncate">{moduleName(model, id, reference)}</span>
		</span>
	);
}

export { ModelConnectionTable };
