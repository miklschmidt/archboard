// A picture draws a type's icon as the icon package itself renders it, and the
// renderer core writes that markup from path data its host supplies rather
// than bundling the set (TASK-247). These hold the two ends: the path data a
// host serves is every icon's own, and the markup written from it is the
// component's markup.

import { describe, expect, test } from "bun:test";
import * as RemixIcons from "@remixicon/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import {
	diagramIconNames,
	diagramIconPaths,
	renderArchitecture,
} from "@/runtime/semantic-renderer/index";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";

const components = new Map(Object.entries(RemixIcons));

/**
 * What the package's own component renders for an icon.
 * @param name The icon's export name.
 * @param ink Its fill.
 * @returns The markup.
 */
function componentMarkup(name: string, ink: string): string {
	const component = components.get(name);
	if (component === undefined) throw new Error(`The icon package has no ${name}`);
	return renderToStaticMarkup(
		createElement(component, { size: 18, color: ink, "aria-hidden": true }),
	);
}

describe("type icons", () => {
	test("the path data served for every icon is the paths its component draws", () => {
		const names = diagramIconNames();
		expect(names.length).toBeGreaterThan(1000);
		for (const name of names) {
			const drawn = [...componentMarkup(name, "#000").matchAll(/ d="([^"]*)"/g)].map(
				(match) => match[1] ?? "",
			);
			expect(diagramIconPaths(name) ?? [], name).toEqual(drawn);
		}
		expect(diagramIconPaths("RiNoSuchIconLine")).toBeUndefined();
	});

	test("a card draws its type's icon exactly as the component renders it", async () => {
		const icons = ["RiServerLine", "RiShipFill", "RiDatabase2Line"];
		const policy = SemanticPolicySchema.parse({
			levels: ["service"],
			nodeKinds: Object.fromEntries(
				icons.map((icon, index) => [`kind${index}`, { name: icon, icon, color: "blue" }]),
			),
			relationshipKinds: {
				call: { name: "Request", color: "rose", dash: "solid", arrowhead: "filled" },
			},
		});
		const content = VariantContentSchema.parse({
			nodes: icons.map((icon, index) => ({ id: `n${index}`, name: icon, kind: `kind${index}` })),
		});
		const drawing = await renderArchitecture({ content, theme: "light", policy });
		for (const [index, icon] of icons.entries()) {
			const card = groupOf(drawing.svg, "node", `n${index}`)!.markup;
			const glyph = new RegExp(`data-type-icon="${icon}">(<svg[^]*?</svg>)`).exec(card);
			const ink = /<svg[^>]* fill="([^"]*)"/.exec(glyph?.[1] ?? "")?.[1] ?? "";
			expect(glyph?.[1]).toBe(componentMarkup(icon, ink));
		}
	});
});
