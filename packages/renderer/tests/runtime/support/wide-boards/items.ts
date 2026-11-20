// What measure.ts and timing.ts draw: each `*.content.json` fixture beside this file, then
// readings of this repository's canonical model in `.archboard/vault`: the whole model and each
// module that holds parts, in the current state and, when asked, in every proposal.
import fs from "node:fs";
import path from "node:path";
import {
	defaultSemanticPolicy,
	type SemanticPolicy,
	type VariantContent,
} from "@archboard/model-contract";
import { projectModel, type Model } from "@archboard/model-rules";
import { readArchitectureModel } from "@archboard/model-store";
import { orderedFixture } from "../ordered-fixture.ts";

/** One architecture picture to draw: a reading of a state, or a fixture. */
interface Item {
	readonly name: string;
	/** `fixture`, or the state's name, starred for the current state. */
	readonly variant: string;
	readonly content: VariantContent;
	/** The vault's policy, which names the groups the reading draws; a fixture has none of its own. */
	readonly policy: SemanticPolicy;
}

const vault = ".archboard/vault";

/**
 * The fixtures beside this file.
 * @returns Their items, by file name.
 */
function fixtureItems(): Item[] {
	return fs
		.readdirSync(import.meta.dir)
		.filter((name) => name.endsWith(".content.json"))
		.toSorted()
		.map((file) => ({
			name: file.replace(".content.json", ""),
			variant: "fixture",
			// A fixture authored before subjects carried an order is given one by position.
			content: orderedFixture(
				JSON.parse(fs.readFileSync(path.join(import.meta.dir, file), "utf8")),
			),
			policy: defaultSemanticPolicy(),
		}));
}

/**
 * Each architecture reading of one state: the whole model, then each module that holds parts.
 * @param model The state.
 * @param variant The state's label.
 * @returns Its items.
 */
function readingItems(model: Model, variant: string): Item[] {
	const scopes = model.modules.filter((module) =>
		model.modules.some((child) => child.parent === module.id),
	);
	return [{ id: null, name: "(whole model)" }, ...scopes].flatMap((scope) => {
		const { content } = projectModel(model, scope.id, null, {});
		return content.nodes.length === 0
			? []
			: [{ name: scope.name, variant, content, policy: model.policy }];
	});
}

/**
 * The fixtures, then the readings of the vault's current state and, with `every`, of each
 * proposal. A read never writes, so the vault is never touched.
 * @param every Whether every proposal is drawn beside the current state.
 * @returns The items.
 * @throws {Error} When the vault's current state does not read.
 */
async function wideBoardItems(every: boolean): Promise<Item[]> {
	const current = await readArchitectureModel(vault);
	if (!current.success) throw new Error(`${vault} does not read: ${JSON.stringify(current)}`);
	const proposals = every ? current.proposals.map((proposal) => proposal.id) : [];
	const states = await Promise.all(
		proposals.map((state) => readArchitectureModel(vault, undefined, undefined, { state })),
	);
	return [
		...fixtureItems(),
		...readingItems(current, "*current"),
		...states.flatMap((state) =>
			state.success ? readingItems(state, state.selectedState?.name ?? "proposal") : [],
		),
	];
}

export { wideBoardItems, type Item };
