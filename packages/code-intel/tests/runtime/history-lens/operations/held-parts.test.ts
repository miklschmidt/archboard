// Which other changed parts each changed part holds. The gate of `model footprint --fail-outside`
// and the pull-request Action both read it; the CLI system test reads the real command.

import { expect, test } from "bun:test";
import { withHeld } from "#runtime/history-lens/operations/held-parts.ts";
import type { FootprintPart } from "#shared/protocol/footprint.ts";

const repo = "github.com/acme/shop";

/**
 * A changed part, as the footprint lists it.
 * @param id Its identity.
 * @param path Its binding path.
 * @param other Its repository.
 * @returns The part.
 */
function part(id: string, path: string, other = repo): FootprintPart {
	return {
		subject: { kind: "node", id, name: id },
		repo: other,
		path,
		commits: ["c1"],
		named: [],
		holds: [],
	};
}

/**
 * What each part holds.
 * @param parts The changed parts.
 * @returns Each part's id with the ids it holds.
 */
function held(...parts: FootprintPart[]): Record<string, string[]> {
	return Object.fromEntries(withHeld(parts).map((one) => [one.subject.id, one.holds]));
}

test("a directory holds each changed part below it, however deep, and a file holds none", () => {
	expect(
		held(
			part("libs", "libs"),
			part("workspace", "libs/workspace/"),
			part("installation", "libs/workspace/src/installation.ts"),
			part("vault", ".archboard/vault"),
		),
	).toEqual({
		libs: ["workspace", "installation"],
		workspace: ["installation"],
		installation: [],
		vault: [],
	});
});

test("a directory holds only parts of its own repository, and a root binding holds every one", () => {
	expect(
		held(part("src", "src"), part("billing", "src/gateway.ts", "github.com/acme/billing")),
	).toEqual({ src: [], billing: [] });
	expect(held(part("root", ""), part("gateway", "src/gateway.ts"))).toEqual({
		root: ["gateway"],
		gateway: [],
	});
});

test("equivalent spellings of a directory hold the same parts", () => {
	for (const path of ["./src/", "src//", "src/.", "src\\"]) {
		expect(held(part("src", path), part("gateway", "./src/gateway.ts"))).toMatchObject({
			src: ["gateway"],
		});
	}
});

test("two bindings of one scope hold neither one", () => {
	for (const [left, right] of [
		["src", "src/"],
		["", "./"],
		["src/gateway.ts", "src/gateway.ts"],
		["App/App.csproj", "./App/App.csproj"],
		["App/App.csproj", "App/Other.csproj"],
		["App", "App/App.csproj"],
		["", "App.csproj"],
	] as const) {
		expect(held(part("left", left), part("right", right))).toEqual({ left: [], right: [] });
	}
});

test("a project file holds the parts of its project directory", () => {
	const project = part("app", "App/App.csproj");
	expect(held(project, part("order", "App/Orders/Order.cs"))).toMatchObject({ app: ["order"] });
	expect(held(project, part("orders", "App/Orders/Orders.csproj"))).toMatchObject({
		app: ["orders"],
	});
	expect(held(project, part("other", "Other/Order.cs"))).toMatchObject({ app: [] });
});
