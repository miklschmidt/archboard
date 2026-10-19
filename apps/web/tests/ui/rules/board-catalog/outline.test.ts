import { expect, test } from "bun:test";

import {
	boardAncestors,
	buildOutline,
	pathIds,
	type OutlineBoard,
	type OutlineNode,
} from "#ui/rules/board-catalog/outline.ts";

const LEVELS = ["system", "service", "module"] as const;

/**
 * A board for the outline.
 * @param name Its name.
 * @param level Its level.
 * @param links The boards it links to, `^name` for a container link.
 * @returns The board.
 */
function board(name: string, level: string | null, ...links: string[]): OutlineBoard {
	return {
		name,
		level,
		links: links.map((link) =>
			link.startsWith("^")
				? { board: link.slice(1), container: true }
				: { board: link, container: false },
		),
	};
}

/**
 * The outline as indented lines: folders end in `/`, other parents follow `+`.
 * @param nodes The outline.
 * @param depth How deep these nodes are.
 * @returns The lines.
 */
function shape(nodes: readonly OutlineNode<OutlineBoard>[], depth = 0): string[] {
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
			board("Archboard", "system", "Archboard server", "Browser application", "Board persistence"),
			board("Archboard server", "service", "Board persistence", "Semantic renderer", "Archboard"),
			board("Browser application", "service", "^Archboard", "Semantic renderer"),
			board("Board persistence", "module"),
			board("Semantic renderer", "module", "Renderer layout"),
			board("Renderer layout", "module", "Semantic renderer"),
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
			board("Platform Cluster", "system"),
			board("Auditlog 10", "service"),
			board("Auditlog 9", "service"),
			board("Cloud Infrastructure", "system", "Platform Cluster"),
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
			board("platform/Cluster", "system", "platform/Ingress", "billing/Ledger"),
			board("platform/Ingress", "service"),
			board("platform/edge/Gateway", "service"),
			board("billing/Ledger", "service"),
			board("Overview", "system", "billing/Ledger"),
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
		[board("Beta", "service", "^Alpha"), board("Alpha", "service", "^Beta")],
		LEVELS,
	);
	expect(shape(outline)).toEqual(["Alpha +Beta", "  Beta"]);
});

test("a board with an unconfigured level only nests by container links", () => {
	const outline = buildOutline(
		[board("Top", "system", "Odd"), board("Odd", "zone"), board("Inner", "zone", "^Odd")],
		LEVELS,
	);
	expect(shape(outline)).toEqual(["Odd", "  Inner", "Top"]);
});

test("ancestors and path ids lead to a board through folders and parents", () => {
	const outline = buildOutline(
		[
			board("platform/Cluster", "system", "platform/Ingress"),
			board("platform/Ingress", "service", "platform/Routes"),
			board("platform/Routes", "module"),
		],
		LEVELS,
	);
	expect(boardAncestors(outline, "PLATFORM/routes").map((node) => node.name)).toEqual([
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
		[board("Platform", "system", "^Payments"), board("Payments", "service")],
		LEVELS,
	);
	expect(shape(outline)).toEqual(["Platform", "  Payments"]);
});

test("folders spelled in two cases are one folder", () => {
	const outline = buildOutline([board("Payments/a", null), board("payments/b", null)], LEVELS);
	expect(shape(outline)).toEqual(["Payments/ 2", "  a", "  b"]);
});

test("a link that names a repository places no board of this vault under its parent", () => {
	const outline = buildOutline(
		[
			{
				name: "Meta",
				level: "system",
				links: [{ board: "Payments", repo: "github.com/acme/payments", container: false }],
			},
			board("Payments", "service"),
		],
		LEVELS,
	);
	expect(shape(outline)).toEqual(["Meta", "Payments"]);
});
