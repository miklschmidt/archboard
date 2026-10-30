import { useCallback, type JSX } from "react";
import { DropdownMenu } from "@archboard/ui-kit/components";
import type { Model, ModelFilters as Filters } from "@archboard/board/content";

type Field = "hideKinds" | "showGroups";
interface ModelFiltersProps {
	model: Model;
	filters: Filters;
	onToggle: (field: Field, id: string) => void;
}

/**
 * Visible filters change the reading while canonical meaning stays intact.
 * @param props The configured vocabulary, hidden features, and toggle action.
 * @returns Keyboard-accessible relationship and group controls.
 */
function ModelFilters(props: ModelFiltersProps): JSX.Element {
	const choices = filterChoices(props);
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				data-slot="model-filters"
				className="text-control bg-card border-border shadow-raised hover:bg-muted rounded-control border px-3 py-1.5"
			>
				Filters ({choices.count})
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" className="w-64">
				<FilterGroup {...props} field="hideKinds" title="Relationships" ids={choices.kinds} />
				<DropdownMenu.Separator />
				<FilterGroup {...props} field="showGroups" title="Group regions" ids={choices.groups} />
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

/**
 * Keep active filters reachable even when a retained state lacks their vocabulary.
 * @param props The model and active features.
 * @param props.model The complete model.
 * @param props.filters The hidden kinds and shown group regions.
 * @returns Used vocabulary and active filters without duplicates.
 */
function filterChoices({ model, filters }: ModelFiltersProps) {
	const hiddenKinds = filters.hideKinds ?? [];
	const shownGroups = filters.showGroups ?? [];
	return {
		count: hiddenKinds.length + shownGroups.length,
		kinds: [...new Set([...model.relationships.map((edge) => edge.kind), ...hiddenKinds])],
		groups: [
			...new Set([...model.modules.flatMap((module) => module.groups ?? []), ...shownGroups]),
		],
	};
}

/**
 * Group related visual controls under their vocabulary heading.
 * @param props The feature family and its available keys.
 * @returns Labeled choices, or an explicit empty state.
 */
function FilterGroup(
	props: ModelFiltersProps & { field: Field; title: string; ids: readonly string[] },
): JSX.Element {
	const vocabulary =
		props.field === "hideKinds" ? props.model.policy.relationshipKinds : props.model.policy.groups;
	return (
		<DropdownMenu.Group>
			<DropdownMenu.Label>{props.title}</DropdownMenu.Label>
			{props.ids.map((id) => (
				<FilterChoice key={id} {...props} id={id} name={vocabulary[id]?.name ?? id} />
			))}
			{props.ids.length === 0 && (
				<DropdownMenu.Item disabled>No configured features</DropdownMenu.Item>
			)}
		</DropdownMenu.Group>
	);
}

/**
 * The shared menu gives pointer and keyboard users the same checkbox toggle.
 * @param props The feature and its current visibility.
 * @returns One labeled filter.
 */
function FilterChoice(
	props: ModelFiltersProps & { id: string; field: Field; name: string },
): JSX.Element {
	const { id, field, onToggle } = props;
	const change = useCallback((): void => onToggle(field, id), [onToggle, field, id]);
	const shown = props.filters[field]?.includes(id) === true;
	return (
		<DropdownMenu.CheckboxItem
			data-filter-kind={field === "hideKinds" ? id : undefined}
			data-filter-group={field === "showGroups" ? id : undefined}
			checked={field === "showGroups" ? shown : !shown}
			onCheckedChange={change}
			closeOnClick={false}
		>
			{props.name}
		</DropdownMenu.CheckboxItem>
	);
}

export { ModelFilters };
