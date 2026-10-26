// A composite puts its parts on a root of the package's own (TASK-529.03). What this catches: a
// composite assembled over a library's own export, which writes the parts onto that export for
// every other importer of the library.

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { expect, test } from "bun:test";

import { Select } from "#ui/api/components.ts";

test("the select's parts leave Base UI's own root as it is", () => {
	expect(Select.Item).toBeDefined();
	expect(Object.keys(SelectPrimitive.Root)).toEqual([]);
});
