import type { ArchitectureModuleEdit } from "#shared/schemas/model-operations.ts";

/**
 * Preserve legacy description records while newer operations retain their affected closure.
 * @param request The original signed intent.
 * @param subjects The retained affected identities.
 * @returns The complete recorded subjects, or the legacy subject.
 */
function operationSubjects(
	request: ArchitectureModuleEdit | { target: unknown },
	subjects?: string[],
): string[] {
	if (subjects !== undefined) return subjects;
	return "subject" in request ? [request.subject] : [];
}
export { operationSubjects };
