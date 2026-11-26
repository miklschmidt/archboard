// A vault's configuration, the check of a vault against its policy, and the subject a diagnostic names.

export { namesInfrastructure } from "#runtime/check/operations/containment.ts";
export {
	type NestedBlockSelector,
	type ParsedTerraformAddress,
	declarationAddress,
	decodeHclString,
	parseTerraformAddress,
	splitAddressSegments,
} from "#runtime/check/operations/terraform-address.ts";
export { edgeSubjects, nodeSubject } from "#runtime/check/operations/subject.ts";
export { structureDiagnostics } from "#runtime/check/operations/structure.ts";
export { readVaultConfiguration, vaultConfigurationSchema } from "#runtime/store/configuration.ts";
