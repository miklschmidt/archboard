// Reading the values of a Kubernetes manifest as `Bun.YAML.parse` gives them
// (ADR 0046, TASK-367.19): a value at a path, and the names an environment
// value reaches. A value is read only for the name of what it reaches, and no
// fact keeps one.

import type { YamlPath } from "@/runtime/code-facts/lib/compose-lines";

/**
 * Whether a value is a mapping.
 * @param value The value.
 * @returns True for a plain object.
 */
function isMapping(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The value at a path of keys and item indexes.
 * @param value Where the path starts.
 * @param path The path.
 * @returns The value, or undefined where the path leads nowhere.
 */
function valueAt(value: unknown, path: YamlPath): unknown {
	let at = value;
	for (const step of path) {
		if (typeof step === "number") at = Array.isArray(at) ? (at[step] as unknown) : undefined;
		else at = isMapping(at) ? at[step] : undefined;
	}
	return at;
}

/**
 * The items of a sequence at a path, each with its index.
 * @param value Where the path starts.
 * @param path The path.
 * @returns The items; none where the path holds no sequence.
 */
function itemsAt(value: unknown, path: YamlPath): [number, unknown][] {
	const found = valueAt(value, path);
	return Array.isArray(found) ? found.map((item: unknown, index) => [index, item]) : [];
}

/**
 * A string at a path.
 * @param value Where the path starts.
 * @param path The path.
 * @returns The string, or undefined for anything else.
 */
function stringAt(value: unknown, path: YamlPath): string | undefined {
	const found = valueAt(value, path);
	return typeof found === "string" && found !== "" ? found : undefined;
}

/** A variable's name that says its bare value is a host. */
const HOST_NAME = /(?:HOST|HOSTS|HOSTNAME|SERVER|SERVERS|ADDR|ADDRESS)$/iu;
/**
 * An address in one item of an environment value: a scheme, a user, a host
 * as DNS spells one, and a port.
 */
const ADDRESS =
	/^(?<scheme>(?:[a-z][a-z0-9+.-]*:)+\/\/)?(?<user>[^@/\s]*@)?(?<host>[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*)(?::(?<port>\d+))?(?:[/?#]|$)/u;
/** Hosts that are never a Service: this machine, a number, or a YAML boolean word. */
const NOT_A_SERVICE = /^(?:localhost|true|false|yes|no|on|off|\d+)$/u;
/** A name an environment value can have, which `envFrom` passes on. */
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/**
 * The Service a host names in the cluster's DNS: `cart`, or
 * `cart.<namespace>.svc` with or without the cluster's domain. A host of two
 * names, such as `example.com`, and one whose third name is not `svc` name a
 * machine outside the cluster.
 * @param host The host.
 * @returns The Service's name, or undefined.
 */
function serviceOfHost(host: string): string | undefined {
	const names = host.split(".");
	const [name = ""] = names;
	if (NOT_A_SERVICE.test(name)) return undefined;
	if (names.length === 1) return name;
	return names.length >= 3 && names[2] === "svc" ? name : undefined;
}

/**
 * The Service one item of an environment value names, where it names one:
 * a host after a scheme or a user, or before a port, or the whole bare word
 * under a name that says it is a host.
 * @param name The variable's name.
 * @param item One item of its value.
 * @returns The Service's name, or undefined.
 */
function serviceOfItem(name: string, item: string): string | undefined {
	const { host, ...signs } = ADDRESS.exec(item)?.groups ?? {};
	const named = Object.values(signs).some(Boolean) || HOST_NAME.test(name);
	return named && host !== undefined ? serviceOfHost(host) : undefined;
}

/**
 * The Services an environment value names. A dependent value (`$(OTHER)`)
 * is another variable's, which the value does not say, so it names nothing.
 * @param name The variable's name.
 * @param value Its value.
 * @returns Each Service's name once.
 */
function servicesOf(name: string, value: unknown): string[] {
	if (typeof value !== "string") return [];
	const items = value.replaceAll(/\$\([^)]*\)/gu, "").split(/[\s,;]+/u);
	return [...new Set(items.flatMap((item) => serviceOfItem(name, item) ?? []))];
}

export { ENVIRONMENT_NAME, isMapping, itemsAt, servicesOf, stringAt, valueAt };
