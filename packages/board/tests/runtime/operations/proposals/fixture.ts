import { readArchitectureModel, readArchitectureClaims } from "@archboard/board/store-read";
import {
	claimArchitectureSubjects,
	releaseArchitectureClaim,
	editArchitectureModule,
} from "@archboard/board/store-write";
import type { ArchitectureModuleEdit } from "@archboard/board/model";
function stepIds(
	steps: Extract<
		Awaited<ReturnType<typeof readArchitectureModel>>,
		{ success: true }
	>["collections"][number]["flows"][number]["steps"],
): string[] {
	return steps.flatMap((step) => [
		step.id,
		...(step.kind === "loop"
			? stepIds(step.steps)
			: step.kind === "decision"
				? step.alternatives.flatMap((alt) => stepIds(alt.steps))
				: []),
	]);
}
async function request(vault: string, state = "Current") {
	const model = readArchitectureModel(vault);
	if (!model.success) throw new Error(JSON.stringify(model));
	const claims = readArchitectureClaims(vault);
	if (!claims.success) throw new Error(JSON.stringify(claims));
	for (const claim of claims.claims)
		await releaseArchitectureClaim(vault, { claim: claim.id, writer: claim.writer });
	const target = { model: model.manifest.id, state };
	const scopes = [
		model.manifest.id,
		...model.modules.map((m) => m.id),
		...model.relationships.map((e) => e.id),
		...model.walkthroughs.flatMap((walk) => [walk.id, ...walk.beats.map((beat) => beat.id)]),
		...model.collections.flatMap((collection) => [
			`${model.manifest.id}#${collection.id}`,
			...collection.flows.flatMap((flow) => [flow.id, ...stepIds(flow.steps)]),
		]),
		...model.proposals.flatMap((p) => [p.id, ...p.changes.map((change) => change.subject)]),
	];
	const claim = await claimArchitectureSubjects(vault, {
		target,
		writer: "agent",
		reason: "reconciling family",
		subjects: [...new Set(scopes)],
	});
	if (!claim.success) throw new Error(JSON.stringify(claim));
	return {
		target,
		writer: "agent",
		doing: "reconciling family",
		claim: claim.claim.id,
		operationId: crypto.randomUUID(),
		expectedRevision: model.revision,
	};
}
async function selected(vault: string, state: string) {
	const model = await readArchitectureModel(vault, undefined, undefined, { state, compare: false });
	if (!model.success) throw new Error(JSON.stringify(model));
	return model;
}
async function proposal(
	vault: string,
	name: string,
	state = "Current",
	changes: Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"] = [],
) {
	const result = await editArchitectureModule(vault, {
		...(await request(vault, state)),
		proposal: { type: "create", name },
		changes,
	});
	if (!result.success || result.target.state === null) throw new Error(JSON.stringify(result));
	return result;
}

export { request, selected, proposal };
