// The model store: the coherent reader and the durable writer of a vault's
// architecture model. Every operation names its vault, reads or writes it
// whole, and answers its result or a structured refusal.

export { readArchitectureModel } from "#runtime/canonical/read/operations/model-read.ts";
export { watchArchitectureModel } from "#runtime/canonical/read/operations/model-watch.ts";
export { readModuleNavigation } from "#runtime/canonical/read/operations/module-navigation.ts";
export { readRetainedModule } from "#runtime/canonical/history/retained-reading/operations/retained-module.ts";
export {
	editArchitectureModule,
	recoverArchitectureModel,
} from "#runtime/canonical/edit/operations/edit.ts";
export { installArchitectureModel } from "#runtime/canonical/history/operations/install.ts";
export { exportArchitectureModel } from "#runtime/canonical/history/operations/portable.ts";
export { initializeArchitectureArchive } from "#runtime/canonical/history/operations/initialize.ts";
export { migrateArchitectureModel } from "#runtime/legacy-boards/reading/inventory/operations/apply.ts";
export { readLegacyInventory } from "#runtime/legacy-boards/reading/inventory/operations/inventory.ts";
export { saveLegacyMappingPlan } from "#runtime/legacy-boards/reading/inventory/operations/save-plan.ts";
export {
	changeArchitectureClaims,
	readArchitectureClaims,
} from "#runtime/canonical/edit/operations/claims.ts";
export {
	changeArchitecturePublication,
	readArchitecturePublication,
} from "#runtime/canonical/history/operations/publication.ts";
export { retainArchitectureCheckpoint } from "#runtime/canonical/history/operations/retain.ts";
export { listArchitectureCheckpoints } from "#runtime/canonical/history/retained-reading/operations/read.ts";
export { checkArchitectureVault } from "#runtime/check/operations/vault-check.ts";
export { forgetModelMemory } from "#runtime/store/memory.ts";
