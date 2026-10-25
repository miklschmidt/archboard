import { TEST_TOOLS } from "#tests/runtime/support/toolset.ts";
import { expect, test } from "bun:test";
import { readyDelegatedWorkhorse } from "#server/services/sessions/checkouts.ts";

function ended(): never {
	throw new Error("The tab session is not live, so it can start no workhorse.");
}

function call(tool: string, args: unknown) {
	return { params: { namespace: TEST_TOOLS.workhorse.namespace.name, tool, arguments: args } } as never;
}

const checkoutNamedBy = (named: string) =>
	named === "linked-project" || named === "/work/project" ? "/work/project" : null;

test("a delegation starts the workhorse of the checkout it names, and nothing else starts one", async () => {
	const root = "/not-admitted";
	const linked = "linked-project";
	const repository = "/work/project";
	const started: string[] = [];
	const workhorseOf = (named: string) => ({
		actions: {
			ensureStarted: async () => {
				started.push(named);
				if (named === "fails") throw new Error("The workhorse could not start.");
			},
		},
	});

	await readyDelegatedWorkhorse(
		call("delegate_to_workhorse", { checkout: linked }),
		TEST_TOOLS,
		workhorseOf,
		checkoutNamedBy,
	);
	expect(started).toEqual([repository]);

	await readyDelegatedWorkhorse(
		call("inspect_workhorse", { checkout: repository }),
		TEST_TOOLS,
		workhorseOf,
		checkoutNamedBy,
	);
	await readyDelegatedWorkhorse(
		call("delegate_to_workhorse", { checkout: root }),
		TEST_TOOLS,
		workhorseOf,
		checkoutNamedBy,
	);
	await readyDelegatedWorkhorse(call("delegate_to_workhorse", {}), TEST_TOOLS, workhorseOf, checkoutNamedBy);
	await readyDelegatedWorkhorse(call("stop_workhorses", {}), TEST_TOOLS, workhorseOf, checkoutNamedBy);
	expect(started).toEqual([repository]);

	// A start that fails leaves the delegation itself to answer.
	const failing = () => workhorseOf("fails");
	expect(
		await readyDelegatedWorkhorse(
			call("delegate_to_workhorse", { checkout: repository }),
			TEST_TOOLS,
			failing,
			checkoutNamedBy,
		),
	).toBeUndefined();
	// So does a tab session that can build no workhorse any more, because its tab has gone.
	expect(
		await readyDelegatedWorkhorse(
			call("delegate_to_workhorse", { checkout: repository }),
			TEST_TOOLS,
			ended,
			checkoutNamedBy,
		),
	).toBeUndefined();
});

const admitIndependentCheckout = (named: string) =>
	named === "allowed" ? "/independent/project" : null;

test("the supplied host admits a checkout without a vault and refuses every other checkout", async () => {
	const starts: string[] = [];
	const workhorseOf = (admittedCheckout: string) => ({
		actions: {
			ensureStarted: async () => {
				starts.push(admittedCheckout);
			},
		},
	});
	await readyDelegatedWorkhorse(
		call("delegate_to_workhorse", { checkout: "allowed" }),
		TEST_TOOLS,
		workhorseOf,
		admitIndependentCheckout,
	);
	await readyDelegatedWorkhorse(
		call("delegate_to_workhorse", { checkout: "/not-admitted" }),
		TEST_TOOLS,
		workhorseOf,
		admitIndependentCheckout,
	);
	expect(starts).toEqual(["/independent/project"]);
});
