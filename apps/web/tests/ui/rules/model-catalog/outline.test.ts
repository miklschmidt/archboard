import { expect, test } from "bun:test";

import {
	modelAncestors,
	buildOutline,
	pathIds,
	type OutlineModel,
	type OutlineNode,
} from "#ui/rules/model-catalog/outline.ts";

const LEVELS = ["system", "service", "module"] as const;

/**
 * A model for the outline.
 * @param name Its name.
 * @param level Its level.
 * @param links The models it links to, `^name` for a container link.
 * @returns The model.
 */
function model(name: string, level: string | null, ...links: string[]): OutlineModel {
	return {
		name,
		level,
		links: links.map((link) =>
			link.startsWith("^")
				? { model: link.slice(1), container: true }
				: { model: link, container: false },
		),
	};
}

/**
 * The outline as indented lines: folders end in `/`, other parents follow `+`.
 * @param nodes The outline.
 * @param depth How deep these nodes are.
 * @returns The lines.
 */
function shape(nodes: readonly OutlineNode<OutlineModel>[], depth = 0): string[] {
	return nodes.flatMap((node) => {
		const pad = "  ".repeat(depth);
		const line =
			node.kind === "folder"
				? `${pad}${node.name}/ ${node.count}`
				: `${pad}${node.label}${node.otherParents.length > 0 ? ` +${node.otherParents.join(",")}` : ""}`;
		return [line, ...shape(node.children, depth + 1)];
	});
}

test("a vault with drill links draws its hierarchy under the closest coarser parent", () => {
	const outline = buildOutline(
		[
			model("Archboard", "system", "Archboard server", "Browser application", "Board persistence"),
			model("Archboard server", "service", "Board persistence", "Semantic renderer", "Archboard"),
			model("Browser application", "service", "^Archboard", "Semantic renderer"),
			model("Board persistence", "module"),
			model("Semantic renderer", "module", "Renderer layout"),
			model("Renderer layout", "module", "Semantic renderer"),
		],
		LEVELS,
	);
	expect(shape(outline)).toEqual([
		"Archboard",
		"  Archboard server",
		"    Board persistence +Archboard",
		"    Semantic renderer +Browser application",
		"  Browser application",
		"Renderer layout",
	]);
});

test("a vault of independent boards is one level, by name, numbers in order", () => {
	const outline = buildOutline(
		[
			model("Platform Cluster", "system"),
			model("Auditlog 10", "service"),
			model("Auditlog 9", "service"),
			model("Cloud Infrastructure", "system", "Platform Cluster"),
		],
		LEVELS,
	);
	expect(shape(outline)).toEqual([
		"Auditlog 9",
		"Auditlog 10",
		"Cloud Infrastructure",
		"Platform Cluster",
	]);
});

test("folders come first, count their boards, and a link never crosses a folder", () => {
	const outline = buildOutline(
		[
			model("platform/Cluster", "system", "platform/Ingress", "billing/Ledger"),
			model("platform/Ingress", "service"),
			model("platform/edge/Gateway", "service"),
			model("billing/Ledger", "service"),
			model("Overview", "system", "billing/Ledger"),
		],
		LEVELS,
	);
	expect(shape(outline)).toEqual([
		"billing/ 1",
		"  Ledger",
		"platform/ 3",
		"  edge/ 1",
		"    Gateway",
		"  Cluster",
		"    Ingress",
		"Overview",
	]);
});

test("a cycle of container links roots the first board of the cycle by name", () => {
	const outline = buildOutline(
		[model("Beta", "service", "^Alpha"), model("Alpha", "service", "^Beta")],
		LEVELS,
	);
	expect(shape(outline)).toEqual(["Alpha +Beta", "  Beta"]);
});

test("a board with an unconfigured level only nests by container links", () => {
	const outline = buildOutline(
		[model("Top", "system", "Odd"), model("Odd", "zone"), model("Inner", "zone", "^Odd")],
		LEVELS,
	);
	expect(shape(outline)).toEqual(["Odd", "  Inner", "Top"]);
});

test("ancestors and path ids lead to a board through folders and parents", () => {
	const outline = buildOutline(
		[
			model("platform/Cluster", "system", "platform/Ingress"),
			model("platform/Ingress", "service", "platform/Routes"),
			model("platform/Routes", "module"),
		],
		LEVELS,
	);
	expect(modelAncestors(outline, "PLATFORM/routes").map((node) => node.name)).toEqual([
		"platform/Cluster",
		"platform/Ingress",
	]);
	expect(pathIds(outline, "platform/Routes")).toEqual([
		"folder:platform",
		"board:platform/cluster",
		"board:platform/ingress",
	]);
	expect(pathIds(outline, "missing")).toEqual([]);
});

test("a container link that runs down the levels places the linked board under the linker", () => {
	// Platform draws Payments as a container of its modules: Platform is still Payments' parent.
	const outline = buildOutline(
		[model("Platform", "system", "^Payments"), model("Payments", "service")],
		LEVELS,
	);
	expect(shape(outline)).toEqual(["Platform", "  Payments"]);
});

test("folders spelled in two cases are one folder", () => {
	const outline = buildOutline([model("Payments/a", null), model("payments/b", null)], LEVELS);
	expect(shape(outline)).toEqual(["Payments/ 2", "  a", "  b"]);
});

test("a link that names a repository places no board of this vault under its parent", () => {
	const outline = buildOutline(
		[
			{
				name: "Meta",
				level: "system",
				links: [{ model: "Payments", repo: "github.com/acme/payments", container: false }],
			},
			model("Payments", "service"),
		],
		LEVELS,
	);
	expect(shape(outline)).toEqual(["Meta", "Payments"]);
});
