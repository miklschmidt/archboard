// What a copy of the archboard skill needs beyond its authored files, and the
// one function that supplies it: generated JSON Schemas for the persisted
// board document, the vault configuration and the two authoring payloads, and
// an installation-local copy of the installation manual. Used by the skill sync, by the
// installer's staging step, and by the checkout for its own copy.

export {
	GENERATED_DIRECTORY,
	INSTALL_DOCUMENT,
	prepareSkillArtifacts,
	type PreparationSource,
	type PreparedSkill,
} from "@/runtime/skill-distribution/lib/prepare";
export { generatedSchemas, type GeneratedSchema } from "@/runtime/skill-distribution/lib/schemas";
