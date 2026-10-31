import { expect, test } from "bun:test";
import type { Model } from "@archboard/board/content";
import { SHOP } from "#tests/ui/support/architecture-model/scene.ts";
import {
	chosenComparison,
	comparedWith,
	comparisonAddress,
	comparisonChoices,
} from "#ui/rules/architecture-model/comparison-choices.ts";

type Proposal = Model["proposals"][number];
type Comparison = NonNullable<Model["comparison"]>;

const CURRENT: Model["selectedState"] = { id: "Now", name: "Now", lifecycle: "current" };
const DRAFT: Model["selectedState"] = {
	id: "Mine",
	name: "Mine",
	lifecycle: "draft",
	predecessor: "Then",
};

/**
 * A draft of the catalogue.
 * @param id Its identity.
 * @param fields What it adds.
 * @returns The proposal.
 */
function proposal(id: string, fields: Partial<Proposal> = {}): Proposal {
	return {
		schemaVersion: 1,
		id,
		name: id,
		lifecycle: "draft",
		predecessor: "Then",
		predecessorRevision: "a".repeat(64),
		baseline: "b".repeat(40),
		changes: [],
		file: `${id}.proposal.json`,
		...fields,
	};
}

/**
 * A draft that shares its name with others.
 * @param id Its identity.
 * @param subject What it changes.
 * @returns The proposal.
 */
function twin(id: string, subject: string): Proposal {
	const changes: Proposal["changes"] = [{ type: "assign", subject, field: "name", value: "New" }];
	return proposal(id, { name: "Twin", changes });
}

const OTHER = proposal("Other", { name: "Called", summary: "Does this" });
const PINNED = proposal("Mine", { predecessorCheckpoint: "a".repeat(40) });

/**
 * A reading, as the server answers it.
 * @param fields What it holds.
 * @returns The reading.
 */
function reading(fields: Partial<Model>): Model {
	return {
		...SHOP,
		manifest: { ...SHOP.manifest, current: { id: "Now", name: "Now" } },
		proposals: [PINNED, OTHER],
		selectedState: DRAFT,
		...fields,
	};
}

const CATALOGUE = reading({ selectedState: CURRENT });
const BASED: Comparison = {
	reason: "predecessor",
	against: { id: "Then", name: "TASK-1", summary: "What it started from", lifecycle: "historical" },
	revision: SHOP.revision,
	checkpoint: "a".repeat(40),
	subjects: [],
};

const SAVED: Model["checkpoint"] = {
	id: "b".repeat(40),
	model: "Shop",
	state: { id: "Now", name: "Now" },
	revision: SHOP.revision,
	createdAt: "2026-10-30T21:52:00.000Z",
	request: {
		target: "current",
		operationId: "saved",
		writer: "fixture",
		doing: "Saving",
		expectedRevision: "a".repeat(64),
		dependencies: [],
	},
	sources: [],
	publication: "saved-locally",
};

/**
 * The values a reading offers.
 * @param model The reading.
 * @param against The comparison the address names.
 * @returns The values.
 */
function values(model: Model, against: string | null = null): string[] {
	return comparisonChoices({ reading: model, against, catalogue: CATALOGUE }).map(
		({ value }) => value,
	);
}

test("a draft offers no comparison, Current, its base and the other drafts by summary", () => {
	const model = reading({ comparison: BASED });
	const inputs = { reading: model, against: null, catalogue: CATALOGUE };
	expect(values(model)).toEqual(["after", "current", ":base", "Other"]);
	expect(chosenComparison(inputs)).toBe(":base");
	expect(comparisonChoices(inputs).at(-1)).toMatchObject({ label: "Does this", detail: "Called" });
	expect(comparedWith(inputs)).toBe("Compared with its base");
});

test("a draft with no comparison says so, and the way back is its base", () => {
	const model = reading({});
	const inputs = { reading: model, against: "after", catalogue: CATALOGUE };
	expect(chosenComparison(inputs)).toBe("after");
	expect(comparedWith(inputs)).toBe("No comparison");
	expect(comparisonAddress(":base", model)).toBeNull();
	expect(comparisonAddress("after", model)).toBe("after");
});

test("Current does not offer itself, and turning a comparison off leaves its address clean", () => {
	const model = reading({ selectedState: CURRENT });
	expect(values(model)).toEqual(["after", "Mine", "Other"]);
	expect(comparisonAddress("after", model)).toBeNull();
});

test("a saved reading of Current can compare with Current", () => {
	const model = reading({ selectedState: CURRENT, checkpoint: SAVED });
	expect(values(model)).toContain("current");
});

test("a saved base stands as one more choice, by its time and with no identity", () => {
	const id = "c".repeat(40);
	const comparison: Comparison = {
		reason: "explicit",
		against: CURRENT,
		revision: SHOP.revision,
		checkpoint: id,
		subjects: [{ id: "Shop#Gateway", subjectKind: "module", kind: "changed", fields: [] }],
	};
	const model = reading({ selectedState: CURRENT, comparison });
	const inputs = {
		reading: model,
		against: id,
		catalogue: CATALOGUE,
		savedAt: "2026-10-30T21:52:00.000Z",
	};
	const added = comparisonChoices(inputs).at(-1)!;
	expect(added.value).toBe(id);
	expect(added.label).toContain("2026");
	expect(added.label).not.toContain(id.slice(0, 8));
	expect(comparedWith(inputs)).toContain("· 1 changed");
});

test("an unnamed comparison on the address still offers the way out", () => {
	const inputs = { reading: reading({}), against: "gone", catalogue: CATALOGUE };
	expect(comparisonChoices(inputs).map(({ value }) => value)).toContain("gone");
	expect(comparisonChoices(inputs).at(-1)?.label).not.toContain("gone");
});

test("a reading with nothing to compare with offers one choice, so the control stays away", () => {
	const alone = reading({ selectedState: CURRENT, proposals: [] });
	const inputs = { reading: alone, against: null, catalogue: alone };
	expect(comparisonChoices(inputs).map(({ value }) => value)).toEqual(["after"]);
});

test("drafts that share a name differ by the modules they touch", () => {
	const twins = reading({
		selectedState: CURRENT,
		proposals: [
			twin("One", "Shop#Gateway"),
			twin("Two", "Shop#Worker"),
			twin("Three", "Shop#Lost"),
		],
	});
	const details = comparisonChoices({ reading: twins, against: null, catalogue: twins }).flatMap(
		({ detail }) => detail ?? [],
	);
	expect(details.filter(Boolean)).toEqual(["Touches Gateway", "Touches Worker", "1 change"]);
});
