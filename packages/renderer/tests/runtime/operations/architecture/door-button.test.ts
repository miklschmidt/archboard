import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { themeColor } from "#runtime/store/theme/source.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { groupOf } from "#tests/runtime/support/drawn-subjects.ts";
import { projectModel, type Model } from "@archboard/board/content";
import { PaletteColorSchema, SemanticPolicySchema } from "@archboard/board/policy";

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		service: { name: "Service", icon: "RiServerLine", color: "blue" },
		store: { name: "Store", icon: "RiDatabase2Line", color: "pink" },
		plain: { name: "Plain", icon: "RiBox3Line" },
	},
	relationshipKinds: {
		call: { name: "Request", color: "rose", dash: "solid", arrowhead: "filled" },
	},
	groups: { core: { name: "Core", color: "teal" } },
});

/**
 * One module of the reading.
 * @param id Its identity, which is also its name.
 * @param kind Its kind.
 * @param parent What holds it.
 * @param extra Anything more that it says.
 * @returns The module.
 */
function module(id: string, kind: string, parent: string, extra = {}) {
	return { id, name: id, kind, order: 0, parent, ...extra };
}

const doors = ["stored", "grouped", "added", "removed", "uncoloured"];
const model = {
	modules: [
		{ id: "top", name: "top", kind: "service", order: 0 },
		module("open", "service", "top"),
		module("part", "service", "open"),
		module("stored", "store", "top"),
		module("grouped", "store", "top", { groups: ["core"] }),
		module("added", "service", "top"),
		module("removed", "service", "top"),
		module("uncoloured", "plain", "top"),
		...doors.map((id) => module(`inside ${id}`, "plain", id)),
	],
	relationships: doors.map((to, order) => ({
		id: to,
		from: "part",
		to,
		kind: "call",
		order,
		emphasis: "normal",
	})),
	collections: [],
} as unknown as Model;

/**
 * What a picture draws for one door.
 * @param svg The picture.
 * @param id The door's module.
 * @returns Its markup.
 */
function door(svg: string, id: string): string {
	const drawn = groupOf(svg, "node", id);
	if (drawn === undefined) throw new Error(`No door ${id} is drawn.`);
	return drawn.markup;
}

test("a door takes its group's colour, or else its kind's, in a picture that stays intact", async () => {
	const { content } = projectModel(model, "open");
	const standing = { added: "added", removed: "removed" } as const;
	const drawing = await renderArchitecture({ content, policy, standing });
	expectDrawingIntact(drawing, content, "blocks");
	const face = (id: string) => /url\(#ab-door-([a-z]+)\)/u.exec(door(drawing.svg, id))?.[1];
	expect(doors.map(face)).toEqual(["pink", "teal", "blue", undefined, "neutral"]);
});

test("a door's colours are the bright values of the dark theme, on both themes", () => {
	for (const color of PaletteColorSchema.options) {
		for (const theme of ["light", "dark"] as const) {
			expect(themeColor(theme, `--bright-${color}`)).toBe(
				themeColor("dark", `--semantic-${color}`),
			);
		}
	}
});
