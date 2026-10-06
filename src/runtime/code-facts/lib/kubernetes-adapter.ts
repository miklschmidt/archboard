// The Kubernetes adapter (ADR 0046, TASK-367.19): the code facts of one
// manifest from its text. A YAML file that is no manifest has none, and code
// facts read it as text (kubernetes-model.ts).
//
// Each object with a name is a definition addressed as kind and name:
// `Deployment/checkout`, `Service/checkout`, `Ingress/shop`. A Service of
// type `LoadBalancer` or `NodePort`, an Ingress, a Gateway and a Gateway API
// route are exposed.
//
// What an object names by address is a reference at the line that names it:
// a call from an Ingress backend or a route's `backendRefs` to the Service,
// and a configured path from a workload to the Service an environment value
// names (`http://cart:7070`, `CART_ADDR: cart:7070`, `cart.shop.svc`), to the
// ConfigMap or Secret a value, `envFrom` or a volume reads, and to the claim a
// volume mounts. A ConfigMap's value names a Service in the same way. Each
// such reference reaches its address through an import of its own, whose
// specifier is the address, so the resolver (kubernetes-resolution.ts) finds
// the manifest that declares it; an address no manifest of the checkout
// declares gives no evidence. A label selector names no address: the code
// check joins a Service to its pods, and a NetworkPolicy's pods, by their
// labels (kubernetes-links.ts).
//
// The name of each environment value a workload sets is a reference by
// `environment`, at the line that sets it, and so is each key of a ConfigMap
// or a Secret that can be such a name: TASK-367.23 joins it with the code that
// reads the name. Each ConfigMap or Secret that `envFrom` reads is an import
// that passes names on, whose names the resolver fills with the keys it
// declares, under the `envFrom` prefix. No fact holds a value.

import type { Import, ParsedFacts } from "@/runtime/code-facts/lib/facts";
import { readManifest, type ManifestObject } from "@/runtime/code-facts/lib/kubernetes-model";

/** A reference, with the import it reaches its address through. */
type ParsedReference = ParsedFacts["references"][number];

/** The references and imports of a manifest, as they are gathered. */
interface Gathered {
	readonly references: ParsedReference[];
	readonly imports: Import[];
}

/**
 * Add what one object names.
 * @param gathered What the file gave so far.
 * @param object The object.
 */
function addObject(gathered: Gathered, object: ManifestObject): void {
	for (const { address, line, kind } of object.links) {
		const names = [{ imported: address, local: address, typeOnly: false }];
		gathered.imports.push({ specifier: address, line, names, typeOnly: false, reexport: false });
		const through = { import: gathered.imports.length - 1, local: address };
		gathered.references.push({
			symbol: address,
			line,
			via: "code",
			kind,
			typeOnly: false,
			through,
		});
	}
	for (const { name, line } of object.environment) {
		gathered.references.push({ symbol: name, line, via: "environment", typeOnly: false });
	}
	for (const { address, line, prefix } of object.envFrom) {
		const names = [{ imported: "*", local: `${prefix}*`, typeOnly: false }];
		gathered.imports.push({ specifier: address, line, names, typeOnly: false, reexport: true });
	}
}

/**
 * The facts of a Kubernetes manifest.
 * @param text The file's text.
 * @returns Its facts, the whole file as one part that did not parse, or
 * undefined for a YAML file that is no manifest.
 */
function kubernetesFacts(text: string): ParsedFacts | undefined {
	const manifest = readManifest(text);
	if (manifest.status === "other") return undefined;
	if (manifest.status === "unparsed") {
		return { definitions: [], references: [], imports: [], unparsed: [manifest.unparsed] };
	}
	const gathered: Gathered = { references: [], imports: [] };
	for (const object of manifest.objects) addObject(gathered, object);
	return {
		definitions: manifest.objects.map((object) => object.definition),
		references: gathered.references.toSorted((left, right) => left.line - right.line),
		imports: gathered.imports,
		unparsed: [],
	};
}

export { kubernetesFacts };
