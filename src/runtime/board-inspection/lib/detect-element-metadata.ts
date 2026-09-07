import type { InspectionFinding, InspectionPolicy } from "@/runtime/board-inspection/schemas";
import {
	kindOf,
	stableDescription,
	type DecodedRecord,
} from "@/runtime/board-inspection/lib/decode";
import {
	archboardMetadata,
	libraryAttribution,
	type InspectionModel,
} from "@/runtime/board-inspection/lib/model";
import { make } from "@/runtime/board-inspection/lib/finding-builder";
import type { RawRecord } from "@/runtime/board-inspection/lib/connector-records";

/** The font families Excalidraw persists, and so the only ones a policy can allow. */
const PERSISTABLE_FONT_FAMILIES = [1, 2, 3, 5, 6, 7, 8] as const;

/** One of the font families a board may persist. */
type FontFamily = (typeof PERSISTABLE_FONT_FAMILIES)[number];

/** The font family a text element gets when it persists none. */
const LEGACY_FONT_FAMILY: FontFamily = 1;

/**
 * The finding for a node name that is not a nonempty string, which leaves the element claiming
 * membership of a node nothing can look up.
 * @param record the element
 * @param elementId the element's identity
 * @param node the raw node name
 * @returns the finding
 */
function invalidNodeMetadataFinding(
	record: DecodedRecord,
	elementId: string,
	node: unknown,
): InspectionFinding {
	return make({
		code: "BROKEN_REFERENCE",
		reason: "invalid-node-metadata",
		severity: "error",
		affectsCoverage: true,
		details: { elementId, valueKind: kindOf(node) },
		message: `Element ${elementId} has invalid node metadata.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * Whether a metadata node name is usable: a nonempty string naming one semantic node.
 * @param metadata the element's archboard metadata
 * @returns true when the name does not read
 */
function nodeNameBroken(metadata: Readonly<Record<string, unknown>>): boolean {
	if (!("node" in metadata)) {
		return false;
	}
	const node = metadata["node"];
	return typeof node !== "string" || node.length === 0;
}

/**
 * What is wrong with a code binding's own fields: it must be an object naming a
 * repository-relative path, with a repository name that is a string when it is there at all.
 * @param binding the raw binding value
 * @returns the issues, in the order a reader would find them
 */
function bindingIssues(binding: unknown): string[] {
	if (binding === null || typeof binding !== "object" || Array.isArray(binding)) {
		return ["binding must be an object"];
	}
	const fields: Record<string, unknown> = Object.fromEntries(Object.entries(binding));
	const issues = pathIssues(fields["path"]);
	if (fields["repo"] !== undefined && typeof fields["repo"] !== "string") {
		issues.push("repo must be a string");
	}
	return issues;
}

/**
 * What is wrong with a code binding's path: it must be a nonempty string, and it must stay
 * inside the repository it is relative to.
 * @param path the raw path
 * @returns the issues, in the order a reader would find them
 */
function pathIssues(path: unknown): string[] {
	if (typeof path !== "string") {
		return ["path must be a nonempty string"];
	}
	const issues = path === "" ? ["path must be a nonempty string"] : [];
	if (escapesRepository(path)) {
		issues.push("path must be repository-relative and usable");
	}
	return issues;
}

/**
 * Whether a path leaves the repository it is meant to be relative to.
 * @param path the path
 * @returns true when the path is absolute or climbs out
 */
function escapesRepository(path: string): boolean {
	return path.startsWith("/") || path.split("/").includes("..");
}

/**
 * The finding for a code binding that does not read, which is a binding nothing can follow to
 * the repository it claims.
 * @param record the element
 * @param elementId the element's identity
 * @param issues what is wrong with the binding
 * @returns the finding
 */
function invalidBindingFinding(
	record: DecodedRecord,
	elementId: string,
	issues: string[],
): InspectionFinding {
	return make({
		code: "BROKEN_REFERENCE",
		reason: "invalid-code-binding",
		severity: "error",
		affectsCoverage: false,
		details: { elementId, issues },
		message: `Element ${elementId} has an invalid code binding.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * The finding for a persisted binding link. A binding-derived link is a presentation overlay
 * put on copies and stripped at the write boundary, so a board holding one has kept something
 * the note is not supposed to own.
 * @param record the element
 * @param elementId the element's identity
 * @param link the persisted link
 * @returns the finding
 */
function derivedLinkFinding(
	record: DecodedRecord,
	elementId: string,
	link: string,
): InspectionFinding {
	return make({
		code: "BROKEN_REFERENCE",
		reason: "derived-link-persisted",
		severity: "error",
		affectsCoverage: false,
		details: { elementId, link },
		message: `Element ${elementId} persists a derived binding link.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	});
}

/**
 * Everything wrong with an element's archboard metadata: the node it claims membership of, the
 * code binding it carries, and any derived link it has persisted.
 * @param record the element
 * @param raw the element's raw fields
 * @returns the findings
 */
function metadataFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	const metadata = archboardMetadata(record);
	const elementId = record.id;
	if (elementId === null || metadata === null) {
		return [];
	}
	const findings = nodeNameBroken(metadata)
		? [invalidNodeMetadataFinding(record, elementId, metadata["node"])]
		: [];
	const binding = metadata["binding"];
	if (binding === undefined) {
		return findings;
	}
	return [...findings, ...codeBindingFindings(record, raw, elementId, binding)];
}

/**
 * What an element's code binding says: whether its own fields read, and whether the element has
 * persisted the presentation link the binding derives.
 * @param record the element
 * @param raw the element's raw fields
 * @param elementId the element's identity
 * @param binding the raw binding value
 * @returns the findings
 */
function codeBindingFindings(
	record: DecodedRecord,
	raw: RawRecord,
	elementId: string,
	binding: unknown,
): InspectionFinding[] {
	const issues = bindingIssues(binding);
	const findings = issues.length > 0 ? [invalidBindingFinding(record, elementId, issues)] : [];
	const link = raw["link"];
	if (typeof link !== "string" || link === "") {
		return findings;
	}
	return [...findings, derivedLinkFinding(record, elementId, link)];
}

/**
 * The point a font finding is drawn at: the middle of the text's own box, when it has one.
 * @param record the text element
 * @returns the point, or no points at all
 */
function textCentre(record: DecodedRecord): { x: number; y: number }[] {
	const box = record.box;
	if (box === null) {
		return [];
	}
	return [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }];
}

/**
 * Whether a persisted font family is one Excalidraw actually uses.
 * @param value the raw fontFamily
 * @returns true when the value is a persistable family
 */
function persistableFamily(value: unknown): value is FontFamily {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		return false;
	}
	return PERSISTABLE_FONT_FAMILIES.some((family) => family === value);
}

/**
 * The finding for a text element that persists no font family at all and so renders in the
 * legacy one, which the policy does not allow.
 * @param record the text element
 * @param allowed the families the policy allows
 * @returns the findings
 */
function missingFamilyFindings(
	record: DecodedRecord,
	allowed: InspectionPolicy["allowedFontFamilies"],
): InspectionFinding[] {
	if (allowed === "any" || allowed.includes(LEGACY_FONT_FAMILY)) {
		return [];
	}
	return [
		make({
			code: "FONT_POLICY_VIOLATION",
			reason: "missing-font-family",
			severity: "warning",
			affectsCoverage: false,
			details: { effectiveFamily: 1, allowedFamilies: allowed },
			message: `Text ${record.id ?? record.sourceIndex} uses legacy font family ${LEGACY_FONT_FAMILY}.`,
			elements: [record.ref],
			points: textCentre(record),
			affected: record.evidenceBox,
		}),
	];
}

/**
 * The finding for a persisted font family that is not one Excalidraw uses, so nothing can say
 * what the text renders in.
 * @param record the text element
 * @param raw the element's raw fields
 * @param allowed the families the policy allows
 * @returns the finding
 */
function invalidFamilyFinding(
	record: DecodedRecord,
	raw: RawRecord,
	allowed: InspectionPolicy["allowedFontFamilies"],
): InspectionFinding {
	return make({
		code: "FONT_POLICY_VIOLATION",
		reason: "invalid-font-family",
		severity: "warning",
		affectsCoverage: false,
		details: {
			rawType: kindOf(raw["fontFamily"]),
			rawDescription: stableDescription(raw["fontFamily"]),
			allowedFamilies: allowed,
		},
		message: `Text ${record.id ?? record.sourceIndex} has invalid persisted fontFamily.`,
		elements: [record.ref],
		points: textCentre(record),
		affected: record.evidenceBox,
	});
}

/**
 * The finding for a text element rendering in a family the run's policy does not allow.
 * @param record the text element
 * @param family the family it renders in
 * @param allowed the families the policy allows
 * @returns the findings
 */
function disallowedFamilyFindings(
	record: DecodedRecord,
	family: FontFamily,
	allowed: InspectionPolicy["allowedFontFamilies"],
): InspectionFinding[] {
	if (allowed === "any" || allowed.includes(family)) {
		return [];
	}
	return [
		make({
			code: "FONT_POLICY_VIOLATION",
			reason: "disallowed-font-family",
			severity: "warning",
			affectsCoverage: false,
			details: { rawFamily: family, effectiveFamily: family, allowedFamilies: allowed },
			message: `Text ${record.id ?? record.sourceIndex} uses disallowed font family ${family}.`,
			elements: [record.ref],
			points: textCentre(record),
			affected: record.evidenceBox,
		}),
	];
}

/**
 * What a text element's font says against the run's policy: no family persisted at all, a
 * family that is not one Excalidraw uses, or one the policy does not allow.
 * @param record the element
 * @param raw the element's raw fields
 * @param policy the run's policy
 * @returns the findings
 */
function fontFindings(
	record: DecodedRecord,
	raw: RawRecord,
	policy: InspectionPolicy,
): InspectionFinding[] {
	if (record.type !== "text") {
		return [];
	}
	const allowed = policy.allowedFontFamilies;
	const family = raw["fontFamily"];
	if (!("fontFamily" in raw) || family === undefined) {
		return missingFamilyFindings(record, allowed);
	}
	if (!persistableFamily(family)) {
		return [invalidFamilyFinding(record, raw, allowed)];
	}
	return disallowedFamilyFindings(record, family, allowed);
}

/**
 * The finding for library attribution that does not read. An element rescued by a qualifying
 * group is still an obstacle the run can reason about, so its broken attribution is reported
 * without counting against coverage.
 * @param record the element
 * @param model the inspection model
 * @returns the findings
 */
function libraryFindings(record: DecodedRecord, model: InspectionModel): InspectionFinding[] {
	const library = libraryAttribution(record);
	const elementId = record.id;
	if (library === null || library.valid || elementId === null) {
		return [];
	}
	const rescuedByGroup = model.qualifyingGroupedObstacleElementIds.has(elementId);
	const shared = {
		code: "BROKEN_REFERENCE",
		reason: "invalid-library-attribution",
		severity: "error",
		message: `Element ${elementId} has invalid library attribution.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	} as const;
	return rescuedByGroup
		? [
				make({
					...shared,
					affectsCoverage: false,
					details: { elementId, issues: library.issues, rescuedByGroup: true },
				}),
			]
		: [
				make({
					...shared,
					affectsCoverage: true,
					details: { elementId, issues: library.issues, rescuedByGroup: false },
				}),
			];
}

export { fontFindings, libraryFindings, metadataFindings };
