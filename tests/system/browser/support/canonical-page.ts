import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mintId } from "@archboard/board/ids";
import type { Model, VariantContent } from "@archboard/board/content";
import { readArchitectureModel } from "@archboard/board/store-read";

type Node = Pick<
	Model["modules"][number],
	"name" | "kind" | "responsibility" | "parent" | "binding"
>;
type Edge = Pick<Model["relationships"][number], "from" | "to" | "kind" | "label">;
type Narrative = VariantContent["walkthroughs"][number];
interface Scene {
	readonly nodes: readonly Node[];
	readonly edges?: readonly Edge[];
	readonly walkthroughs?: readonly (Pick<Narrative, "name"> & {
		readonly beats: readonly Pick<Narrative["beats"][number], "heading" | "body">[];
	})[];
}

const SMALL_PIPELINE: Scene = {
	nodes: [
		{ name: "Ingest", kind: "service", responsibility: "Takes the feed" },
		{ name: "Warehouse", kind: "datastore", responsibility: "Keeps the rows" },
	],
	edges: [{ from: "Ingest", to: "Warehouse", kind: "data", label: "rows" }],
};

/** Arrange authored files for a visible workflow, then read them through the public model interface. */
async function seedCanonicalModel(vault: string, name: string, scene: Scene = SMALL_PIPELINE) {
	if (existsSync(join(vault, "model.json")))
		throw new Error("This fixture already contains a canonical model.");
	const id = mintId();
	const ids = new Map(scene.nodes.map((node) => [node.name, `${id}#${mintId()}`]));
	const subject = (label: string): string => {
		const found = ids.get(label);
		if (found === undefined) throw new Error(`The fixture names an unavailable module: ${label}`);
		return found;
	};
	writeFileSync(
		join(vault, "model.json"),
		JSON.stringify({ schemaVersion: 1, id, name, current: { id: "Current", name: "Implemented" } }),
	);
	scene.nodes.forEach(({ parent, ...node }, index) => {
		const outgoing = (scene.edges ?? [])
			.filter((edge) => edge.from === node.name)
			.map(({ from: _from, to, ...edge }, order) => ({
				...edge,
				id: `${id}#${mintId()}`,
				to: subject(to),
				order,
				emphasis: "normal",
			}));
		writeFileSync(
			join(vault, `module-${index}.module.json`),
			JSON.stringify({
				...node,
				schemaVersion: 1,
				id: subject(node.name),
				order: index,
				...(parent === undefined ? {} : { parent: subject(parent) }),
				outgoing,
			}),
		);
	});
	for (const [index, narrative] of (scene.walkthroughs ?? []).entries()) {
		writeFileSync(
			join(vault, `tour-${index}.walkthrough.json`),
			JSON.stringify({
				schemaVersion: 1,
				id: `${id}#${mintId()}`,
				name: narrative.name,
				target: { state: "current" },
				beats: narrative.beats.map((beat) => ({
					id: `${id}#${mintId()}`,
					title: beat.heading,
					narrative: beat.body,
					reading: { grammar: "architecture", selection: [] },
				})),
			}),
		);
	}
	const model = await readArchitectureModel(vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	return model;
}

const MODEL_STAGE = '[data-slot="architecture-model-stage"]';

/** Address the canonical model in the first pane without invoking a legacy board route. */
function modelAddress(base: string, model: Model): string {
	return `${base}/?modelA=${model.manifest.id}`;
}

/** Wait on the visible drawing rather than on the metadata read alone. */
async function modelDrawn(evaluate: <T>(expression: string) => Promise<T>): Promise<boolean> {
	return evaluate<boolean>(
		`document.querySelector('${MODEL_STAGE} [data-slot="model-diagram"] svg') !== null`,
	);
}

export { seedCanonicalModel, modelAddress, modelDrawn, MODEL_STAGE };
