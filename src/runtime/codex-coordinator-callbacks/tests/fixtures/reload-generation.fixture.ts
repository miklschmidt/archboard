import {
	installCodexCoordinatorCallbacks,
	type CoordinatorCallbackOptions,
	type CoordinatorCallbacks,
	type CoordinatorCallbacksRetainedState,
} from "../../index.js";
import { kept } from "../../../engine/hot.js";

export interface CallbackReloadFixtureRecord {
	readonly options: CoordinatorCallbackOptions;
	readonly retained: CoordinatorCallbacksRetainedState;
	readonly evaluations: string[];
	readonly instances: CoordinatorCallbacks[];
}

export interface CallbackReloadFixtureModule {
	readonly evaluationIdentity: symbol;
	readonly instance: CoordinatorCallbacks | null;
}

const query = new URL(import.meta.url).searchParams;
const key = query.get("key");
const generation = query.get("generation");

function configuredRecord(): CallbackReloadFixtureRecord | null {
	if (key === null || generation === null) return null;
	return kept<CallbackReloadFixtureRecord>(key, () => {
		throw new Error("Reload fixture record must exist before module evaluation.");
	});
}

const record = configuredRecord();
if (record !== null && generation !== null) record.evaluations.push(generation);

export const evaluationIdentity = Symbol(generation ?? "unconfigured");
export const instance =
	record === null ? null : installCodexCoordinatorCallbacks(record.retained, record.options);
if (record !== null && instance !== null) record.instances.push(instance);
