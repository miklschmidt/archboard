import { useCallback, useMemo, type JSX } from "react";
import { modelContent, type Model } from "@archboard/model/content";
import type { ModelSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { SemanticGroupList } from "#ui/architecture-drawing/canvas/presentation/components/SemanticGroupList.tsx";
import {
	groupChoices,
	groupSelection,
} from "#ui/architecture-drawing/canvas/picture/rules/groups.ts";

/**
 * Group choices select authored members independently of the visible scope.
 * @param props The selected architecture and its existing selection owner.
 * @param props.model The complete model.
 * @param props.selection Canonical selected identities and actions.
 * @returns The existing group color key and member-selection controls.
 */
function ModelGroups(props: { model: Model; selection: ModelSelection }): JSX.Element | null {
	const content = useMemo(() => modelContent(props.model), [props.model]);
	const choices = useMemo(
		() => groupChoices(content, props.model.policy.groups),
		[content, props.model.policy.groups],
	);
	const { ids, selectMany } = props.selection;
	const selected = useMemo(
		() =>
			new Set(
				choices.flatMap((choice) => {
					const { members } = groupSelection(content, choice.id);
					return members.length === ids.size && members.every((id) => ids.has(id))
						? [choice.id]
						: [];
				}),
			),
		[choices, content, ids],
	);
	const choose = useCallback(
		(group: string | null): void => {
			selectMany(group === null ? [] : groupSelection(content, group).members);
		},
		[content, selectMany],
	);
	if (choices.length === 0) return null;
	return <SemanticGroupList choices={choices} selected={selected} onChoose={choose} />;
}

export { ModelGroups };
