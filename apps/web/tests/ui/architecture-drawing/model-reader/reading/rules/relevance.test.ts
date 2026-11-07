import { expect, test } from "bun:test";
import { projectModel, type Model } from "@archboard/model/content";
import { contextOf } from "#ui/architecture-drawing/model-reader/reading/rules/relevance.ts";
import { SHOP } from "#tests/ui/support/model-reader/scene.ts";

/**
 * A flow of one message.
 * @param id Its identity.
 * @param from Where the message starts.
 * @param to Where it ends.
 * @returns The flow.
 */
function flow(id: string, from: string, to: string): Model["collections"][number]["flows"][number] {
	return {
		id,
		name: id,
		participants: [from, to],
		steps: [{ id: `${id}/step`, from, to, kind: "sync", label: "Ask" }],
	};
}

/**
 * A walkthrough of one beat that selects one subject.
 * @param id Its identity.
 * @param subject The subject.
 * @returns The walkthrough.
 */
function tour(id: string, subject: string): Model["walkthroughs"][number] {
	return {
		schemaVersion: 1,
		id,
		name: id,
		target: { state: "Current" },
		file: `${id}.walkthrough.json`,
		beats: [
			{
				id: `${id}/beat`,
				title: id,
				narrative: id,
				reading: {
					selection: [subject],
					focus: [],
					filters: { relationships: [], groups: [] },
					grammar: "architecture",
				},
			},
		],
	};
}

/** A flow and a walkthrough on each branch, and a relationship that joins the two. */
const MODEL: Model = {
	...SHOP,
	relationships: [
		{
			id: "Shop#Line",
			from: "Shop#Decode",
			to: "Shop#Queue",
			order: 0,
			kind: "call",
			emphasis: "normal",
		},
	],
	collections: [
		{
			schemaVersion: 1,
			id: "Behavior",
			name: "Behavior",
			file: "behavior.flows.json",
			flows: [
				flow("Shop#Parse", "Shop#Handler", "Shop#Decode"),
				flow("Shop#Drain", "Shop#Worker", "Shop#Queue"),
			],
		},
	],
	walkthroughs: [tour("Shop#Inside", "Shop#Decode"), tour("Shop#Behind", "Shop#Queue")],
};

const { depicted } = projectModel(MODEL);

/**
 * What the right column lists.
 * @param scope The open module.
 * @param selected The selected subjects.
 * @returns The identities of each list.
 */
function listed(scope: string | null, ...selected: readonly string[]) {
	const { flows, walkthroughs } = contextOf(MODEL, depicted, scope, new Set(selected));
	return { flows: flows.map(({ id }) => id), walkthroughs: walkthroughs.map(({ id }) => id) };
}

test("the roots list nothing, because the left column holds it all", () => {
	expect(listed(null)).toEqual({ flows: [], walkthroughs: [] });
});

test("the open module lists what touches it or anything inside it", () => {
	expect(listed("Shop#Gateway")).toEqual({ flows: ["Shop#Parse"], walkthroughs: ["Shop#Inside"] });
});

test("a selection decides over the open module", () => {
	expect(listed("Shop#Gateway", "Shop#Worker")).toEqual({
		flows: ["Shop#Drain"],
		walkthroughs: ["Shop#Behind"],
	});
});

test("a relationship reaches its two ends, and a step reaches the participants of its flow", () => {
	const both = {
		flows: ["Shop#Parse", "Shop#Drain"],
		walkthroughs: ["Shop#Inside", "Shop#Behind"],
	};
	expect(listed(null, "Shop#Line")).toEqual(both);
	expect(listed(null, "Shop#Drain/step")).toEqual({
		flows: ["Shop#Drain"],
		walkthroughs: ["Shop#Behind"],
	});
});
