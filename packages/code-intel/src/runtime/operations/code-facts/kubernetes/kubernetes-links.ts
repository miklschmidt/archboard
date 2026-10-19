// What Kubernetes manifests join by labels (ADR 0046, TASK-367.19): a Service
// and the workloads its selector picks, and the workloads a NetworkPolicy
// lets talk. A selector names no address, so these joins are not references
// of one file: the code check reads them from the manifests beside the files
// that a board binds, and the workloads a selector picks are found as the
// resolver finds an address (kubernetes-resolution.ts). The cluster picks a
// pod by exactly these labels, so a join is resolved, not a candidate.
//
// A Service's selector is configured-path evidence from the Service to each
// workload it picks. A NetworkPolicy declares traffic between two other
// parts, so its evidence is a permission from the workload that sends to the
// one that receives: from each peer of an `ingress` rule to each pod the
// policy governs, and from each pod it governs to each peer of an `egress`
// rule.

import type { Definition } from "#runtime/operations/code-facts/facts.ts";
import type { ManifestObject } from "#runtime/operations/code-facts/kubernetes/kubernetes-model.ts";
import {
	manifestIndex,
	type Declared,
	type ManifestIndex,
} from "#runtime/operations/code-facts/kubernetes/kubernetes-resolution.ts";
import type { CheckoutFiles } from "#runtime/operations/code-facts/modules/module-resolution.ts";
import { readListed, type FactsPass } from "#runtime/services/code-facts/reader.ts";

/** An object, by the manifest that declares it and its definition there. */
interface ManifestSite {
	readonly path: string;
	readonly definition: Definition;
}

/** One join of two objects that a Service or a NetworkPolicy declares by labels. */
interface KubernetesLink {
	/** The manifest that declares the join, and the line of its selector or rule. */
	readonly path: string;
	readonly line: number;
	/** The Service or NetworkPolicy that declares it: `Service/cart`. */
	readonly symbol: string;
	readonly kind: "configured-path" | "permission";
	readonly from: ManifestSite;
	readonly to: ManifestSite;
}

/** The manifests of one checkout in a pass, and the joins each one declares. */
interface Reading {
	readonly index: ManifestIndex;
	readonly links: Map<string, readonly KubernetesLink[]>;
}

/** Each pass's readings, by checkout. Manifests depend on the files alone, so every board of a pass shares them. */
const READINGS = new WeakMap<FactsPass, Map<string, Reading>>();

/**
 * The site of a declared object.
 * @param declared The object and its manifest.
 * @returns Its site.
 */
function siteOf(declared: Declared): ManifestSite {
	return { path: declared.path, definition: declared.object.definition };
}

/**
 * The joins of a Service's selector.
 * @param index The manifests.
 * @param file The manifest.
 * @param object The Service.
 * @returns A configured path to each workload it picks.
 */
function selectorLinks(
	index: ManifestIndex,
	file: string,
	object: ManifestObject,
): KubernetesLink[] {
	const { selector, definition } = object;
	if (selector === undefined) return [];
	const from = { path: file, definition };
	return index.selected(file, selector.pods).map((workload) => ({
		path: file,
		line: selector.line,
		symbol: definition.symbol,
		kind: "configured-path",
		from,
		to: siteOf(workload),
	}));
}

/**
 * The joins of a NetworkPolicy: each pair of workloads a rule lets talk.
 * @param index The manifests.
 * @param file The manifest.
 * @param object The NetworkPolicy.
 * @returns A permission from each sender to each receiver.
 */
function policyLinks(index: ManifestIndex, file: string, object: ManifestObject): KubernetesLink[] {
	const { policy, definition } = object;
	if (policy === undefined) return [];
	const governed = index.selected(file, policy.selected).map(siteOf);
	return policy.rules.flatMap(({ direction, line, peer }) => {
		const peers = index.selected(file, peer).map(siteOf);
		const [senders, receivers] = direction === "ingress" ? [peers, governed] : [governed, peers];
		return senders.flatMap((from) =>
			receivers.flatMap((to): KubernetesLink[] =>
				from.path === to.path && from.definition.symbol === to.definition.symbol
					? []
					: [{ path: file, line, symbol: definition.symbol, kind: "permission", from, to }],
			),
		);
	});
}

/**
 * The manifests of a checkout in a pass, read once.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @returns The reading.
 */
function readingOf(pass: FactsPass, checkout: CheckoutFiles): Reading {
	const readings = READINGS.get(pass) ?? new Map<string, Reading>();
	READINGS.set(pass, readings);
	let reading = readings.get(checkout.root);
	if (reading === undefined) {
		const index = manifestIndex(checkout.files, (relative) => readListed(checkout, relative));
		reading = { index, links: new Map() };
		readings.set(checkout.root, reading);
	}
	return reading;
}

/**
 * The joins that the manifests beside some files declare by labels: those of
 * every manifest in the directories that hold the files.
 * @param pass The pass.
 * @param checkout The checkout and the files the pass may read.
 * @param files The files, relative to the checkout.
 * @returns Each join, in the order of the manifests and their objects.
 */
function kubernetesLinks(
	pass: FactsPass,
	checkout: CheckoutFiles,
	files: readonly string[],
): KubernetesLink[] {
	const { index, links } = readingOf(pass, checkout);
	return index.beside(files).flatMap((file) => {
		let found = links.get(file);
		if (found === undefined) {
			found = index
				.objectsOf(file)
				.flatMap((object) => [
					...selectorLinks(index, file, object),
					...policyLinks(index, file, object),
				]);
			links.set(file, found);
		}
		return found;
	});
}

export { type KubernetesLink, type ManifestSite, kubernetesLinks };
