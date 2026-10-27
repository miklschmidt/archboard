import { expect, test } from "bun:test";
import { join } from "node:path";
import { readArchitectureModel } from "@archboard/board/store-read";
import {
	claimArchitectureSubjects,
	editArchitectureModule,
	releaseArchitectureClaim,
} from "@archboard/board/store-write";
import { captureCanonicalWalkthrough } from "../support/canonical-walkthrough.ts";
import { startOwnedServer } from "../support/owned-server.ts";
import {
	browserTestRoots,
	createAgentBrowser,
	pollUntil,
	registerServerBase,
	serverTestEnvironment,
} from "./support/agent-browser.ts";
import { serverPath } from "./support/navigator-support.ts";

const WAIT = { timeoutMs: 10_000 } as const;

async function revise(vault: string, state?: string) {
	const model = await readArchitectureModel(
		vault,
		undefined,
		undefined,
		state === undefined ? {} : { state },
	);
	if (!model.success || model.selectedState === null) throw new Error(JSON.stringify(model));
	const target = { model: "Shop", state: model.selectedState.id };
	const writer = "walkthrough-fixture";
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer,
		reason: "Refine the proposed narrative",
		subjects: ["Shop", target.state, "Shop#Tour", "Shop#Outside", "Shop#Inside"],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	try {
		const result = await editArchitectureModule(vault, {
			target,
			writer,
			claim: claim.claim.id,
			doing: "Refine the proposed narrative",
			expectedRevision: model.revision,
			operationId: crypto.randomUUID(),
			proposal:
				state === undefined ? { type: "create", name: "Narrated proposal" } : { type: "edit" },
			changes: [
				{
					type: "edit-walkthrough",
					subject: "Shop#Tour",
					beats: model.walkthroughs
						.find((walkthrough) => walkthrough.id === "Shop#Tour")!
						.beats.map((beat) => ({
							...beat,
							title:
								beat.id === "Shop#Outside"
									? state === undefined
										? "The proposed services"
										: "Revised proposal"
									: beat.title,
						})),
				},
			],
		});
		if (!result.success || result.target.state === null) throw new Error(JSON.stringify(result));
		return result;
	} finally {
		await releaseArchitectureClaim(vault, { writer, claim: claim.claim.id });
	}
}

test("a live proposal update preserves its open walkthrough until explicit restart", async () => {
	await using resources = new AsyncDisposableStack();
	const { vault } = await captureCanonicalWalkthrough(
		join(browserTestRoots().ownerRoot, "proposal-walkthrough"),
	);
	const created = await revise(vault);
	const server = await startOwnedServer({ serverPath, vault, env: serverTestEnvironment() });
	resources.defer(() => server.dispose());
	registerServerBase(server.base);
	const browser = resources.use(await createAgentBrowser());
	await browser.run([
		"open",
		`${server.base}/?modelA=Shop&stateA=${encodeURIComponent(created.target.state!)}`,
	]);
	await browser.run(["set", "viewport", "1920", "1080"]);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-walkthrough-selector"]') !== null`,
			),
		Boolean,
		"the proposed narrative",
		WAIT,
	);
	await browser.run(["click", '[data-slot="model-walkthrough-selector"]']);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`(() => { const choice = document.querySelector('[data-walkthrough-id="Shop#Tour"]'); return choice !== null && choice.getBoundingClientRect().height > 0; })()`,
			),
		Boolean,
		"the proposed walkthrough choice",
		WAIT,
	);
	await browser.run(["click", '[data-walkthrough-id="Shop#Tour"]']);
	const heading = () =>
		browser.eval<string | null>(
			`document.querySelector('[data-slot="semantic-presentation-heading"]')?.textContent ?? null`,
		);
	await pollUntil(
		heading,
		(text) => text === "The proposed services",
		"the first captured proposal beat",
		WAIT,
	);
	const revision = await browser.eval<string>(
		`document.querySelector('[data-slot="model-walkthrough"]').getAttribute('data-revision')`,
	);
	await browser.run(["click", '[data-slot="semantic-presentation-next"]']);
	await pollUntil(heading, (text) => text === "The handler", "the second captured beat", WAIT);
	await revise(vault, created.target.state!);
	await pollUntil(
		() =>
			browser.eval<boolean>(
				`document.querySelector('[data-slot="model-walkthrough-restart"]') !== null`,
			),
		Boolean,
		"the changed proposal to offer restart",
		WAIT,
	);
	expect(await heading()).toBe("The handler");
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-walkthrough"]').getAttribute('data-revision')`,
		),
	).toBe(revision);
	await browser.run(["click", '[data-slot="model-walkthrough-restart"]']);
	await pollUntil(
		heading,
		(text) => text === "Revised proposal",
		"the deliberately restarted narrative",
		WAIT,
	);
	expect(
		await browser.eval<string>(
			`document.querySelector('[data-slot="model-walkthrough"]').getAttribute('data-revision')`,
		),
	).not.toBe(revision);
}, 60_000);
