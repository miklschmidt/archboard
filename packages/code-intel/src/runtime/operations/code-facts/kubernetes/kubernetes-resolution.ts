// Where the addresses and label selectors of a Kubernetes manifest lead in
// its checkout (ADR 0046, TASK-367.19).
//
// The manifests of a checkout are its YAML files that hold an object of the
// Kubernetes API, compose files aside. An address resolves to the nearest
// manifest that declares it: the file itself, then the manifests of its
// directory, then those of the directories one step further away, and so on.
// The manifests applied together usually sit together, so the nearest
// declaration is the one the cluster would hold beside the object that names
// it. Where two manifests at the nearest step declare it, such as the copies
// of one environment and another, the check cannot tell which one the cluster
// holds, and the address resolves to none. A label selector picks the workloads whose
// pod labels it matches among the manifests of the nearest step that holds
// any. Each step reads its manifests once in a pass, and no further step is
// read once one answers.

import path from "node:path";
import { COMPOSE_FILE_NAMES } from "#runtime/operations/code-facts/compose/compose-project.ts";
import type {
	ImportedName,
	ImportResolver,
	ReadText,
} from "#runtime/operations/code-facts/facts.ts";
import {
	readManifest,
	selects,
	type LabelSelector,
	type ManifestObject,
} from "#runtime/operations/code-facts/kubernetes/kubernetes-model.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";

/** An object, and the manifest that declares it. */
interface Declared {
	readonly path: string;
	readonly object: ManifestObject;
}

/** The manifests of one checkout, read once each in a pass. */
interface ManifestIndex {
	/**
	 * The objects one file declares.
	 * @param file The file.
	 * @returns Its objects; none for a file that is no manifest or cannot be read.
	 */
	objectsOf(file: string): readonly ManifestObject[];
	/**
	 * The nearest declaration of an address.
	 * @param from The file that names it.
	 * @param address The address, `Service/cart`.
	 * @returns The declaration, or undefined when no manifest of the checkout declares it or
	 * two at the nearest step do.
	 */
	declaration(from: string, address: string): Declared | undefined;
	/**
	 * The workloads a selector picks among the manifests of the nearest step that holds any.
	 * @param from The file that holds the selector.
	 * @param selector The selector.
	 * @returns Each workload it picks; none when no manifest holds one.
	 */
	selected(from: string, selector: LabelSelector): Declared[];
	/**
	 * The manifests of the directories that hold some files.
	 * @param files The files.
	 * @returns Every YAML file of those directories, in path order.
	 */
	beside(files: readonly string[]): string[];
}

/**
 * Whether a file of the checkout may be a manifest: a YAML file that is no compose file.
 * @param file The file.
 * @returns True for a `.yaml` or `.yml` file.
 */
function mayBeManifest(file: string): boolean {
	const extension = path.posix.extname(file);
	const name = path.posix.basename(file);
	return (extension === ".yaml" || extension === ".yml") && !COMPOSE_FILE_NAMES.includes(name);
}

/**
 * How many directory steps lie between two directories.
 * @param from The one directory.
 * @param to The other.
 * @returns The steps up to the directory that holds both and down again.
 */
function steps(from: string, to: string): number {
	const up = from === "." ? [] : from.split("/");
	const down = to === "." ? [] : to.split("/");
	let shared = 0;
	while (shared < up.length && shared < down.length && up[shared] === down[shared]) shared += 1;
	return up.length - shared + (down.length - shared);
}

/**
 * The manifests of a checkout, read through one pass's reader.
 * @param files The files of the checkout.
 * @param read Reads a file the pass may read.
 * @returns The index.
 */
function manifestIndex(files: ReadonlySet<string>, read: ReadText): ManifestIndex {
	const candidates = [...files].filter(mayBeManifest).toSorted();
	const objects = new Map<string, readonly ManifestObject[]>();
	const rings = new Map<string, string[][]>();
	/**
	 * The objects of one file, read once.
	 * @param file The file.
	 * @returns Its objects.
	 */
	const objectsOf = (file: string): readonly ManifestObject[] => {
		let found = objects.get(file);
		if (found === undefined) {
			const text = read(file);
			const manifest = text === undefined ? undefined : readManifest(text);
			found = manifest?.status === "manifest" ? manifest.objects : [];
			objects.set(file, found);
		}
		return found;
	};
	/**
	 * The manifests around a file, step by step, the file's own directory first.
	 * @param from The file.
	 * @returns The manifests of each step, in path order.
	 */
	const ringsOf = (from: string): string[][] => {
		const directory = path.posix.dirname(from);
		let found = rings.get(directory);
		if (found === undefined) {
			const byStep = new Map<number, string[]>();
			for (const file of candidates) {
				const step = steps(directory, path.posix.dirname(file));
				byStep.set(step, [...(byStep.get(step) ?? []), file]);
			}
			found = [...byStep].toSorted(([left], [right]) => left - right).map(([, each]) => each);
			rings.set(directory, found);
		}
		return found;
	};
	return {
		objectsOf,
		/**
		 * The nearest declaration of an address.
		 * @param from The file that names it.
		 * @param address The address.
		 * @returns The declaration, or undefined.
		 */
		declaration(from, address) {
			for (const ring of [[from], ...ringsOf(from)]) {
				const declared = ring.flatMap((file) => {
					const object = objectsOf(file).find((each) => each.definition.symbol === address);
					return object === undefined ? [] : [{ path: file, object }];
				});
				if (declared.length > 0) return declared.length === 1 ? declared[0] : undefined;
			}
			return undefined;
		},
		/**
		 * The workloads a selector picks at the nearest step that holds any.
		 * @param from The file that holds the selector.
		 * @param selector The selector.
		 * @returns Each workload it picks.
		 */
		selected(from, selector) {
			for (const ring of ringsOf(from)) {
				const picked = ring.flatMap((file) =>
					objectsOf(file).flatMap((object) =>
						object.podLabels !== undefined && selects(selector, object.podLabels)
							? [{ path: file, object }]
							: [],
					),
				);
				if (picked.length > 0) return picked;
			}
			return [];
		},
		/**
		 * The manifests of the directories that hold some files.
		 * @param held The files.
		 * @returns The YAML files of those directories.
		 */
		beside(held) {
			const directories = new Set(held.map((file) => path.posix.dirname(file)));
			return candidates.filter((file) => directories.has(path.posix.dirname(file)));
		},
	};
}

/**
 * The names an `envFrom` import passes on: each key of the ConfigMap or
 * Secret it reads, under its prefix, and never a value.
 * @param prefixed The import's one name, `<prefix>*`.
 * @param object The ConfigMap or Secret.
 * @returns The names.
 */
function passedOn(prefixed: string, object: ManifestObject): ImportedName[] {
	const prefix = prefixed.slice(0, -1);
	const keys = [...new Set(object.environment.map((each) => each.name))];
	return keys.map((key) => ({ imported: key, local: `${prefix}${key}`, typeOnly: false }));
}

/**
 * The resolver of one checkout's manifests for one pass.
 * @param checkout The checkout's files.
 * @param read Reads a file the pass may read.
 * @returns The resolver.
 */
function createKubernetesResolver(checkout: CheckoutFiles, read: ReadText): ImportResolver {
	const index = manifestIndex(checkout.files, read);
	return {
		/**
		 * Where one import of a manifest leads.
		 * @param from The manifest.
		 * @param found The import.
		 * @returns It resolved to the nearest manifest that declares its address.
		 */
		resolve(from, found) {
			const declared = index.declaration(from, found.specifier);
			if (declared === undefined) return found;
			const names = found.reexport
				? passedOn(found.names[0]?.local ?? "*", declared.object)
				: [
						{
							imported: declared.object.definition.symbol,
							local: found.specifier,
							typeOnly: false,
						},
					];
			return { ...found, resolved: declared.path, names };
		},
	};
}

export { type Declared, type ManifestIndex, createKubernetesResolver, manifestIndex };
