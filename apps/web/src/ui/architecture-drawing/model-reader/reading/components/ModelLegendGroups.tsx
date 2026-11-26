// The tags of a legend's groups. A tag selects its group's parts through the reading's selection,
// or, in a legend that only explains, presses nothing.

import { useCallback, useMemo, type CSSProperties, type JSX } from "react";
import { cn } from "@archboard/ui-kit/components";
import type { ModelSelection } from "#ui/architecture-drawing/model-reader/hooks/use-model-selection.ts";
import type { LegendGroup } from "#ui/architecture-drawing/model-reader/reading/rules/legend-rows.ts";
import { paletteTag } from "#ui/architecture-drawing/canvas/picture/rules/palette.ts";

/**
 * One tag for each group.
 * @param props The groups.
 * @param props.groups One row for each.
 * @param props.selection The selection that their tags choose, or nothing where they only explain.
 * @returns The tags, as entries of a list.
 */
function GroupTags(props: {
	readonly groups: readonly LegendGroup[];
	readonly selection: ModelSelection | undefined;
}): JSX.Element {
	const { selection } = props;
	return (
		<>
			{props.groups.map((group) =>
				selection === undefined ? (
					<StillTag key={group.id} group={group} />
				) : (
					<GroupTag key={group.id} group={group} selection={selection} />
				),
			)}
		</>
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

/**
 * A group's tag that presses nothing, as a presented walkthrough shows it: the walkthrough says
 * what is selected.
 * @param props The group.
 * @param props.group Its name, its colour and its parts.
 * @returns The tag.
 */
function StillTag(props: { readonly group: LegendGroup }): JSX.Element {
	const { color, parts } = props.group;
	const style = useMemo<CSSProperties>(() => ({ "--tag": paletteTag(color) }), [color]);
	return (
		<li>
			<span
				data-group-id={props.group.id}
				style={style}
				className={cn(
					"group-tag text-technical block px-2 py-0.5 leading-4 whitespace-nowrap",
					parts.length === 0 && "opacity-40",
				)}
			>
				{props.group.name}
			</span>
		</li>
	);
}

export { GroupTags };
