// What the pod of a Kubernetes workload names (ADR 0046, TASK-367.19): the
// Services its environment values name, the ConfigMaps, Secrets and
// PersistentVolumeClaims it reads, the names of the environment values it
// sets and the ConfigMaps and Secrets whose keys `envFrom` passes on to it.
// Of a Secret it names only the Secret and the key: a value that comes from a
// Secret (`valueFrom.secretKeyRef`) is never in the manifest, and the check
// never reads the Secret's data.

import type { YamlPath } from "@/runtime/code-facts/lib/compose-lines";
import {
	isMapping,
	itemsAt,
	servicesOf,
	stringAt,
} from "@/runtime/code-facts/lib/kubernetes-values";

/** A reference from an object to another one by its address: `Service/cart`. */
interface NamedLink {
	readonly line: number;
	readonly address: string;
	readonly kind: "call" | "configured-path";
}

/** The name of an environment value or of a key, at its line. */
interface NamedLine {
	readonly name: string;
	readonly line: number;
}

/** A ConfigMap or Secret whose keys `envFrom` passes on, under a prefix. */
interface EnvironmentSource {
	readonly line: number;
	readonly address: string;
	readonly prefix: string;
}

/** What one object names. */
interface ObjectLinks {
	readonly links: NamedLink[];
	/** The names of the environment values a workload sets, or of a ConfigMap's or Secret's keys. */
	readonly environment: NamedLine[];
	readonly envFrom: EnvironmentSource[];
}

/** One object, as its document holds it, with the lines of its paths. */
interface ObjectReading {
	readonly body: unknown;
	/**
	 * The line of a path inside the object, or of the nearest key that holds it.
	 * @param path The path, from the object.
	 * @returns The line.
	 */
	readonly at: (path: YamlPath) => number;
}

/** What a reference names in a volume: the kind it reaches, and the path of the name. */
const VOLUME_SOURCES: readonly (readonly [string, YamlPath])[] = [
	["ConfigMap", ["configMap", "name"]],
	["Secret", ["secret", "secretName"]],
	["PersistentVolumeClaim", ["persistentVolumeClaim", "claimName"]],
];
/** What a projected volume's source names. */
const PROJECTED_SOURCES: readonly (readonly [string, YamlPath])[] = [
	["ConfigMap", ["configMap", "name"]],
	["Secret", ["secret", "name"]],
];
/** What a value from a key names. */
const KEY_SOURCES: readonly (readonly [string, YamlPath])[] = [
	["ConfigMap", ["valueFrom", "configMapKeyRef", "name"]],
	["Secret", ["valueFrom", "secretKeyRef", "name"]],
];
/** What `envFrom` names. */
const ENV_FROM_SOURCES: readonly (readonly [string, YamlPath])[] = [
	["ConfigMap", ["configMapRef", "name"]],
	["Secret", ["secretRef", "name"]],
];

/**
 * The links one item gives, by the kinds and paths it may name another object at.
 * @param item The item.
 * @param sources Each kind and the path of its name.
 * @param line The item's line.
 * @returns A configured path for each name it holds.
 */
function linksOf(
	item: unknown,
	sources: readonly (readonly [string, YamlPath])[],
	line: number,
): NamedLink[] {
	return sources.flatMap(([kind, path]) => {
		const name = stringAt(item, path);
		return name === undefined
			? []
			: [{ line, address: `${kind}/${name}`, kind: "configured-path" }];
	});
}

/**
 * Add what one `env` item gives: its name, the Services its value names, and
 * the ConfigMap or Secret its value comes from.
 * @param found What the pod names so far.
 * @param item The item.
 * @param line Its line.
 */
function addEnvironment(found: ObjectLinks, item: unknown, line: number): void {
	const name = stringAt(item, ["name"]);
	if (name === undefined) return;
	found.environment.push({ name, line });
	const value = isMapping(item) ? item["value"] : undefined;
	for (const service of servicesOf(name, value)) {
		found.links.push({ line, address: `Service/${service}`, kind: "configured-path" });
	}
	found.links.push(...linksOf(item, KEY_SOURCES, line));
}

/**
 * Add what one `envFrom` item gives: the ConfigMap or Secret it reads, and the
 * keys it passes on.
 * @param found What the pod names so far.
 * @param item The item.
 * @param line Its line.
 */
function addEnvFrom(found: ObjectLinks, item: unknown, line: number): void {
	const links = linksOf(item, ENV_FROM_SOURCES, line);
	found.links.push(...links);
	const prefix = stringAt(item, ["prefix"]) ?? "";
	for (const { address } of links) found.envFrom.push({ line, address, prefix });
}

/**
 * Add what one volume gives: the ConfigMap, Secret or claim it mounts.
 * @param found What the pod names so far.
 * @param reading The object.
 * @param path The volume's path.
 * @param volume The volume.
 */
function addVolume(
	found: ObjectLinks,
	reading: ObjectReading,
	path: YamlPath,
	volume: unknown,
): void {
	found.links.push(...linksOf(volume, VOLUME_SOURCES, reading.at(path)));
	for (const [index, source] of itemsAt(volume, ["projected", "sources"])) {
		const line = reading.at([...path, "projected", "sources", index]);
		found.links.push(...linksOf(source, PROJECTED_SOURCES, line));
	}
}

/**
 * Add what each container of one list gives.
 * @param found What the pod names so far.
 * @param reading The object.
 * @param list The path of `containers` or `initContainers`.
 */
function addContainers(found: ObjectLinks, reading: ObjectReading, list: YamlPath): void {
	for (const [index] of itemsAt(reading.body, list)) {
		const container = [...list, index];
		for (const [at, item] of itemsAt(reading.body, [...container, "env"])) {
			addEnvironment(found, item, reading.at([...container, "env", at]));
		}
		for (const [at, item] of itemsAt(reading.body, [...container, "envFrom"])) {
			addEnvFrom(found, item, reading.at([...container, "envFrom", at]));
		}
	}
}

/**
 * What a pod names.
 * @param reading The object that holds the pod.
 * @param pod The path of the pod's `spec` in the object.
 * @returns Its links, environment names and environment sources.
 */
function podLinks(reading: ObjectReading, pod: YamlPath): ObjectLinks {
	const found: ObjectLinks = { links: [], environment: [], envFrom: [] };
	addContainers(found, reading, [...pod, "initContainers"]);
	addContainers(found, reading, [...pod, "containers"]);
	for (const [index, volume] of itemsAt(reading.body, [...pod, "volumes"])) {
		addVolume(found, reading, [...pod, "volumes", index], volume);
	}
	return found;
}

export {
	type EnvironmentSource,
	type NamedLine,
	type NamedLink,
	type ObjectLinks,
	type ObjectReading,
	podLinks,
};
