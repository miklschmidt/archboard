import { useCallback, useContext, useMemo, useState } from "react";
import { ModelExplanationContext } from "#ui/state/architecture-model/explanations.ts";
import type { projectModel } from "@archboard/board/content";

type Projection = ReturnType<typeof projectModel>;

/**
 * Selection holds canonical identities independently from navigation and layout.
 * @param projection The current visible lines and their authored relationships.
 * @param initial Authored selection or an explicit reference destination.
 * @param readingKey A captured beat identity that resets transient selection when it changes.
 * @returns The selection and immediate pointer, keyboard, and clearing actions.
 */
function useModelSelection(projection: Projection, initial: readonly string[], readingKey = "") {
	return useProjectedSelection(projection, useSubjectSelection(initial, readingKey));
}

/**
 * Keep ordinary selection alive while another reading loads.
 * @param initial The explicit starting identities.
 * @param readingKey A captured beat identity, when selection belongs to playback.
 * @returns Canonical selection and its immediate actions.
 */
function useSubjectSelection(initial: readonly string[], readingKey = "") {
	const host = useContext(ModelExplanationContext);
	const userChanged = host?.userChanged;
	const baseline = useMemo(() => new Set(initial), [initial]);
	const [choice, setChoice] = useState<{ key: string; ids: ReadonlySet<string> }>(() => ({
		key: readingKey,
		ids: baseline,
	}));
	const ids = choice.key === readingKey ? choice.ids : baseline;
	const selectMany = useCallback(
		(subjects: readonly string[], toggle = false): void => {
			userChanged?.("selection");
			setChoice((current) => ({
				key: readingKey,
				ids: selectedAfter(current.key === readingKey ? current.ids : baseline, subjects, toggle),
			}));
		},
		[readingKey, baseline, userChanged],
	);
	const select = useCallback(
		(id: string | null, toggle = false): void => {
			selectMany(id === null ? [] : [id], toggle);
		},
		[selectMany],
	);
	const clear = useCallback((): void => selectMany([]), [selectMany]);
	return { ids, select, selectMany, clear };
}

/**
 * Translate visible aggregate lines into the authored relationships they represent.
 * @param projection The current drawing projection.
 * @param selection The canonical selection owner.
 * @returns The same selected identities with drawing-aware input actions.
 */
function useProjectedSelection(projection: Projection, selection: SubjectSelection) {
	const { selectMany: choose } = selection;
	const selectMany = useCallback(
		(subjects: readonly string[], toggle = false): void => {
			choose(
				subjects.flatMap((id) => {
					const connection = projection.connections.find(({ line }) => line.id === id);
					return connection === undefined ? [id] : connection.joins.map((edge) => edge.id);
				}),
				toggle,
			);
		},
		[projection.connections, choose],
	);
	const select = useCallback(
		(id: string | null, toggle = false): void => selectMany(id === null ? [] : [id], toggle),
		[selectMany],
	);
	return { ...selection, select, selectMany };
}

/**
 * A modifier removes a selected group or adds the complete group.
 * @param current The previous canonical identities.
 * @param subjects The incoming canonical identities.
 * @param toggle Whether the gesture extends the current set.
 * @returns The next selection without changing any model value.
 */
function selectedAfter(
	current: ReadonlySet<string>,
	subjects: readonly string[],
	toggle: boolean,
): ReadonlySet<string> {
	if (!toggle) return new Set(subjects);
	const next = new Set(current);
	const remove = subjects.every((id) => current.has(id));
	for (const id of subjects) {
		if (remove) next.delete(id);
		else next.add(id);
	}
	return next;
}

type ModelSelection = ReturnType<typeof useModelSelection>;
type SubjectSelection = ReturnType<typeof useSubjectSelection>;
export { useModelSelection, useSubjectSelection, useProjectedSelection, type ModelSelection };
