// What a container exposes to its callers, and how two such interfaces compare.
export { compareInterfaces } from "#shared/rules/compare/interfaces.ts";
export type { InterfaceChange } from "#shared/rules/compare/interfaces.ts";
export {
	inspectContainer,
	interfaceMeasures,
	passThroughEntryPoints,
} from "#shared/rules/inspect/container-interface.ts";
export type { Caller } from "#shared/rules/inspect/container-interface.ts";
