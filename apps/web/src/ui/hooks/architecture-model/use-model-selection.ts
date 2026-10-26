import { useCallback, useState } from "react";
import type { projectModel } from "#ui/rules/architecture-model/projection.ts";

type Projection = ReturnType<typeof projectModel>;

/**
 * Selection holds canonical identities independently from navigation and layout.
 * @param projection The current visible lines and their authored relationships.
 * @returns The selection and immediate pointer, keyboard, and clearing actions.
 */
function useModelSelection(projection: Projection) {
	const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
	const clear = useCallback((): void => setIds(new Set()), []);
	const selectMany = useCallback(
		(subjects: readonly string[], toggle = false): void => {
			const authored = subjects.flatMap((id) => {
				const connection = projection.connections.find(({ line }) => line.id === id);
				return connection === undefined ? [id] : connection.joins.map((edge) => edge.id);
			});
			setIds((current) => selectedAfter(current, authored, toggle));
		},
		[projection.connections],
	);
	const select = useCallback(
		(id: string | null, toggle = false): void => {
			selectMany(id === null ? [] : [id], toggle);
		},
		[selectMany],
	);

	return { ids, select, selectMany, clear };
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
export { useModelSelection, type ModelSelection };
