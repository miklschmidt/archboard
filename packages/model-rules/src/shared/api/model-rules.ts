// The model rules: what a reader draws and compares, shared by the browser and
// the backend so both read one model the same way (ADR 0068). They read the
// contract's types and hold no schema.

export {
	modelContent,
	projectModel,
	type Model,
	type ModelFilters,
	type ModelFlow,
} from "#shared/rules/model-projection.ts";
export { projectFlow } from "#shared/rules/model-flow-projection.ts";
export { moduleForest } from "#shared/rules/module-fold.ts";
export { doorEndpoints } from "#shared/rules/door-endpoints.ts";
export { describeSubject, edgeSubjects, nodeSubject } from "#shared/rules/subject.ts";
export { comparedWith, compareVariants } from "#shared/compare/rules/drawing.ts";
export {
	changeOf,
	type ChangeKind,
	type FieldChange,
	type VariantComparison,
} from "#shared/compare/rules/variants.ts";
export {
	inspectContainer,
	type Caller,
	type ContainerInspection,
} from "#shared/inspect/rules/container-interface.ts";
export { inspectGroups } from "#shared/inspect/rules/groups.ts";
export { mintId } from "#shared/rules/ids.ts";
export { sameSemanticValue } from "#shared/rules/semantic-value.ts";
export {
	containersOf,
	overviewLines,
	scopedContent,
	type ReadingScope,
} from "#shared/rules/scope.ts";
