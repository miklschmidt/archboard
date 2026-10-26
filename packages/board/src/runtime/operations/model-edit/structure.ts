import { isDeepStrictEqual } from "node:util";
import type { ArchitectureModel } from "#shared/schemas/model.ts";
import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";
import { mintId } from "#shared/rules/ids.ts";
import { selectModule } from "#runtime/operations/read/model-read.ts";
import { ArchiveError } from "#runtime/store/model-archive.ts";
import { includeContainment } from "#runtime/operations/model-edit/containment.ts";

type Module = ArchitectureModel["modules"][number];
type Relationship = Module["outgoing"][number];
type Change = Extract<ArchitectureModuleEdit, { changes: unknown }>["changes"][number];
type Structure = ReturnType<typeof openStructure>;

/**
 * Keep one in-memory candidate and its complete identity reservations.
 * @param model The coherent starting model.
 * @param paths The discovered authored paths.
 * @returns The private candidate state.
 */
function openStructure(model: ArchitectureModel, paths: Iterable<string>) {
	return {
		before: model,
		modules: structuredClone(model.modules),
		lookup: [...model.modules],
		used: new Set([
			...model.modules.map((module) => module.id),
			...model.relationships.map((edge) => edge.id),
			...(model.manifest.retiredIds ?? []),
		]),
		paths: new Set(paths),
		retired: new Set(model.manifest.retiredIds),
		subjects: new Set<string>(),
		edited: new Set<string>(),
		removedModules: new Set<string>(),
		removedRelationships: new Set<string>(),
		structural: false,
	};
}

/**
 * Resolve a reference through the same authority as public reads.
 * @param model The explicit model and state.
 * @param selector The identity or unique name.
 * @returns The qualified identity.
 */
function selectedId(model: ArchitectureModel, selector: string): string {
	const selected = selectModule(model, selector);
	if (selected.success) return selected.selectedModule!;
	const diagnostic = selected.diagnostics[0]!;
	throw new ArchiveError(selected.code, diagnostic.message, diagnostic.file, diagnostic.subjects);
}

/**
 * Find a candidate module using stable input references.
 * @param state The private candidate.
 * @param selector The caller's reference.
 * @returns The continuing module definition.
 */
function moduleOf(state: Structure, selector: string): Module {
	const id = selectedId({ ...state.before, modules: state.lookup }, selector);
	return state.modules.find((module) => module.id === id)!;
}

/**
 * Resolve an existing source-owned relationship.
 * @param state The private candidate.
 * @param id The qualified relationship identity.
 * @returns The source and its relationship.
 */
function relationshipOf(state: Structure, id: string) {
	const owner = state.modules.find((module) => module.outgoing.some((edge) => edge.id === id));
	if (owner === undefined)
		throw new ArchiveError(
			"RELATIONSHIP_NOT_FOUND",
			"Use an existing qualified relationship identity.",
			"model.json",
			[id],
		);
	return { owner, edge: owner.outgoing.find((edge) => edge.id === id)! };
}

/**
 * Allocate only through the existing identity authority.
 * @param state The private candidate.
 * @returns One qualified fresh identity.
 */
function freshIdentity(state: Structure): string {
	const local = mintId({
		/**
		 * Refuse live, retired and path-reserved identities.
		 * @param id The proposed local identity.
		 * @returns Whether the identity is unavailable.
		 */
		has(id) {
			return (
				state.used.has(`${state.before.manifest.id}#${id}`) || state.paths.has(`${id}.module.json`)
			);
		},
	});
	const id = `${state.before.manifest.id}#${local}`;
	state.used.add(id);
	return id;
}

/**
 * Reject conflicting instructions instead of depending on their order.
 * @param state The private candidate.
 * @param id The continuing subject.
 */
function requireSingleEdit(state: Structure, id: string): void {
	if (state.edited.has(id) || state.removedModules.has(id) || state.removedRelationships.has(id))
		throw new ArchiveError(
			"MODEL_INVALID",
			"State one edit per subject and do not edit a subject that this batch removes.",
			"model.json",
			[id],
		);
	state.edited.add(id);
}

/**
 * Assign schema-checked fields and explicitly clear optional fields.
 * @param value The continuing subject.
 * @param set The explicitly assigned values.
 * @param clear The optional fields to remove.
 */
function assignFields<T extends object>(
	value: T,
	set: object | undefined,
	clear: ReadonlyArray<keyof T> | undefined,
): void {
	const overlap = clear?.find((field) => set !== undefined && Object.hasOwn(set, field));
	if (overlap !== undefined)
		throw new ArchiveError(
			"MODEL_INVALID",
			`Field ${String(overlap)} is both assigned and cleared.`,
		);
	Object.assign(value, set);
	for (const field of clear ?? []) delete value[field];
}

/**
 * Add a module before resolving any batch references.
 * @param state The private candidate.
 * @param change The addition.
 */
function addModule(state: Structure, change: Extract<Change, { type: "add-module" }>): void {
	const id = freshIdentity(state);
	const module: Module = {
		...change.module,
		schemaVersion: 1,
		id,
		outgoing: [],
		file: `${id.split("#")[1]}.module.json`,
	};
	state.modules.push(module);
	state.lookup.push(module);
	state.subjects.add(id);
	state.structural = true;
}

/**
 * Plan removals against the original explicit state.
 * @param state The private candidate.
 * @param changes The complete batch.
 */
function planRemovals(state: Structure, changes: Change[]): void {
	for (const change of changes) {
		if (change.type === "remove-module")
			state.removedModules.add(selectedId(state.before, change.subject));
		if (change.type === "remove-relationship") {
			relationshipOf(state, change.subject);
			state.removedRelationships.add(change.subject);
		}
	}
}

/**
 * Retain identity and former names while editing one definition.
 * @param state The private candidate.
 * @param change The field operation.
 */
function editModule(state: Structure, change: Extract<Change, { type: "edit-module" }>): void {
	const module = moduleOf(state, change.subject);
	requireSingleEdit(state, module.id);
	const previous = module.name;
	assignFields(module, change.set, change.clear);
	if (module.name !== previous)
		module.formerNames = [...new Set([...(module.formerNames ?? []), previous])];
	state.subjects.add(module.id);
}

/**
 * Include a relationship and both endpoints in claims and news.
 * @param state The private candidate.
 * @param owner The source identity.
 * @param edge The relationship definition.
 */
function includeRelationship(state: Structure, owner: string, edge: Relationship): void {
	for (const id of [edge.id, owner, edge.to]) state.subjects.add(id);
}

/**
 * Add one outgoing relationship with its own stable identity.
 * @param state The private candidate.
 * @param change The addition.
 */
function addRelationship(
	state: Structure,
	change: Extract<Change, { type: "add-relationship" }>,
): void {
	const owner = moduleOf(state, change.source);
	const edge = {
		...change.relationship,
		id: freshIdentity(state),
		to: moduleOf(state, change.relationship.to).id,
	};
	owner.outgoing.push(edge);
	includeRelationship(state, owner.id, edge);
	state.structural = true;
}

/**
 * Transfer or edit the same relationship without replacing its identity.
 * @param state The private candidate.
 * @param change The source and field operation.
 */
function editRelationship(
	state: Structure,
	change: Extract<Change, { type: "edit-relationship" }>,
): void {
	const { owner, edge } = relationshipOf(state, change.subject);
	requireSingleEdit(state, edge.id);
	const source = moduleOf(state, change.source ?? owner.id);
	const target = moduleOf(state, change.set?.to ?? edge.to);
	includeRelationship(state, owner.id, edge);
	assignFields(edge, change.set, change.clear);
	edge.to = target.id;
	if (owner.id !== source.id) {
		owner.outgoing = owner.outgoing.filter((value) => value.id !== edge.id);
		source.outgoing.push(edge);
	}
	includeRelationship(state, source.id, edge);
}

/**
 * Apply field operations after all additions and removal plans exist.
 * @param state The private candidate.
 * @param change One batch statement.
 */
function applyChange(state: Structure, change: Change): void {
	switch (change.type) {
		case "edit-module":
			editModule(state, change);
			break;
		case "add-relationship":
			addRelationship(state, change);
			break;
		case "edit-relationship":
			editRelationship(state, change);
			break;
		default:
			break;
	}
}

/**
 * Remove incident references unless the batch explicitly preserves that relationship.
 * @param state The private candidate.
 * @param owner The current owner.
 * @param edge The continuing relationship.
 * @returns Whether the relationship survives.
 */
function keepRelationship(state: Structure, owner: Module, edge: Relationship): boolean {
	const incident = state.removedModules.has(owner.id) || state.removedModules.has(edge.to);
	if (!incident && !state.removedRelationships.has(edge.id)) return true;
	if (state.edited.has(edge.id))
		throw new ArchiveError(
			"MODEL_INVALID",
			"An edited relationship still names a removed endpoint.",
			owner.file,
			[edge.id],
		);
	includeRelationship(state, owner.id, edge);
	state.retired.add(edge.id);
	state.structural = true;
	return false;
}

/**
 * Repair references and refuse implicit orphan promotion.
 * @param state The private candidate.
 */
function finishRemovals(state: Structure): void {
	for (const module of state.modules)
		module.outgoing = module.outgoing.filter((edge) => keepRelationship(state, module, edge));
	for (const id of state.removedModules) {
		state.subjects.add(id);
		state.retired.add(id);
		state.structural = true;
	}
	state.modules = state.modules.filter((module) => !state.removedModules.has(module.id));
	for (const module of state.modules) resolveParent(state, module);
}

/**
 * Resolve a parent and refuse children of a removed container.
 * @param state The private candidate.
 * @param module The surviving definition.
 */
function resolveParent(state: Structure, module: Module): void {
	if (module.parent === undefined) return;
	const parent = selectedId({ ...state.before, modules: state.lookup }, module.parent);
	if (state.removedModules.has(parent))
		throw new ArchiveError(
			"NODE_HAS_CHILDREN",
			"Reparent or remove the remaining children in this batch.",
			module.file,
			[parent, module.id],
		);
	module.parent = parent;
}

/**
 * Read the structural statements behind legacy and batch requests.
 * @param request The original intent.
 * @returns The normalized statements.
 */
function statements(request: ArchitectureModuleEdit): Change[] {
	return "changes" in request
		? request.changes
		: [
				{
					type: "edit-module",
					subject: request.subject,
					set: { description: request.description },
				},
			];
}

/**
 * Preserve untouched manifest bytes unless identities retire.
 * @param state The complete candidate.
 * @returns The continuing manifest.
 */
function candidateManifest(state: Structure) {
	if (isDeepStrictEqual([...state.retired], state.before.manifest.retiredIds ?? []))
		return state.before.manifest;
	return { ...state.before.manifest, retiredIds: [...state.retired] };
}

/**
 * Produce one complete graph change behind the existing write interface.
 * @param model The coherent starting model.
 * @param request The original intent.
 * @param paths The recognized input paths.
 * @returns The candidate definitions and affected scopes.
 */
function applyStructure(
	model: ArchitectureModel,
	request: ArchitectureModuleEdit,
	paths: Iterable<string>,
) {
	const state = openStructure(model, paths);
	const changes = statements(request);
	for (const change of changes) if (change.type === "add-module") addModule(state, change);
	planRemovals(state, changes);
	for (const change of changes) applyChange(state, change);
	finishRemovals(state);
	includeContainment(model.modules, state.modules, state.subjects);
	const known = new Set([
		...model.modules.map((module) => module.id),
		...model.relationships.map((edge) => edge.id),
	]);
	const scopes = [...state.subjects].filter((id) => known.has(id));
	if (state.structural) scopes.push(model.manifest.id);
	const manifest = candidateManifest(state);
	return { modules: state.modules, manifest, subjects: [...state.subjects], scopes };
}
export { applyStructure };
