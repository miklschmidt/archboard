// A same-directory source selects a header's grammar, and both files keep
// the header's cached facts fresh (TASK-436.07).

import { expect, test } from "bun:test";
import { createCodeFacts } from "#runtime/services/code-facts/reader.ts";
import { fixtureCheckout } from "#tests/runtime/support/code-facts/checkout.ts";

test("a C-only Objective-C header follows its paired .m, and an Objective-C forward declaration does not override a paired C++ source", async () => {
	const checkout = fixtureCheckout({
		"Money.h": "int money(void);\n",
		"Money.m": "int money(void) { return 1; }\n",
		"Engine.h": "#ifdef __OBJC__\n@class View;\n#endif\nclass Engine {};\n",
		"Engine.cpp": '#include "Engine.h"\n',
		"Plain.h": "int plain(void);\n",
		"Plain.c": "int plain(void) { return 1; }\n",
		"Unpaired.h": "@interface Unpaired\n@end\n",
	});
	try {
		const pass = createCodeFacts().pass(new AbortController().signal);
		const [money, engine, plain, unpaired] = await Promise.all(
			["Money.h", "Engine.h", "Plain.h", "Unpaired.h"].map((file) => pass.read(checkout, file)),
		);
		expect(money?.adapter).toBe("objc");
		expect(engine?.adapter).toBe("cpp");
		expect(engine?.adapter !== "text" && engine?.definitions.map((each) => each.symbol)).toContain(
			"Engine",
		);
		expect(plain?.adapter).toBe("c");
		// The unpaired heuristic continues to read Objective-C through the .h entry.
		expect(
			unpaired?.adapter !== "text" && unpaired?.definitions.map((each) => each.symbol),
		).toContain("Unpaired");
	} finally {
		checkout.remove();
	}
});

test("editing either member of a header pair reparses its cached facts", async () => {
	const checkout = fixtureCheckout({
		"Money.h": "int money(void);\n",
		"Money.m": "int money(void) { return 1; }\n",
	});
	try {
		const facts = createCodeFacts();
		/** Read only the header in a fresh pass of the same cache. */
		const run = async () => {
			const pass = facts.pass(new AbortController().signal);
			const read = await pass.read(checkout, "Money.h");
			return { read, stats: { ...pass.stats } };
		};
		expect((await run()).stats).toMatchObject({ parsed: 1, cached: 0 });
		expect((await run()).stats).toMatchObject({ parsed: 0, cached: 1 });
		checkout.write("Money.m", "int money(void) { return 2; }\n");
		expect((await run()).stats).toMatchObject({ parsed: 1, cached: 0 });
		checkout.write("Money.h", "int money(void);\nint added(void);\n");
		const edited = await run();
		expect(edited.stats).toMatchObject({ parsed: 1, cached: 0 });
		expect(
			edited.read?.adapter !== "text" && edited.read?.definitions.map((each) => each.symbol),
		).toEqual(["money", "added"]);
	} finally {
		checkout.remove();
	}
});
