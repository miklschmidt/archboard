import { RiEyeLine, RiEyeOffLine } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, type CSSProperties, type JSX, type ReactNode } from "react";
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
import { rowTone } from "#ui/shell/rules/row-tone.ts";

/**
 * How wide every line's sample is, and the box of every mark: as wide as a kind's chip, so that the
 * names start on one line.
 */
const SAMPLE_WIDTH = 24;

/**
 * The two columns that the kinds and the marks of lines stand in. The foot under the panel lies on
 * the same columns.
 */
const CELLS = "grid grid-cols-2 gap-x-2";

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
 * with no click: its kinds, its line types and its groups. Each line type that a reader can hide
 * is its own switch, and a group's tag selects the group's parts.
 * @param props The reading and its visibility choices.
 * @returns The section, or nothing while no picture stands.
 */
function ModelLegend(props: ModelLegendProps): JSX.Element | null {
	const { model, projection, picture, selection } = props;
	const { hideKinds } = props.filters;
	if (picture === null) return null;
	const reading = { model, projection, picture, hideKinds };
	return (
		<div data-slot="model-legend" className="flex flex-col gap-5">
			<Kinds model={model} look={props.look} rows={kindRows(reading)} />
			<Lines
				lines={lineRows(reading)}
				marks={markRows(projection)}
				onToggle={props.onToggle}
				onShowAll={props.onShowAll}
			/>
			<Groups groups={groupRows(model, projection)} selection={selection} />
		</div>
	);
}

/**
 * One part of the legend, under its own label in the panel's label style.
 * @param props The list.
 * @param props.label What it lists.
 * @param props.slot Where a test finds it.
 * @param props.className How its entries stand.
 * @param props.children Its entries.
 * @returns The list, as a section of the panel.
 */
function LegendList(props: {
	readonly label: string;
	readonly slot: string;
	readonly className: string;
	readonly children: ReactNode;
}): JSX.Element {
	return (
		<ModelPanel.Section title={props.label} slot={`${props.slot}-section`}>
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
	readonly onToggle: ModelLegendProps["onToggle"];
	readonly onShowAll: () => void;
}

/**
 * The line types of the reading, one to a row, each row the switch that draws its lines or leaves
 * them out. Under them, in two columns and with no switch, stand what no reader hides: a mixed
 * line, which is no kind of relationship, and the marks that lines wear beside their kinds.
 * @param props The line types and how to change their visibility.
 * @returns Their list, or nothing when the reading has no line.
 */
function Lines(props: LinesProps): JSX.Element | null {
	const { lines, marks, onToggle, onShowAll } = props;
	const hidden = lines.some((line) => line.hidden);
	const action = useMemo(
		() =>
			hidden ? (
				<Button
					data-slot="model-legend-show-all"
					variant="ghost"
					size="xs"
					onClick={onShowAll}
					className="px-2"
				>
					Show all
				</Button>
			) : undefined,
		[hidden, onShowAll],
	);
	if (lines.length === 0) return null;
	const types = lines.filter((line) => line.hideable);
	const mixed = lines.filter((line) => !line.hideable);
	return (
		<ModelPanel.Section title="Relationships" slot="model-legend-lines-section" action={action}>
			{types.length > 0 && (
				<li>
					<ul data-slot="model-legend-lines" className="flex flex-col">
						{types.map((line) => (
							<LineSwitch key={line.item.typeKind} line={line} onToggle={onToggle} />
						))}
					</ul>
				</li>
			)}
			{mixed.length + marks.length > 0 && (
				<li>
					<ul data-slot="model-legend-marks" className={cn(CELLS, types.length > 0 && "mt-1")}>
						{mixed.map(({ item, dimmed }) => (
							<Cell key={item.typeKind}>
								<Mark name={item.typeName} dimmed={dimmed}>
									<RelationshipSample appearance={item} width={SAMPLE_WIDTH} />
								</Mark>
							</Cell>
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
				</li>
			)}
		</ModelPanel.Section>
	);
}

/**
 * One entry: a mark and what it means.
 * @param props The entry.
 * @param props.children Its mark.
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
					"text-control min-w-0 flex-1 truncate text-left font-normal",
					dimmed && "text-muted-foreground",
				)}
			>
				{props.name}
			</span>
		</>
	);
}

/**
 * A line type that a reader can hide. The whole row is its switch, a row of the panel like any
 * other, and the eye at its end says whether the picture draws the type's lines.
 * @param props The line type and how to change its visibility.
 * @param props.line The line type.
 * @param props.onToggle Change its visibility.
 * @returns The entry.
 */
function LineSwitch(props: {
	readonly line: LegendLine;
	readonly onToggle: ModelLegendProps["onToggle"];
}): JSX.Element {
	const { line, onToggle } = props;
	const { item, hidden, dimmed } = line;
	const toggle = useCallback(
		(): void => onToggle("hideKinds", item.typeKind),
		[onToggle, item.typeKind],
	);
	const Eye = hidden ? RiEyeOffLine : RiEyeLine;
	return (
		<li className="flex">
			<button
				type="button"
				role="switch"
				aria-checked={!hidden}
				aria-label={`Show ${item.typeName} lines`}
				data-filter-kind={item.typeKind}
				onClick={toggle}
				className={cn(
					rowTone({ lit: false }),
					"group -mx-2 flex min-w-0 flex-1 items-center gap-2 px-2 transition-colors",
				)}
			>
				<Mark name={item.typeName} dimmed={dimmed}>
					<RelationshipSample appearance={item} width={SAMPLE_WIDTH} />
				</Mark>
				<Eye
					aria-hidden="true"
					className="text-muted-foreground group-hover:text-foreground mx-1 size-4 shrink-0"
				/>
			</button>
		</li>
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
