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
import {
	EmphasisSample,
	RelationshipSample,
	TrafficSample,
	TypeSample,
} from "#ui/components/canvas/SemanticTypeSamples.tsx";
import { iconQuery } from "#ui/clients/canvas/reads/queries.ts";
import type { AppliedAppearance, PictureLegend } from "#ui/clients/canvas/reads/drawings.ts";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import {
	groupRows,
	kindRows,
	lineRows,
	markRows,
	type LegendGroup,
	type LegendLine,
	type LegendMark,
	type LegendRow,
} from "#ui/rules/architecture-model/legend-rows.ts";
import { paletteTag } from "#ui/rules/canvas/reading/palette.ts";

/** How wide every line's sample is, and the box of every mark, so that the names start on one line. */
const SAMPLE_WIDTH = 22;

/** The size of a kind's chip and its icon, as wide as the ink of a line's sample. */
const CHIP = "size-5 [&>svg]:size-3.5";

/** The two columns that the head, the kinds and the line types stand in. */
const CELLS = "grid grid-cols-2 gap-x-4";

/** A key held pressed in. */
const PRESSED = "bg-muted dark:bg-muted text-foreground shadow-pressed";

/** Inputs for the legend. */
interface ModelLegendProps {
	readonly model: Model;
	readonly projection: ReturnType<typeof projectModel>;
	/** What the picture draws, or null while it draws nothing that a legend explains. */
	readonly picture: PictureLegend | null;
	readonly filters: Pick<ModelFilters, "hideKinds">;
	readonly onToggle: (field: "hideKinds", id: string) => void;
	/** Draw every kind of line again. */
	readonly onShowAll: () => void;
	readonly selection: ModelSelection;
}

/**
 * What the marks of a picture mean, at the foot of the right panel with no click: its kinds, its
 * line types and its groups. Filter puts the control that hides a line type on each row, in room
 * that the row always keeps, and a group's tag selects the group's parts.
 * @param props The reading and its visibility choices.
 * @returns The legend, or nothing while no picture stands.
 */
function ModelLegend(props: ModelLegendProps): JSX.Element | null {
	const { model, projection, picture, selection } = props;
	const [filtering, setFiltering] = useState(false);
	const toggle = useCallback((): void => setFiltering((on) => !on), []);
	if (picture === null) return null;
	const reading = { model, projection, picture, hideKinds: props.filters.hideKinds };
	const lines = lineRows(reading);
	return (
		<section
			aria-label="Legend"
			data-slot="model-legend"
			className="border-border bg-raised shadow-edge-up relative flex shrink-0 flex-col gap-2 border-t px-4 pt-3 pb-4"
		>
			<LegendHead
				hidden={lines.filter((line) => line.hidden).length}
				filterable={lines.some((line) => line.hideable)}
				filtering={filtering}
				onFilter={toggle}
				onShowAll={props.onShowAll}
			/>
			<div className="divide-border flex flex-col divide-y *:py-2 *:first:pt-0 *:last:pb-0">
				<Kinds model={model} rows={kindRows(reading)} />
				<Lines
					lines={lines}
					marks={markRows(projection)}
					filtering={filtering}
					onToggle={props.onToggle}
				/>
				<Groups groups={groupRows(model, projection)} selection={selection} />
			</div>
		</section>
	);
}

/**
 * The legend's name, the key that shows which line types a reader can hide, and the way back from
 * what a reader hid. Both stand in the second column and grow into its free room, so neither moves
 * the other's words.
 * @param props What the controls say and do.
 * @param props.hidden How many kinds of this reading the picture leaves out.
 * @param props.filterable Whether the reading has a line type to hide.
 * @param props.filtering Whether each line type shows its control.
 * @param props.onFilter Show or put away those controls.
 * @param props.onShowAll Draw every kind of line again.
 * @returns The head.
 */
function LegendHead(props: {
	readonly hidden: number;
	readonly filterable: boolean;
	readonly filtering: boolean;
	readonly onFilter: () => void;
	readonly onShowAll: () => void;
}): JSX.Element {
	const { hidden, filtering } = props;
	return (
		<header className={`${CELLS} min-h-7 items-center`}>
			<h3 className="text-title font-semibold">Legend</h3>
			{props.filterable && (
				<div className="flex items-center justify-between gap-2">
					<Button
						data-slot="model-legend-filter"
						variant="outline"
						size="sm"
						aria-pressed={filtering}
						title={filtering ? "Put the switches away" : "Choose which lines to draw"}
						onClick={props.onFilter}
						className={cn("relative", filtering && PRESSED)}
					>
						<RiFilterLine aria-hidden="true" />
						Filter
						{hidden > 0 && (
							<span data-slot="model-legend-hidden" className="text-technical font-mono">
								{hidden}
								<span className="sr-only"> hidden</span>
							</span>
						)}
					</Button>
					{hidden > 0 && (
						<Button
							data-slot="model-legend-show-all"
							variant="ghost"
							size="sm"
							onClick={props.onShowAll}
							className="-mr-1.5 px-1.5"
						>
							Show all
						</Button>
					)}
				</div>
			)}
		</header>
	);
}

/**
 * The kinds of part in the reading.
 * @param props The kinds.
 * @param props.model The reading, whose policy names the icon of a kind that the picture leaves out.
 * @param props.rows One row for each.
 * @returns Their list, or nothing when there are none.
 */
function Kinds(props: {
	readonly model: Model;
	readonly rows: readonly LegendRow[];
}): JSX.Element | null {
	const { model, rows } = props;
	if (rows.length === 0) return null;
	return (
		<ul aria-label="Kinds" data-slot="model-legend-kinds" className={CELLS}>
			{rows.map(({ item, dimmed }) => (
				<Cell key={item.typeKind}>
					<Mark name={item.typeName} dimmed={dimmed}>
						{dimmed ? (
							<PolicySample item={item} icon={model.policy.nodeKinds[item.typeKind]?.icon} />
						) : (
							<TypeSample appearance={item} className={CHIP} />
						)}
					</Mark>
				</Cell>
			))}
		</ul>
	);
}

/**
 * The chip of a kind that the picture does not draw now, with the icon that the policy names, so
 * that its row reads the same as when the picture draws the kind.
 * @param props The kind.
 * @param props.item How it looks.
 * @param props.icon The icon's name, when the vault's policy names the kind.
 * @returns The chip, which is plain until the icon arrives.
 */
function PolicySample(props: {
	readonly item: AppliedAppearance;
	readonly icon: string | undefined;
}): JSX.Element {
	const { item, icon } = props;
	const paths = useQuery({ ...iconQuery(icon ?? ""), enabled: icon !== undefined }).data ?? [];
	const iconSvg = paths.map((d) => `<path d="${d}"/>`).join("");
	const appearance = useMemo(
		() => ({ ...item, iconSvg: `<svg viewBox="0 0 24 24" aria-hidden="true">${iconSvg}</svg>` }),
		[item, iconSvg],
	);
	return <TypeSample appearance={appearance} className={CHIP} />;
}

/** Inputs for the line types. */
interface LinesProps {
	readonly lines: readonly LegendLine[];
	readonly marks: readonly LegendMark[];
	/** Whether each line type shows the control that hides it. */
	readonly filtering: boolean;
	readonly onToggle: ModelLegendProps["onToggle"];
}

/**
 * The line types of the reading, then the marks that its lines wear beside their kinds.
 * @param props The line types and how to change their visibility.
 * @returns Their list, or nothing when the reading has no line.
 */
function Lines(props: LinesProps): JSX.Element | null {
	const { lines, marks, filtering, onToggle } = props;
	if (lines.length === 0) return null;
	return (
		<ul aria-label="Line types" data-slot="model-legend-lines" className={CELLS}>
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
		</ul>
	);
}

/**
 * One entry: a mark and what it means, then the control that changes the reading, if it has one.
 * @param props The entry.
 * @param props.children Its mark and control.
 * @returns The entry.
 */
function Cell(props: { readonly children: ReactNode }): JSX.Element {
	return <li className="flex min-h-6 min-w-0 items-center gap-2">{props.children}</li>;
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
				className={cn("flex w-5.5 shrink-0 justify-center", dimmed && "opacity-40")}
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
		<ul
			aria-label="Groups"
			data-slot="model-legend-groups"
			className="flex flex-wrap gap-x-2 gap-y-2.5"
		>
			{groups.map((group) => (
				<GroupTag key={group.id} group={group} selection={selection} />
			))}
		</ul>
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
