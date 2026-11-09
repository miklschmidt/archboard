// Which changed modules the footprint gate fails on. The system owner reads the real command.

import { expect, test } from "bun:test";
import { outsideDraft } from "#cli/commands/model/rules/outside-draft.ts";

const repo = "github.com/acme/shop";
const part = (path: string, other = repo) => ({ repo: other, path });

test("a container of a changed module passes, and a changed module with nothing inside it fails", () => {
	const libs = part("libs");
	const workspace = part("libs/workspace/");
	const installation = part("libs/workspace/src/installation.ts");
	const vault = part(".archboard/vault");
	const named = part("libs/cli/src/init.ts");
	expect(
		outsideDraft(
			[libs, workspace, installation, vault],
			[named, libs, workspace, installation, vault],
		),
	).toEqual([installation, vault]);
});

test("a directory holds only bindings of its own repository, and a root binding holds every one", () => {
	const directory = part("src");
	const elsewhere = part("src/gateway.ts", "github.com/acme/billing");
	expect(outsideDraft([directory], [directory, elsewhere])).toEqual([directory]);
	const root = part("");
	expect(outsideDraft([root], [root, part("src/gateway.ts")])).toEqual([]);
	expect(outsideDraft([root], [root])).toEqual([root]);
});

test("equivalent binding path spellings preserve directory containment", () => {
	for (const path of ["./src/", "src//", "src/.", "src\\"]) {
		const directory = part(path);
		const child = part("./src/gateway.ts");
		expect(outsideDraft([directory], [directory, child])).toEqual([]);
	}
});

test("two bindings of one directory hold neither one", () => {
	const directory = part("src");
	const same = part("src/");
	expect(outsideDraft([directory, same], [directory, same])).toEqual([directory, same]);
});

test("a project file holds the files of its project directory", () => {
	const project = part("App/App.csproj");
	expect(outsideDraft([project], [project, part("App/Orders/Order.cs")])).toEqual([]);
	expect(outsideDraft([project], [project, part("Other/Order.cs")])).toEqual([project]);
});
