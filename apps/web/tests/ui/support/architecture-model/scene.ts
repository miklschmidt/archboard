import { projectModel, type Model } from "@archboard/board/content";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import type { SceneReading, SceneRequest } from "#ui/rules/architecture-model/scene.ts";

const MODULES = [
	["Shop#Gateway", undefined],
	["Shop#Handler", "Shop#Gateway"],
	["Shop#Decode", "Shop#Handler"],
	["Shop#Worker", undefined],
	["Shop#Queue", "Shop#Worker"],
] as const;

/** Two branches: a gateway two levels deep and a worker one level deep. */
const SHOP: Model = {
	success: true,
	roots: ["Shop#Gateway", "Shop#Worker"],
	proposals: [],
	manifest: {
		schemaVersion: 1,
		id: "Shop",
		name: "Shop",
		current: { id: "Current", name: "Implemented" },
	},
	selectedState: { id: "Current", name: "Implemented", lifecycle: "current" },
	revision: { digest: "a".repeat(64), files: [] },
	policy: DEFAULT_SEMANTIC_POLICY,
	modules: MODULES.map(([id, parent], order) => ({
		schemaVersion: 1,
		id,
		name: id.slice("Shop#".length),
		kind: "module",
		order,
		file: `${id}.module.json`,
		outgoing: [],
		...(parent === undefined ? {} : { parent }),
	})),
	relationships: [],
	collections: [],
	walkthroughs: [],
};

/**
 * A reading of the shop.
 * @param overrides The fields that differ from the whole model.
 * @returns The address fields.
 */
function shopReading(overrides: Partial<SceneReading> = {}): SceneReading {
	return {
		scope: null,
		focus: null,
		expand: [],
		filters: { hideKinds: [] },
		grammar: "architecture",
		flow: null,
		subject: null,
		state: null,
		checkpoint: null,
		against: null,
		...overrides,
	};
}

/**
 * A destination in the shop.
 * @param overrides The fields that differ from the whole model.
 * @param settled Whether the model answers this address.
 * @returns The request.
 */
function shopRequest(overrides: Partial<SceneReading> = {}, settled = true): SceneRequest {
	const reading = shopReading(overrides);
	return {
		model: SHOP,
		projection: projectModel(SHOP, reading.scope, null, reading.filters),
		reading,
		grammar: "architecture",
		settled,
	};
}

export { SHOP, shopReading, shopRequest };
