import { RiEyeLine, RiEyeOffLine, RiFilterLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import {
	useCallback,
	useMemo,
	useState,
	type CSSProperties,
	type JSX,
	type ReactNode,
} from "react";
import type { Model, ModelFilters, projectModel } from "@archboard/model/content";
import { Button, cn } from "@archboard/ui-kit/components";
import { KindChip } from "#ui/architecture-drawing/canvas/presentation/components/KindMarks.tsx";
import {
	EmphasisSample,
	RelationshipSample,
	TrafficSample,
} from "#ui/architecture-drawing/canvas/presentation/components/SemanticTypeSamples.tsx";
import { iconQuery } from "#ui/architecture-drawing/canvas/picture/reads/clients/queries.ts";
import type { PictureLegend } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import type { KindLook } from "#ui/architecture-drawing/canvas/picture/rules/kind-look.ts";
import { ModelPanel } from "#ui/architecture-drawing/model-reader/reading/components/ModelPanel.tsx";
import type { ModelSelection } from "#ui/architecture-drawing/model-reader/hooks/use-model-selection.ts";
import {
	groupRows,
	kindRows,
	lineRows,
	markRows,
	type LegendGroup,
	type LegendLine,
	type LegendMark,
	type LegendRow,
} from "#ui/architecture-drawing/model-reader/reading/rules/legend-rows.ts";
import { paletteTag } from "#ui/architecture-drawing/canvas/picture/rules/palette.ts";

/**
 * How wide every line's sample is, and the box of every mark: as wide as a kind's chip, so that the
 * names start on one line.
 */
const SAMPLE_WIDTH = 24;

/**
 * The two columns that the kinds and the line types stand in. The foot under the panel lies on the
 * same columns.
 */
const CELLS = "grid grid-cols-2 gap-x-2";
/** The line rows while no picture stands. */
const NO_LINES: readonly LegendLine[] = [];

/** The legend's Filter key looks like the panel's other keys, such as Trace back (`TraceToggle`). */
const PANEL_KEY =
	"text-body border-border hover:bg-sidebar-accent/50 aria-pressed:border-primary-mark aria-pressed:bg-primary-subtle rounded-control flex h-6 shrink-0 items-center gap-1.5 border px-2 transition-colors";

/** Inputs for the legend. */
interface ModelLegendProps {
	readonly model: Model;
	readonly projection: ReturnType<typeof projectModel>;
	/** What the picture draws, or null while it draws nothing that a legend explains. */
	readonly picture: PictureLegend | null;
	/** How the vault's kinds look, with the icons the picture draws them with. */
	readonly look: KindLook;
	readonly filters: Pick<ModelFilters, "hideKinds">;
	readonly onToggle: (field: "hideKinds", id: string) => void;
	/** Draw every kind of line again. */
	readonly onShowAll: () => void;
	readonly selection: ModelSelection;
}

/**
 * What the marks of a picture mean, as the last section of the right panel, under every subject,
 * with no click: its kinds, its line types and its groups. Filter puts the switch that hides a line
 * type on each row, in room that the row always keeps, and a group's tag selects the group's parts.
 * @param props The reading and its visibility choices.
 * @returns The section, or nothing while no picture stands.
 */
function ModelLegend(props: ModelLegendProps): JSX.Element | null {
	const { model, projection, picture, selection } = props;
	const [filtering, setFiltering] = useState(false);
	const toggle = useCallback((): void => setFiltering((on) => !on), []);
	const { hideKinds } = props.filters;
	const lines = useMemo(
		() => (picture === null ? NO_LINES : lineRows({ model, projection, picture, hideKinds })),
		[model, projection, picture, hideKinds],
	);
	const hidden = lines.filter((line) => line.hidden).length;
	const filterable = lines.some((line) => line.hideable);
	const { onShowAll } = props;
	const keys = useMemo(
		() => (
			<LegendKeys
				hidden={hidden}
				filterable={filterable}
				filtering={filtering}
				onFilter={toggle}
				onShowAll={onShowAll}
			/>
		),
		[hidden, filterable, filtering, toggle, onShowAll],
	);
	if (picture === null) return null;
	const reading = { model, projection, picture, hideKinds };
	return (
		<div data-slot="model-legend" className="flex flex-col gap-5">
			<Kinds model={model} look={props.look} rows={kindRows(reading)} />
			<Lines
				lines={lines}
				marks={markRows(projection)}
				filtering={filtering}
				onToggle={props.onToggle}
				keys={keys}
			/>
			<Groups groups={groupRows(model, projection)} selection={selection} />
		</div>
	);
}

/**
 * The key that shows which line types a reader can hide, and the way back from what a reader hid.
 * Both stand in the second column of the legend: Filter at its start, where it grows into the free
 * room, and Show all at its end, so neither moves the other's words.
 * @param props What the keys say and do.
 * @param props.hidden How many kinds of this reading the picture leaves out.
 * @param props.filterable Whether the reading has a line type to hide.
 * @param props.filtering Whether each line type shows its switch.
 * @param props.onFilter Show or put away those switches.
 * @param props.onShowAll Draw every kind of line again.
 * @returns The keys, or nothing for a reading with no line type to hide.
 */
function LegendKeys(props: {
	readonly hidden: number;
	readonly filterable: boolean;
	readonly filtering: boolean;
	readonly onFilter: () => void;
	readonly onShowAll: () => void;
}): JSX.Element | null {
	const { hidden, filtering } = props;
	if (!props.filterable) return null;
	return (
		<div className="flex shrink-0 items-center gap-1">
			{hidden > 0 && (
				<Button
					data-slot="model-legend-show-all"
					variant="ghost"
					size="xs"
					onClick={props.onShowAll}
					className="px-2"
				>
					Show all
				</Button>
			)}
			<button
				type="button"
				data-slot="model-legend-filter"
				aria-pressed={filtering}
				title={filtering ? "Put the switches away" : "Choose which lines to draw"}
				onClick={props.onFilter}
				className={PANEL_KEY}
			>
				<RiFilterLine aria-hidden="true" className="text-muted-foreground size-3.5" />
				Filter
				{hidden > 0 && (
					<span
						data-slot="model-legend-hidden"
						className="text-technical text-muted-foreground font-mono"
					>
						{hidden}
						<span className="sr-only"> hidden</span>
					</span>
				)}
			</button>
		</div>
	);
}

/**
 * One part of the legend, under its own label in the panel's label style, with its keys at the
 * right end of the label's row.
 * @param props The list.
 * @param props.label What it lists.
 * @param props.slot Where a test finds it.
 * @param props.className How its entries stand.
 * @param props.action The keys that change what it lists, if any.
 * @param props.children Its entries.
 * @returns The list, as a section of the panel.
 */
function LegendList(props: {
	readonly label: string;
	readonly slot: string;
	readonly className: string;
	readonly action?: ReactNode;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<ModelPanel.Section title={props.label} slot={`${props.slot}-section`} action={props.action}>
			<li>
				<ul data-slot={props.slot} className={props.className}>
					{props.children}
				</ul>
			</li>
		</ModelPanel.Section>
	);
}

/**
 * The kinds of part in the reading, each with the chip that the head of the panel puts before a
 * module's name.
 * @param props The kinds.
 * @param props.model The reading, whose policy names the icon of a kind that the picture leaves out.
 * @param props.look How the vault's kinds look.
 * @param props.rows One row for each.
 * @returns Their list, or nothing when there are none.
 */
function Kinds(props: {
	readonly model: Model;
	readonly look: KindLook;
	readonly rows: readonly LegendRow[];
}): JSX.Element | null {
	const { model, look, rows } = props;
	if (rows.length === 0) return null;
	return (
		<LegendList label="Legend" slot="model-legend-kinds" className={CELLS}>
			{rows.map(({ item, dimmed }) => (
				<Cell key={item.typeKind}>
					<Mark name={item.typeName} dimmed={dimmed}>
						<LegendChip
							look={look}
							kind={item.typeKind}
							icon={dimmed ? model.policy.nodeKinds[item.typeKind]?.icon : undefined}
						/>
					</Mark>
				</Cell>
			))}
		</LegendList>
	);
}

/**
 * The chip of a kind. A kind that the picture does not draw now takes the icon that the policy
 * names, so that its row reads the same as when the picture draws the kind.
 * @param props The kind.
 * @param props.look How the vault's kinds look.
 * @param props.kind The kind.
 * @param props.icon The policy's icon for it, when the picture does not draw it.
 * @returns The chip.
 */
function LegendChip(props: {
	readonly look: KindLook;
	readonly kind: string;
	readonly icon: string | undefined;
}): JSX.Element {
	const { icon } = props;
	const paths = useQuery({ ...iconQuery(icon ?? ""), enabled: icon !== undefined }).data;
	const markup = useMemo(
		() =>
			paths === undefined
				? undefined
				: `<svg viewBox="0 0 24 24" aria-hidden="true">${paths.map((d) => `<path d="${d}"/>`).join("")}</svg>`,
		[paths],
	);
	return <KindChip look={props.look} kind={props.kind} icon={markup} />;
}

/** Inputs for the line types. */
interface LinesProps {
	readonly lines: readonly LegendLine[];
	readonly marks: readonly LegendMark[];
	/** Whether each line type shows the control that hides it. */
	readonly filtering: boolean;
	readonly onToggle: ModelLegendProps["onToggle"];
	/** The keys that hide line types, and bring them back. */
	readonly keys: ReactNode;
}

/**
 * The line types of the reading, then the marks that its lines wear beside their kinds.
 * @param props The line types and how to change their visibility.
 * @returns Their list, or nothing when the reading has no line.
 */
function Lines(props: LinesProps): JSX.Element | null {
	const { lines, marks, filtering, onToggle, keys } = props;
	if (lines.length === 0) return null;
	return (
		<LegendList label="Relationships" slot="model-legend-lines" className={CELLS} action={keys}>
			{lines.map((line) => (
				<LineCell key={line.item.typeKind} line={line} filtering={filtering} onToggle={onToggle} />
			))}
			{marks.map(({ mark, word, dimmed }) => (
				<Cell key={mark}>
					<Mark name={word} dimmed={dimmed}>
						{mark === "emphasis" ? (
							<EmphasisSample width={SAMPLE_WIDTH} />
						) : (
							<TrafficSample width={SAMPLE_WIDTH} />
						)}
					</Mark>
				</Cell>
			))}
		</LegendList>
	);
}

/**
 * One entry: a mark and what it means, then the control that changes the reading, if it has one.
 * @param props The entry.
 * @param props.children Its mark and control.
 * @returns The entry.
 */
function Cell(props: { readonly children: ReactNode }): JSX.Element {
	return <li className="flex min-h-7 min-w-0 items-center gap-2">{props.children}</li>;
}

/**
 * A mark, as the picture draws it, and what it means.
 * @param props The mark.
 * @param props.name What it means.
 * @param props.dimmed Whether the picture leaves it out.
 * @param props.children The mark.
 * @returns The two.
 */
function Mark(props: {
	readonly name: string;
	readonly dimmed: boolean;
	readonly children: ReactNode;
}): JSX.Element {
	const { dimmed } = props;
	return (
		<>
			<span
				aria-hidden="true"
				className={cn("flex w-6 shrink-0 justify-center", dimmed && "opacity-40")}
			>
				{props.children}
			</span>
			<span
				title={props.name}
				className={cn(
					"text-control min-w-0 flex-1 truncate font-normal",
					dimmed && "text-muted-foreground",
				)}
			>
				{props.name}
			</span>
		</>
	);
}

/**
 * A line type, whether the picture draws it or leaves it out. Its row keeps the room of its switch
 * while the switch is put away, so that Filter moves no word.
 * @param props The line type and how to change its visibility.
 * @param props.line The line type.
 * @param props.filtering Whether it shows the control that hides it.
 * @param props.onToggle Change its visibility.
 * @returns The entry.
 */
function LineCell(props: {
	readonly line: LegendLine;
	readonly filtering: boolean;
	readonly onToggle: ModelLegendProps["onToggle"];
}): JSX.Element {
	const { line, filtering, onToggle } = props;
	const { item, hidden, hideable, dimmed } = line;
	const toggle = useCallback(
		(): void => onToggle("hideKinds", item.typeKind),
		[onToggle, item.typeKind],
	);
	return (
		<Cell>
			<Mark name={item.typeName} dimmed={dimmed}>
				<RelationshipSample appearance={item} width={SAMPLE_WIDTH} />
			</Mark>
			{hideable && (
				<span className="size-6 shrink-0">
					{filtering && (
						<Visibility
							shown={!hidden}
							name={`${item.typeName} lines`}
							kind={item.typeKind}
							onToggle={toggle}
						/>
					)}
				</span>
			)}
		</Cell>
	);
}

/**
 * The control that says whether the picture draws a kind, apart from the mark that explains it.
 * @param props What it controls.
 * @param props.shown Whether the picture draws it.
 * @param props.name What it is called.
 * @param props.kind The relationship kind it controls.
 * @param props.onToggle Change it.
 * @returns A switch.
 */
function Visibility(props: {
	readonly shown: boolean;
	readonly name: string;
	readonly kind: string;
	readonly onToggle: () => void;
}): JSX.Element {
	const { shown } = props;
	return (
		<Button
			variant="ghost"
			size="icon-xs"
			role="switch"
			aria-checked={shown}
			aria-label={`Show ${props.name}`}
			title={`${shown ? "Hide" : "Show"} ${props.name}`}
			data-filter-kind={props.kind}
			onClick={props.onToggle}
			className="text-muted-foreground aria-checked:text-foreground"
		>
			{shown ? (
				<RiEyeLine aria-hidden="true" className="size-4" />
			) : (
				<RiEyeOffLine aria-hidden="true" className="size-4" />
			)}
		</Button>
	);
}

/**
 * The groups of the reading, which close the legend.
 * @param props The groups.
 * @param props.groups One row for each.
 * @param props.selection The selection that their tags choose.
 * @returns Their tags, or nothing for a reading with no groups.
 */
function Groups(props: {
	readonly groups: readonly LegendGroup[];
	readonly selection: ModelSelection;
}): JSX.Element | null {
	const { groups, selection } = props;
	if (groups.length === 0) return null;
	return (
		<LegendList
			label="Groups"
			slot="model-legend-groups"
			className="flex flex-wrap gap-x-2 gap-y-2.5"
		>
			{groups.map((group) => (
				<GroupTag key={group.id} group={group} selection={selection} />
			))}
		</LegendList>
	);
}

/**
 * A group, as a tag with its name inside. It selects what the picture draws of the group, and it
 * reads as on while the selection is exactly that. A group whose parts a filter took off the
 * picture has nothing to select, so its tag stays, dimmed.
 * @param props The group.
 * @param props.group Its name, its colour and its parts.
 * @param props.selection The selection that it chooses.
 * @returns The tag.
 */
function GroupTag(props: {
	readonly group: LegendGroup;
	readonly selection: ModelSelection;
}): JSX.Element {
	const { group, selection } = props;
	const { color, parts } = group;
	const { ids, selectMany, clear } = selection;
	const held = parts.length === 0;
	const on = !held && parts.length === ids.size && parts.every((id) => ids.has(id));
	const style = useMemo<CSSProperties>(() => ({ "--tag": paletteTag(color) }), [color]);
	const choose = useCallback((): void => {
		if (on) clear();
		else selectMany(parts);
	}, [on, clear, selectMany, parts]);
	return (
		<li>
			<button
				type="button"
				data-group-id={group.id}
				aria-pressed={on}
				disabled={held}
				title={held ? "A filter hides its parts" : on ? "Clear the selection" : "Select its parts"}
				style={style}
				onClick={choose}
				className="group-tag text-technical block px-2 py-0.5 leading-4 whitespace-nowrap disabled:opacity-40"
			>
				{group.name}
			</button>
		</li>
	);
}

export { ModelLegend };
