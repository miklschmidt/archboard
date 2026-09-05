// How server news meets local edits. Every merge here reads the baseline
// (`changes.ts`): an element the person has changed since this pane last agreed
// it with the server is theirs, and no incoming element overwrites it.

import { baselineFrom, fingerprint, type Baseline } from "@/ui/canvas/changes";
import type {
	BaselineUpdate,
	ChangeReportingState,
	ReportCorrections,
	SceneElement,
} from "@/ui/canvas/lib/reporting-state";

/**
 * Whether one scene element differs from what the baseline agreed.
 * @param state The reporting state.
 * @param element A live element.
 * @param withheld Ids under an open editor.
 * @param present Collects ids that count toward the baseline.
 * @returns True when the element carries an unreported edit.
 */
function elementIsPending(
	state: ChangeReportingState,
	element: SceneElement,
	withheld: ReadonlySet<string>,
	present: Set<string>,
): boolean {
	if (withheld.has(element.id)) {
		if (state.baseline.has(element.id)) {
			present.add(element.id);
		}
		return false;
	}
	if (state.baseline.get(element.id) !== fingerprint(element)) {
		return true;
	}
	present.add(element.id);
	return false;
}

/**
 * Whether the scene holds anything the server has not been told.
 * @param state The reporting state.
 * @param scene The live scene.
 * @param withheldIds Ids under an open editor, which never count as pending.
 * @returns True when an element differs from, or is missing from, the baseline.
 */
function hasPendingEdits(
	state: ChangeReportingState,
	scene: readonly SceneElement[],
	withheldIds: readonly string[] = [],
): boolean {
	if (!state.userInteracted) {
		return false;
	}
	if (state.fullReportNeeded) {
		return true;
	}
	return scenePending(state, scene, new Set(withheldIds));
}

/**
 * Whether any live element differs from the baseline, or the baseline holds
 * an id the scene has lost.
 * @param state The reporting state.
 * @param scene The live scene.
 * @param withheld Ids under an open editor.
 * @returns True when an unreported edit or deletion exists.
 */
function scenePending(
	state: ChangeReportingState,
	scene: readonly SceneElement[],
	withheld: ReadonlySet<string>,
): boolean {
	const present = new Set<string>();
	for (const element of scene) {
		if (element.isDeleted === true) {
			continue;
		}
		if (elementIsPending(state, element, withheld, present)) {
			return true;
		}
	}
	return present.size !== state.baseline.size;
}

/**
 * The withheld elements a server scene must carry over, because the report it
 * answers could not have named them.
 * @param scene The live scene.
 * @param answered Ids the server's scene already carries.
 * @param withheldIds Ids under an open editor.
 * @returns The withheld elements absent from the answer.
 */
function carryWithheld(
	scene: readonly SceneElement[],
	answered: ReadonlySet<string>,
	withheldIds: readonly string[],
): SceneElement[] {
	if (withheldIds.length === 0) {
		return [];
	}
	const withheld = new Set(withheldIds);
	return scene.filter((element) => withheld.has(element.id) && !answered.has(element.id));
}

/**
 * Whether a local element may be replaced by an incoming one.
 * @param element The live element.
 * @param baseline The agreed baseline, when merging respects it.
 * @returns True when the element is as the server last agreed it.
 */
function replaceable(element: SceneElement, baseline: Baseline | undefined): boolean {
	if (baseline === undefined) {
		return true;
	}
	const agreed = baseline.get(element.id);
	return agreed !== undefined && fingerprint(element) === agreed;
}

/**
 * Fold incoming server elements into the scene, leaving locally dirty ids alone.
 * @param scene The live scene.
 * @param incoming The server's elements.
 * @param baseline The agreed baseline; absent to trust every incoming element.
 * @returns The merged scene and which ids the server touched.
 */
function mergeIncoming(
	scene: readonly SceneElement[],
	incoming: readonly SceneElement[],
	baseline?: Baseline,
): { elements: SceneElement[]; touchedIds: string[] } {
	const byId = new Map<string, SceneElement>();
	for (const element of incoming) {
		if (element.id.length > 0) {
			byId.set(element.id, element);
		}
	}
	const touchedIds = [...byId.keys()];
	const elements = scene.map((element) => {
		const update = byId.get(element.id);
		if (!update) {
			return element;
		}
		byId.delete(element.id);
		return replaceable(element, baseline) ? { ...element, ...update } : element;
	});
	for (const [id, element] of byId) {
		// Missing from the visible scene but present in the agreed baseline means
		// the person deleted it locally after that baseline. Keep it absent and
		// pending. An id the baseline never held is a true remote addition.
		if (baseline === undefined || !baseline.has(id)) {
			elements.push(element);
		}
	}
	return { elements, touchedIds };
}

/**
 * Remove deleted ids from the scene, keeping any the person has edited since.
 * @param scene The live scene.
 * @param deletedIds What the server deleted.
 * @param baseline The agreed baseline.
 * @returns The scene without the agreed-and-deleted elements.
 */
function mergeIncomingDeletes(
	scene: readonly SceneElement[],
	deletedIds: readonly string[],
	baseline: Baseline,
): SceneElement[] {
	const deleted = new Set(deletedIds);
	return scene.filter((element) => {
		if (!deleted.has(element.id)) {
			return true;
		}
		const agreed = baseline.get(element.id);
		return agreed !== undefined && fingerprint(element) !== agreed;
	});
}

/**
 * Move the baseline the way an applied server update says.
 * @param baseline The current baseline.
 * @param update How the update moves it.
 * @param scene The scene after the update.
 * @returns The next baseline.
 */
function applyBaselineUpdate(
	baseline: Baseline,
	update: BaselineUpdate,
	scene: readonly SceneElement[],
): Baseline {
	if (update.type === "none") {
		return baseline;
	}
	if (update.type === "replace") {
		const withheld = new Set(update.withheldIds);
		return baselineFrom(scene.filter((element) => !withheld.has(element.id)));
	}
	const next = new Map(baseline);
	if (update.type === "delete") {
		for (const id of update.ids) {
			next.delete(id);
		}
		return next;
	}
	for (const element of update.elements) {
		next.set(element.id, fingerprint(element));
	}
	return next;
}

/**
 * The baseline after the server's corrections to an accepted report.
 * @param submitted The baseline the report would have established.
 * @param corrections What the server changed on the way in.
 * @returns The corrected baseline.
 */
function baselineAfterCorrections(submitted: Baseline, corrections: ReportCorrections): Baseline {
	const next = new Map(submitted);
	for (const id of corrections.deletes) {
		next.delete(id);
	}
	for (const element of corrections.upserts) {
		if (element.isDeleted !== true) {
			next.set(element.id, fingerprint(element));
		}
	}
	return next;
}

/**
 * Whether a visible element is still what the report sent.
 * @param visible The element on screen, if any.
 * @param sent Its fingerprint as sent, if it was sent.
 * @returns True when nothing changed locally since the send.
 */
function unchangedSinceSend(visible: SceneElement | undefined, sent: string | undefined): boolean {
	if (sent === undefined) {
		return visible === undefined;
	}
	return visible !== undefined && fingerprint(visible) === sent;
}

/**
 * Apply the server's deletions to a scene, per id, only where nothing changed since the send.
 * @param byId The scene by id, mutated.
 * @param submitted The fingerprints as sent.
 * @param deletes The ids the server deleted.
 * @returns Whether anything changed.
 */
function applyCorrectionDeletes(
	byId: Map<string, SceneElement>,
	submitted: Baseline,
	deletes: readonly string[],
): boolean {
	let changed = false;
	for (const id of deletes) {
		const visible = byId.get(id);
		if (visible !== undefined && unchangedSinceSend(visible, submitted.get(id))) {
			byId.delete(id);
			changed = true;
		}
	}
	return changed;
}

/**
 * Apply the server's upserts to a scene, per id, only where nothing changed since the send.
 * @param byId The scene by id, mutated.
 * @param submitted The fingerprints as sent.
 * @param upserts The canonical elements.
 * @returns Whether anything changed.
 */
function applyCorrectionUpserts(
	byId: Map<string, SceneElement>,
	submitted: Baseline,
	upserts: readonly SceneElement[],
): boolean {
	let changed = false;
	for (const canonical of upserts) {
		const visible = byId.get(canonical.id);
		if (!unchangedSinceSend(visible, submitted.get(canonical.id))) {
			continue;
		}
		if (visible !== undefined && fingerprint(visible) === fingerprint(canonical)) {
			continue;
		}
		byId.set(canonical.id, canonical);
		changed = true;
	}
	return changed;
}

/**
 * The scene with the server's corrections applied where they are still fresh.
 * @param scene The live scene.
 * @param submitted The fingerprints as sent.
 * @param corrections What the server changed.
 * @returns The corrected scene, or null when nothing needed correcting.
 */
function applyVisibleCorrections(
	scene: readonly SceneElement[],
	submitted: Baseline,
	corrections: ReportCorrections,
): SceneElement[] | null {
	const byId = new Map(scene.map((element) => [element.id, element]));
	const deleted = applyCorrectionDeletes(byId, submitted, corrections.deletes);
	const upserted = applyCorrectionUpserts(byId, submitted, corrections.upserts);
	return deleted || upserted ? [...byId.values()] : null;
}

export {
	applyBaselineUpdate,
	applyVisibleCorrections,
	baselineAfterCorrections,
	carryWithheld,
	hasPendingEdits,
	mergeIncoming,
	mergeIncomingDeletes,
};
