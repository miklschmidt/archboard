// What a container exposes to its callers, with its five measures, how two such interfaces compare, and the entry points that only pass one call on.
export { compareInterfaces } from "#shared/rules/compare/interfaces.ts";
export {
	inspectContainer,
	passThroughEntryPoints,
} from "#shared/rules/inspect/container-interface.ts";
