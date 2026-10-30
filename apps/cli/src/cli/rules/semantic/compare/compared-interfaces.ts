// How `semantic compare` carries what a variant changed about each container's
// interface (ADR 0044): the schema of that section of the answer, the section
// built from the shared reading, and what is said about it in words.
//
// The reading is the shared model's `compareInterfaces`. An interface change
// sets no comparison status, so nothing here carries a `standing`.

import { z } from "zod";
import { compareInterfaces } from "@archboard/board/container-interface";
import type { SemanticNode, VariantContent } from "@archboard/board/content";

type InterfaceChange = ReturnType<typeof compareInterfaces>["changed"][number];

/** One part named in the interface section: enough to find it on the board. */
const InterfacePartSchema = z.object({ id: z.string(), name: z.string(), kind: z.string() });

/**
 * What one container's interface changed (ADR 0044). It carries no `standing`:
 * an interface change sets no comparison status, so no part is badged because a
 * caller now reaches it.
 */
const InterfaceChangeSchema = z.object({
	container: InterfacePartSchema,
	/** Whether the node has children on each variant; a new or emptied container is one-sided. */
	holdsParts: z.object({ variant: z.boolean(), against: z.boolean() }),
	/** Entry points of the variant that are not children of the container on the one it is read against. */
	entryPointsAdded: z.array(InterfacePartSchema),
	/** Entry points of the variant it is read against that are not children of the container on this one. */
	entryPointsRemoved: z.array(InterfacePartSchema),
	/** Children on both that a relationship from outside reaches only on this variant. */
	becameEntryPoints: z.array(InterfacePartSchema),
	/** Children on both that a relationship from outside reaches only on the variant it is read against. */
	becameHidden: z.array(InterfacePartSchema),
	/** Parts that call the container on this variant and did not on the one it is read against. */
	callersGained: z.array(InterfacePartSchema),
	/** Parts that called the container on the variant it is read against and do not on this one. */
	callersLost: z.array(InterfacePartSchema),
});

/**
 * Every container either variant has: those whose interface changed, and those
 * whose did not, so that "no interface changed" is a claim that can be read.
 */
const InterfaceChangesSchema = z.object({
	changed: z.array(InterfaceChangeSchema),
	unchanged: z.array(InterfacePartSchema),
});

type InterfacePart = z.infer<typeof InterfacePartSchema>;
type InterfaceChanged = z.infer<typeof InterfaceChangeSchema>;
type InterfaceChanges = z.infer<typeof InterfaceChangesSchema>;

/**
 * One part named in the interface section.
 * @param node The part.
 * @returns Its identity, name and kind.
 */
function interfacePart(node: SemanticNode): InterfacePart {
	return { id: node.id, name: node.name, kind: node.kind };
}

/**
 * What one container's interface changed, as the answer carries it. The shared
 * reading says earlier and later; the answer says the variant it is read
 * against and the variant compared.
 * @param change The container's change.
 * @returns The entry.
 */
function interfaceChanged(change: InterfaceChange): InterfaceChanged {
	return {
		container: interfacePart(change.container),
		holdsParts: { variant: change.holdsParts.after, against: change.holdsParts.before },
		entryPointsAdded: change.entryPointsAdded.map(interfacePart),
		entryPointsRemoved: change.entryPointsRemoved.map(interfacePart),
		becameEntryPoints: change.becameEntryPoints.map(interfacePart),
		becameHidden: change.becameHidden.map(interfacePart),
		callersGained: change.callersGained.map(interfacePart),
		callersLost: change.callersLost.map(interfacePart),
	};
}

/**
 * What a variant changed about the interface of each container, as the answer carries it.
 * @param against The content of the variant it is read against.
 * @param variant The content of the variant compared.
 * @returns The containers whose interface changed, and those whose did not.
 */
function comparedInterfaces(against: VariantContent, variant: VariantContent): InterfaceChanges {
	const interfaces = compareInterfaces(against, variant);
	return {
		changed: interfaces.changed.map(interfaceChanged),
		unchanged: interfaces.unchanged.map(interfacePart),
	};
}

/**
 * What to say about the interface changes, for a person: one line for each
 * container whose interface moved, or one line that none did.
 * @param interfaces The interface section of the answer.
 * @param names What the variant compared and the one it is read against are called.
 * @param names.variant The variant compared.
 * @param names.against The variant it is read against.
 * @returns The lines.
 */
function describedInterfaces(
	interfaces: InterfaceChanges,
	names: { readonly variant: string; readonly against: string },
): string[] {
	if (interfaces.changed.length === 0) {
		return [
			interfaces.unchanged.length === 0
				? "Interface: neither variant has a container."
				: `Interface: no container's interface changed (${interfaces.unchanged.length} read).`,
		];
	}
	return interfaces.changed.map((change) => {
		const kinds: [string, readonly InterfacePart[]][] = [
			["entry points added", change.entryPointsAdded],
			["entry points removed", change.entryPointsRemoved],
			["now entry points", change.becameEntryPoints],
			["now hidden", change.becameHidden],
			["callers gained", change.callersGained],
			["callers lost", change.callersLost],
		];
		const moved = kinds
			.filter(([, parts]) => parts.length > 0)
			.map(([label, parts]) => `${label} ${parts.map((part) => part.name).join(", ")}`)
			.join("; ");
		// Only a container that appeared or emptied can have moved nothing: nobody outside reaches it.
		const only = change.holdsParts.variant ? names.variant : names.against;
		const side =
			change.holdsParts.variant === change.holdsParts.against
				? ""
				: ` (a container only on "${only}")`;
		return `Interface of "${change.container.name}"${side}: ${moved || "no entry points and no callers"}.`;
	});
}

export {
	InterfaceChangesSchema,
	InterfacePartSchema,
	comparedInterfaces,
	describedInterfaces,
	interfacePart,
};
