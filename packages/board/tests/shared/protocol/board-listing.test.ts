import { describe, expect, test } from "bun:test";
import { BoardListingSchema, listedBoard } from "#shared/protocol/board-listing.ts";
import { DrillDownSchema } from "#shared/schemas/content.ts";
import { parseSemanticBoard } from "#shared/rules/coherence/parse-board.ts";
import { type SemanticBoard } from "#shared/schemas/board-document.ts";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

// What the listing route reports about one board, and that the browser's parse
// of the listing keeps all of it. The navigator's outline is derived from
// these links in the browser, so the rules here are what it can rely on: the
// links of the variant a bare name opens, whether each sits on a container,
// and each once.

type Variant = {
	id: string;
	lifecycle: "current" | "draft" | "historical" | "shelved";
	parent?: string;
	summary?: string;
	nodes?: Record<string, unknown>[];
};

/**
 * A coherent board holding the stated variants.
 * @param variants The variants.
 * @param current The designated variant, if any.
 * @returns The board.
 */
function board(variants: Variant[], current?: string): SemanticBoard {
	const parsed = parseSemanticBoard(
		withFixtureOrders({
			schemaVersion: "2.4.0",
			kind: "semantic-board",
			id: "bd1",
			name: "Archboard server",
			level: "service",
			version: 3,
			createdAt: "2026-09-20T00:00:00.000Z",
			updatedAt: "2026-09-23T00:00:00.000Z",
			views: [],
			...(current === undefined ? {} : { current }),
			variants: variants.map(({ nodes, ...variant }) => ({
				name: `Name ${variant.id}`,
				...variant,
				content: { nodes: nodes ?? [], edges: [] },
			})),
		}),
	);
	if (!parsed.ok) throw new Error(parsed.problem);
	return parsed.board;
}

/**
 * A node carrying a drill-down.
 * @param id Its id.
 * @param name Its name.
 * @param target The board it opens, and the named variant when not the current one.
 * @param parent The node containing it, if any.
 * @param repo The repository whose vault holds the board, when it is not this one's.
 * @returns The node.
 */
function drilling(
	id: string,
	name: string,
	target: readonly [board: string, variant?: string],
	parent?: string,
	repo?: string,
): Record<string, unknown> {
	const [to, variant] = target;
	return {
		id,
		name,
		kind: "service",
		...(parent === undefined ? {} : { parent }),
		drillDown: {
			board: to,
			variant: variant === undefined ? { kind: "current" } : { kind: "named", name: variant },
			...(repo === undefined ? {} : { repo }),
		},
	};
}

const LOCATION = { name: "Archboard server", key: "archboard server" };

describe("a listed board's links", () => {
	test("are the opened variant's drill-downs, each once, marked when on a container, never to itself", () => {
		const listed = listedBoard(LOCATION, {
			ok: true,
			board: board(
				[
					{
						id: "v1",
						lifecycle: "current",
						nodes: [
							drilling("n1", "Archboard", ["Archboard"]),
							{ id: "n2", name: "Routes", kind: "module", parent: "n1" },
							drilling("n3", "Store", ["semantic-board-store", "Queued"], "n1"),
							drilling("n4", "Store", ["semantic-board-store", "Queued"]),
							drilling("n5", "Itself", ["archboard SERVER"]),
						],
					},
					{ id: "v2", lifecycle: "draft", parent: "v1", nodes: [drilling("n6", "Other", ["x"])] },
				],
				"v1",
			),
		});
		expect(listed.links).toEqual([
			{ board: "Archboard", variant: null, node: "Archboard", container: true },
			{ board: "semantic-board-store", variant: "Queued", node: "Store", container: false },
		]);
	});

	test("into another repository say so, keep the name the link spells, and are never a link back to the board itself", () => {
		const listed = listedBoard(
			LOCATION,
			{
				ok: true,
				board: board(
					[
						{
							id: "v1",
							lifecycle: "current",
							nodes: [
								// The same name as a board of this vault, and not that board.
								drilling(
									"n1",
									"Elsewhere",
									["Archboard server"],
									undefined,
									"github.com/acme/other",
								),
								drilling("n2", "Former", ["old name"], undefined, "github.com/acme/other"),
								drilling("n3", "Here", ["old name"]),
							],
						},
					],
					"v1",
				),
			},
			// This vault knows the board once called "old name"; the other vault is not asked.
			(name) => (name === "old name" ? "new name" : name),
		);
		expect(listed.links).toEqual([
			{
				board: "Archboard server",
				variant: null,
				repo: "github.com/acme/other",
				node: "Elsewhere",
				container: false,
			},
			{
				board: "old name",
				variant: null,
				repo: "github.com/acme/other",
				node: "Former",
				container: false,
			},
			{ board: "new name", variant: null, node: "Here", container: false },
		]);
	});

	test("into the vault's own repository are links within the vault", () => {
		const own = "github.com/acme/archboard";
		const listed = listedBoard(
			LOCATION,
			{
				ok: true,
				board: board(
					[
						{
							id: "v1",
							lifecycle: "current",
							nodes: [
								drilling("n1", "Former", ["old name"], undefined, own),
								drilling("n2", "Itself", ["Archboard server"], undefined, own),
							],
						},
					],
					"v1",
				),
			},
			(name) => (name === "old name" ? "new name" : name),
			own,
		);
		expect(listed.links).toEqual([
			{ board: "new name", variant: null, node: "Former", container: false },
		]);
	});

	test("on a board nobody has built are its root draft's, and none when no single variant opens", () => {
		const draft: Variant = {
			id: "v1",
			lifecycle: "draft",
			nodes: [drilling("n1", "API", ["api"])],
		};
		const planned = listedBoard(LOCATION, { ok: true, board: board([draft]) });
		expect(planned.opens).toBe("v1");
		expect(planned.links.map((link) => link.board)).toEqual(["api"]);

		const undecided = listedBoard(LOCATION, {
			ok: true,
			board: board([draft, { id: "v2", lifecycle: "draft", nodes: [drilling("n2", "B", ["b"])] }]),
		});
		expect(undecided).toMatchObject({ opens: null, links: [], description: null });
	});
});

/**
 * What the listing says for a current variant with this summary.
 * @param summary The summary, if any.
 * @returns The listed description.
 */
const described = (summary?: string) =>
	listedBoard(LOCATION, {
		ok: true,
		board: board([{ id: "v1", lifecycle: "current", ...(summary ? { summary } : {}) }], "v1"),
	}).description;

describe("a listed board's description", () => {
	test("is the summary's first sentence on one line, bounded, or null", () => {
		expect(described("Serves   boards\nto panes. Owns every write.")).toBe(
			"Serves boards to panes.",
		);
		expect(described("Serves v1.2 boards without a stop")).toBe(
			"Serves v1.2 boards without a stop",
		);
		expect(described()).toBeNull();
		const long = described(`${"word ".repeat(80)}end.`) ?? "";
		expect(long.length).toBeLessThanOrEqual(160);
		expect(long.endsWith("word…")).toBe(true);
	});

	test("is cut between whole characters when nothing breaks it into words", () => {
		const emoji = described("🚀".repeat(200)) ?? "";
		expect(emoji.length).toBeLessThanOrEqual(160);
		// Iterating by code point yields half a rocket as a character of its own.
		const [ellipsis, ...rockets] = [...emoji].toReversed();
		expect(ellipsis).toBe("…");
		expect(rockets.length).toBeGreaterThan(0);
		expect(rockets.every((character) => character === "🚀")).toBe(true);
	});
});

test("an unreadable board lists with its error and nothing it would have said", () => {
	expect(listedBoard(LOCATION, { ok: false, problem: "not json" })).toEqual({
		...LOCATION,
		variants: [],
		opens: null,
		links: [],
		description: null,
		error: "not json",
	});
});

test("the browser's parse of the listing keeps the levels, the links, the description and updatedAt", () => {
	const listing = {
		success: true as const,
		levels: ["system", "service", "module"],
		boards: [
			listedBoard(LOCATION, {
				ok: true,
				board: board(
					[
						{
							id: "v1",
							lifecycle: "current",
							summary: "Serves boards.",
							nodes: [drilling("n1", "Archboard", ["Archboard"])],
						},
					],
					"v1",
				),
			}),
			listedBoard({ name: "broken", key: "broken" }, { ok: false, problem: "not json" }),
		],
	};
	const wire: unknown = JSON.parse(JSON.stringify(listing));
	expect(BoardListingSchema.parse(wire)).toEqual(listing);
	expect(listing.boards[0]).toMatchObject({
		updatedAt: "2026-09-23T00:00:00.000Z",
		description: "Serves boards.",
		links: [{ board: "Archboard" }],
	});
});

/**
 * Whether the schema takes a drill-down that names this repository.
 * @param repo The repository, or none.
 * @returns True when it parses.
 */
function opensRepository(repo?: string): boolean {
	return DrillDownSchema.safeParse({
		board: "B",
		variant: { kind: "current" },
		...(repo === undefined ? {} : { repo }),
	}).success;
}

describe("a drill-down's repository", () => {
	test("is optional, and is an identity and never a path", () => {
		expect(opensRepository()).toBe(true);
		expect(opensRepository("github.com/acme/payments")).toBe(true);
		for (const path of [
			"/home/me/payments",
			"~/payments",
			"./payments",
			"../payments",
			"C:\\x",
			"a\\b",
		]) {
			expect(opensRepository(path)).toBe(false);
		}
	});
});
