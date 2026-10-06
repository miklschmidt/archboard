// What one Kubernetes manifest declares (ADR 0046, TASK-367.19), read with
// `Bun.YAML.parse` and placed on its lines by compose-lines.ts.
//
// A YAML file is a manifest when one of its documents is an object: a mapping
// with a string `apiVersion` and `kind`. Every other YAML file, such as a
// GitHub workflow, an OpenAPI document or a Helm chart's `values.yaml`, is not
// one, and code facts read it as text. A file that does not parse as YAML is
// a manifest when a document writes `apiVersion` and `kind` at its top, as a
// Helm template does; it is then one part that did not parse, with the names
// of its keys and never a value, where every address is unknown and none is
// absent. A `List` (`kind: List`, `kind: ServiceList`)
// holds its objects as `items`.
//
// Each object with a `metadata.name` is a definition addressed as kind and
// name, `Deployment/checkout`, spanning its document or its item of a list.
// The namespace is not part of the address. The check reads no cluster, so a
// namespace that `kubectl -n` or Kustomize gives is unknown, and an address
// with it would change with how the manifests are applied. A workload is an
// object with a pod: a `Pod`, a `CronJob`'s job template, or any object with
// `spec.template.spec`, as a Deployment, StatefulSet, DaemonSet, ReplicaSet
// and Job have. Of a Secret, the check reads the names of its keys and never
// a value of `data` or `stringData`.

import type { Definition, Unparsed } from "@/runtime/code-facts/lib/facts";
import { yamlLines, type YamlLines, type YamlPath } from "@/runtime/code-facts/lib/compose-lines";
import {
	podLinks,
	type NamedLine,
	type NamedLink,
	type ObjectLinks,
	type ObjectReading,
} from "@/runtime/code-facts/lib/kubernetes-pods";
import {
	ENVIRONMENT_NAME,
	isMapping,
	itemsAt,
	servicesOf,
	stringAt,
	valueAt,
} from "@/runtime/code-facts/lib/kubernetes-values";

/** One requirement of a label selector: `tier In [web, api]`. */
interface Requirement {
	readonly key: string;
	readonly operator: string;
	readonly values: readonly string[];
}

/** Which pods a selector picks: every label it matches, and every requirement. */
interface LabelSelector {
	readonly matchLabels: Readonly<Record<string, string>>;
	readonly matchExpressions: readonly Requirement[];
}

/** A rule of a NetworkPolicy: the pods it lets in (`ingress`) or out to (`egress`). */
interface PolicyRule {
	readonly direction: "ingress" | "egress";
	readonly line: number;
	readonly peer: LabelSelector;
}

/** One object of a manifest. */
interface ManifestObject extends ObjectLinks {
	readonly definition: Definition;
	/** The labels of its pod, for a workload. */
	readonly podLabels?: Readonly<Record<string, string>>;
	/** The pods a Service sends traffic to, and the line of its selector. */
	readonly selector?: { readonly line: number; readonly pods: LabelSelector };
	/** The pods a NetworkPolicy governs, and the traffic it allows. */
	readonly policy?: { readonly selected: LabelSelector; readonly rules: readonly PolicyRule[] };
}

/** What one YAML file declares as a manifest, or that it is no manifest. */
type Manifest =
	| { readonly status: "manifest"; readonly objects: readonly ManifestObject[] }
	| { readonly status: "unparsed"; readonly unparsed: Unparsed }
	| { readonly status: "other" };

/** A selector that picks every pod. */
const EVERY_POD: LabelSelector = { matchLabels: {}, matchExpressions: [] };
/** The kinds of the Gateway API that route traffic to a backend. */
const ROUTES = new Set(["HTTPRoute", "GRPCRoute", "TLSRoute", "TCPRoute", "UDPRoute"]);
/** The kinds that take traffic from outside the cluster. */
const ENTRANCES = new Set([...ROUTES, "Ingress", "Gateway"]);

/**
 * Whether a document is an object of the Kubernetes API.
 * @param value The document.
 * @returns True for a mapping with a string `apiVersion` and `kind`.
 */
function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
	return (
		isMapping(value) && typeof value["apiVersion"] === "string" && typeof value["kind"] === "string"
	);
}

/**
 * The labels a mapping gives, each value as a string.
 * @param value The mapping.
 * @returns The labels; none for anything else.
 */
function labelsOf(value: unknown): Record<string, string> {
	if (!isMapping(value)) return {};
	return Object.fromEntries(
		Object.entries(value).flatMap(([key, label]) =>
			typeof label === "string" || typeof label === "number" || typeof label === "boolean"
				? [[key, String(label)]]
				: [],
		),
	);
}

/**
 * A label selector as a NetworkPolicy writes one, with `matchLabels` and `matchExpressions`.
 * @param value The selector.
 * @returns It, or undefined where none is written.
 */
function selectorOf(value: unknown): LabelSelector | undefined {
	if (!isMapping(value)) return undefined;
	const matchExpressions = itemsAt(value, ["matchExpressions"]).flatMap(([, item]) => {
		const key = stringAt(item, ["key"]);
		const operator = stringAt(item, ["operator"]);
		if (key === undefined || operator === undefined) return [];
		const values = itemsAt(item, ["values"]).map(([, each]) => String(each));
		return [{ key, operator, values }];
	});
	return { matchLabels: labelsOf(value["matchLabels"]), matchExpressions };
}

/**
 * Whether a pod's labels meet one requirement.
 * @param requirement The requirement.
 * @param labels The labels.
 * @returns True when they do; an operator Kubernetes does not have meets none.
 */
function meets(requirement: Requirement, labels: Readonly<Record<string, string>>): boolean {
	const value = labels[requirement.key];
	const listed = value !== undefined && requirement.values.includes(value);
	if (requirement.operator === "In") return listed;
	if (requirement.operator === "NotIn") return !listed;
	if (requirement.operator === "Exists") return value !== undefined;
	return requirement.operator === "DoesNotExist" && value === undefined;
}

/**
 * Whether a selector picks a pod.
 * @param selector The selector.
 * @param labels The pod's labels.
 * @returns True when every label and requirement matches.
 */
function selects(selector: LabelSelector, labels: Readonly<Record<string, string>>): boolean {
	return (
		Object.entries(selector.matchLabels).every(([key, value]) => labels[key] === value) &&
		selector.matchExpressions.every((requirement) => meets(requirement, labels))
	);
}

/**
 * The path of a workload's pod `spec` in its object.
 * @param kind The object's kind.
 * @param body The object.
 * @returns The path, or undefined for an object with no pod.
 */
function podPathOf(kind: string, body: unknown): YamlPath | undefined {
	if (kind === "Pod") return ["spec"];
	const template =
		kind === "CronJob" ? ["spec", "jobTemplate", "spec", "template"] : ["spec", "template"];
	return isMapping(valueAt(body, [...template, "spec"])) ? [...template, "spec"] : undefined;
}

/**
 * The backends an Ingress routes to: its default backend and each path's.
 * @param reading The object.
 * @returns A call to each Service it names.
 */
function ingressLinks(reading: ObjectReading): NamedLink[] {
	const rules = itemsAt(reading.body, ["spec", "rules"]).flatMap(([rule]) =>
		itemsAt(reading.body, ["spec", "rules", rule, "http", "paths"]).map(([path]): YamlPath => [
			"spec",
			"rules",
			rule,
			"http",
			"paths",
			path,
			"backend",
		]),
	);
	const backends: YamlPath[] = [["spec", "defaultBackend"], ["spec", "backend"], ...rules];
	return backends.flatMap((path) => {
		const service =
			stringAt(reading.body, [...path, "service", "name"]) ??
			stringAt(reading.body, [...path, "serviceName"]);
		const line = reading.at(path);
		return service === undefined ? [] : [{ line, address: `Service/${service}`, kind: "call" }];
	});
}

/**
 * The backends a Gateway API route sends traffic to: each rule's `backendRefs`.
 * @param reading The object.
 * @returns A call to each backend, a Service unless the reference names another kind.
 */
function routeLinks(reading: ObjectReading): NamedLink[] {
	return itemsAt(reading.body, ["spec", "rules"]).flatMap(([rule]) =>
		itemsAt(reading.body, ["spec", "rules", rule, "backendRefs"]).flatMap(([index, ref]) => {
			const name = stringAt(ref, ["name"]);
			const kind = stringAt(ref, ["kind"]) ?? "Service";
			const line = reading.at(["spec", "rules", rule, "backendRefs", index]);
			return name === undefined ? [] : [{ line, address: `${kind}/${name}`, kind: "call" }];
		}),
	);
}

/**
 * The keys of a ConfigMap's or Secret's `data` and `stringData` that can be
 * the names of environment values, never a value.
 * @param reading The object.
 * @returns Each key at its line.
 */
function keysOf(reading: ObjectReading): NamedLine[] {
	return ["data", "stringData"].flatMap((field) => {
		const data = valueAt(reading.body, [field]);
		return isMapping(data)
			? Object.keys(data)
					.filter((name) => ENVIRONMENT_NAME.test(name))
					.map((name) => ({ name, line: reading.at([field, name]) }))
			: [];
	});
}

/**
 * What a ConfigMap's values name: a Service, as an environment value would.
 * @param reading The object.
 * @returns A configured path to each Service a value names.
 */
function configMapLinks(reading: ObjectReading): NamedLink[] {
	const data = valueAt(reading.body, ["data"]);
	if (!isMapping(data)) return [];
	return Object.entries(data).flatMap(([name, value]) =>
		ENVIRONMENT_NAME.test(name)
			? servicesOf(name, value).map((service) => ({
					line: reading.at(["data", name]),
					address: `Service/${service}`,
					kind: "configured-path" as const,
				}))
			: [],
	);
}

/**
 * What an object names, by its kind.
 * @param kind The kind.
 * @param reading The object.
 * @returns Its links, environment names and environment sources.
 */
function linksOf(kind: string, reading: ObjectReading): ObjectLinks {
	const pod = podPathOf(kind, reading.body);
	if (pod !== undefined) return podLinks(reading, pod);
	const none: ObjectLinks = { links: [], environment: [], envFrom: [] };
	if (kind === "Ingress") return { ...none, links: ingressLinks(reading) };
	if (ROUTES.has(kind)) return { ...none, links: routeLinks(reading) };
	if (kind === "Secret") return { ...none, environment: keysOf(reading) };
	if (kind === "ConfigMap")
		return { ...none, links: configMapLinks(reading), environment: keysOf(reading) };
	return none;
}

/**
 * The rules of a NetworkPolicy: each peer a pod selector picks. A peer that
 * only a namespace selector or an IP block names reaches pods the manifests do
 * not say, so it is not read; the namespace selector beside a pod selector is
 * not either.
 * @param reading The object.
 * @returns The pods it governs and the traffic it allows.
 */
function policyOf(reading: ObjectReading): NonNullable<ManifestObject["policy"]> {
	const selected = selectorOf(valueAt(reading.body, ["spec", "podSelector"])) ?? EVERY_POD;
	const sides = [
		["ingress", "from"],
		["egress", "to"],
	] as const;
	const rules = sides.flatMap(([direction, side]) =>
		itemsAt(reading.body, ["spec", direction]).flatMap(([rule, body]) =>
			itemsAt(body, [side]).flatMap(([index, peer]) => {
				const pods = selectorOf(valueAt(peer, ["podSelector"]));
				const line = reading.at(["spec", direction, rule, side, index]);
				return pods === undefined ? [] : [{ direction, line, peer: pods }];
			}),
		),
	);
	return { selected, rules };
}

/**
 * The pods a Service sends traffic to. A Service with no selector, or of type
 * `ExternalName`, names its endpoints elsewhere.
 * @param reading The object.
 * @returns Its selector, or undefined.
 */
function serviceSelectorOf(reading: ObjectReading): ManifestObject["selector"] {
	const labels = labelsOf(valueAt(reading.body, ["spec", "selector"]));
	const external = stringAt(reading.body, ["spec", "type"]) === "ExternalName";
	if (external || Object.keys(labels).length === 0) return undefined;
	const line = reading.at(["spec", "selector"]);
	return { line, pods: { matchLabels: labels, matchExpressions: [] } };
}

/**
 * The visibility of an object: a Service's type, `external` for what takes
 * traffic from outside the cluster, else `cluster`.
 * @param kind The kind.
 * @param body The object.
 * @returns Its visibility, and whether it is exposed.
 */
function visibilityOf(kind: string, body: unknown): Pick<Definition, "visibility" | "exposed"> {
	if (kind === "Service") {
		const type = stringAt(body, ["spec", "type"]) ?? "ClusterIP";
		return { visibility: type, exposed: type === "LoadBalancer" || type === "NodePort" };
	}
	const entrance = ENTRANCES.has(kind);
	return { visibility: entrance ? "external" : "cluster", exposed: entrance };
}

/** One object where its document holds it. */
interface Root {
	readonly document: number;
	readonly path: YamlPath;
	readonly body: Readonly<Record<string, unknown>>;
}

/**
 * The lines an object spans: its item of a list, or its whole document,
 * from its first key to its last.
 * @param root The object.
 * @param lines The file's lines.
 * @returns The first and last line.
 */
function spanOf(root: Root, lines: YamlLines): { start: number; end: number } {
	const keys = root.path.length > 0 ? [root.path] : Object.keys(root.body).map((key) => [key]);
	const spans = keys.flatMap((key) => lines.spanOf(root.document, key) ?? []);
	return {
		start: Math.min(...spans.map((span) => span.start)),
		end: Math.max(...spans.map((span) => span.end)),
	};
}

/**
 * One object of a manifest.
 * @param root The object where its document holds it.
 * @param lines The file's lines.
 * @returns It, or none for an object with no name.
 */
function objectOf(root: Root, lines: YamlLines): ManifestObject[] {
	const kind = String(root.body["kind"]);
	const name = stringAt(root.body, ["metadata", "name"]);
	if (name === undefined) return [];
	const { start, end } = spanOf(root, lines);
	const reading: ObjectReading = {
		body: root.body,
		/**
		 * The line of a path in the object, or of the nearest key that holds it.
		 * @param path The path.
		 * @returns The line.
		 */
		at: (path) => lines.spanOf(root.document, [...root.path, ...path])?.start ?? start,
	};
	const definition = { symbol: `${kind}/${name}`, start, end, ...visibilityOf(kind, root.body) };
	const pod = podPathOf(kind, root.body);
	const selector = kind === "Service" ? serviceSelectorOf(reading) : undefined;
	return [
		{
			definition,
			...linksOf(kind, reading),
			...(pod === undefined
				? {}
				: { podLabels: labelsOf(valueAt(root.body, [...pod.slice(0, -1), "metadata", "labels"])) }),
			...(selector === undefined ? {} : { selector }),
			...(kind === "NetworkPolicy" ? { policy: policyOf(reading) } : {}),
		},
	];
}

/**
 * The objects of one document: the document itself, or the items of a list.
 * @param value The document.
 * @param document Its index.
 * @returns Each object where the document holds it.
 */
function rootsOf(value: unknown, document: number): Root[] {
	if (!isObject(value)) return [];
	const items = value["items"];
	if (!String(value["kind"]).endsWith("List") || !Array.isArray(items)) {
		return [{ document, path: [], body: value }];
	}
	return items.flatMap((item: unknown, index) =>
		isObject(item) ? [{ document, path: ["items", index], body: item }] : [],
	);
}

/**
 * A file that does not parse as YAML: a manifest that did not parse when a
 * document writes `apiVersion` and `kind` at its top, else no manifest.
 * @param text The file's text.
 * @param lines The file's lines.
 * @returns The manifest as one part that did not parse, or no manifest.
 */
function unparsedManifest(text: string, lines: YamlLines): Manifest {
	const documents = Array.from({ length: lines.documents }, (_, index) => index);
	/**
	 * Whether a document writes a key at its top.
	 * @param document The document.
	 * @param key The key.
	 * @returns True when it does.
	 */
	const top = (document: number, key: string): boolean =>
		lines.spanOf(document, [key])?.own === true;
	if (!documents.some((each) => top(each, "apiVersion") && top(each, "kind"))) {
		return { status: "other" };
	}
	const end = text.split(/\r?\n/u).length;
	return { status: "unparsed", unparsed: { start: 1, end, names: lines.names, under: "" } };
}

/**
 * What a YAML file declares as a manifest.
 * @param text The file's text.
 * @returns Its objects, the whole file as a part that did not parse, or that it is no manifest.
 */
function readManifest(text: string): Manifest {
	const lines = yamlLines(text);
	let parsed: unknown;
	try {
		parsed = Bun.YAML.parse(text);
	} catch {
		return unparsedManifest(text, lines);
	}
	const documents: unknown[] = lines.documents > 1 && Array.isArray(parsed) ? parsed : [parsed];
	if (!documents.some(isObject)) return { status: "other" };
	const roots = documents.flatMap((value, index) => rootsOf(value, index));
	return { status: "manifest", objects: roots.flatMap((root) => objectOf(root, lines)) };
}

export { type LabelSelector, type Manifest, type ManifestObject, readManifest, selects };
