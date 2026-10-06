---
id: TASK-367.19
title: Code facts for Kubernetes manifests
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 17:01'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 627000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Kubernetes manifests declare how traffic reaches a workload and which services a workload is configured to call. The check reads manifest files only, including Helm or Kustomize output that somebody rendered to files. It never talks to a cluster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workloads, Services, Ingresses, Gateway routes, NetworkPolicies, ConfigMaps and Secrets are definitions, addressed as kind and name
- [ ] #2 A Service selector to a workload and an environment value that names a Service are configured paths, a route to a Service is a call, and a NetworkPolicy that allows traffic is a permission
- [ ] #3 Multi-document YAML files work, and Secret values are never read
- [ ] #4 Parts bound to manifests get the anchor, binding and undrawn checks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Archboard server@TASK-367.19 only if the Code facts description must change (it names the adapters it reads), adopted at close.
1. code-facts, new files: kubernetes-model.ts (Bun.YAML.parse plus compose-lines.ts for lines; which YAML file is a manifest; the objects of each document and List: Kind/name definitions, pod labels, Service selectors, NetworkPolicy rules, the named references of a pod spec, an Ingress and a Gateway route, the env names, envFrom, ConfigMap and Secret key names, never a Secret value), kubernetes-adapter.ts (facts: definitions, one import per named address, environment names, envFrom as reexport imports), kubernetes-resolution.ts (the nearest manifest that declares an address; envFrom names from the ConfigMap's or Secret's keys), kubernetes-links.ts (label-selector links read beside the bound files: Service selector -> workloads as configured-path, NetworkPolicy allowed pairs as permission from the sending workload to the receiving one).
2. Shared hunks: adapters.ts one entry (.yaml, .yml), facts.ts AdapterName "kubernetes" and ParseFacts may answer undefined for a file that is not of its format, reader.ts reads such a file as text (and exports the listed-file text reader), code-facts index exports kubernetesLinks.
3. code-check: kubernetes-evidence.ts (pieces from the links; a reference to a Service no part binds reaches the workloads the Service selects), one line in check.ts; support.ts does not judge where a Kubernetes anchor's symbol is declared (the declaration that joins two parts, as Terraform).
4. Tests: code-facts/tests/kubernetes-facts.test.ts over fixtures/kubernetes-shop (Deployment, Service, Ingress, HTTPRoute, NetworkPolicy, ConfigMap through envFrom, Secret with tempting data/stringData and a secretKeyRef; multi-document; non-manifest YAML read as text); code-check/tests/kubernetes-check.test.ts (binding, anchor, undrawn, backwards; no secret in the outcome).
5. Try on GoogleCloudPlatform/microservices-demo kubernetes-manifests through a temporary vault; record in design-checks.md; authoring.md names Kubernetes addresses.
6. Gate lanes one at a time; commit through safe-commit.sh.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built: src/runtime/code-facts gains kubernetes-values.ts (values at a path; the Service an environment value names), kubernetes-pods.ts (what a pod names), kubernetes-model.ts (which YAML file is a manifest; its objects), kubernetes-adapter.ts (facts), kubernetes-resolution.ts (the per-pass manifest index and resolver), kubernetes-links.ts (joins by labels, exported). Shared hunks: one adapters.ts entry (.yaml, .yml), "kubernetes" in AdapterName, ParseFacts may answer undefined (facts.ts) and the reader then reads the file as text (reader.ts, which also exports readListed), code-facts/index.ts exports kubernetesLinks. code-check gains kubernetes-evidence.ts, one line in check.ts, and support.ts leaves a Kubernetes anchor's declaration unjudged as it leaves a Terraform one's.

Decisions the ADR left open:
1. Recognition: a .yaml/.yml file is a manifest when one of its documents is a mapping with string apiVersion and kind. Any other YAML file (workflows, OpenAPI, Chart.yaml, values.yaml) gets no facts and is read as text, as before: the adapter answers undefined and the reader falls back (the one contract change; no other adapter needed it). A file that does not parse as YAML is a manifest when a document writes apiVersion and kind at its top (a Helm template): one unparsed part, its key names only, with under "" so every address in it is unknown, never absent. Compose file names keep winning over the extension. JSON manifests are not read.
2. Address: Kind/name exactly as the manifest writes the kind (Deployment/checkout), no namespace, no group or version, no plural or short kind. The namespace is unknown to a check that reads no cluster (kubectl -n and Kustomize give it), and an address with it, or with apiVersion, would break when the manifests are applied another way or the API version moves. Every named object is a definition, not only the kinds the criteria list, so a part can bind a ServiceAccount or a CRD too. Objects of a List (kind List, ServiceList) are read from items. An object without metadata.name (a Kustomization, generateName) is no definition.
3. Visibility: a Service's type (ClusterIP, NodePort, LoadBalancer, ExternalName), exposed for LoadBalancer and NodePort; Ingress, Gateway and the Gateway API routes are "external" and exposed; everything else "cluster". No module-exposure rule is added.
4. Workloads: Pod, CronJob (its job template), and any object with spec.template.spec (Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, and CRDs shaped like them).
5. Configured paths from a pod (containers and initContainers): an env value naming a Service, valueFrom configMapKeyRef/secretKeyRef (to ConfigMap/Secret by name), envFrom configMapRef/secretRef, volumes configMap/secret/persistentVolumeClaim and projected sources. A ConfigMap's value under an env-name key names a Service the same way (from the ConfigMap). Calls: Ingress defaultBackend/backend and each rule path's backend (service.name, or serviceName of the old API), and each backendRefs of HTTPRoute, GRPCRoute, TLSRoute, TCPRoute, UDPRoute (kind defaults to Service). parentRefs are not read.
6. Environment value hosts: after a scheme or user, or before a port, or a bare word under a name ending HOST(S), HOSTNAME, SERVER(S), ADDR or ADDRESS (as compose). A Service host is name, or name.<ns>.svc[.<domain>]; a host of two names (example.com, also cart.shop) or whose third name is not svc is outside the cluster; localhost, numbers and YAML boolean words never are. $(VAR) is dropped (another variable's value).
7. Resolution: each named reference reaches its address through an import of its own; the resolver takes the nearest manifest that declares it: the file, its directory, then the manifests one directory step further, path order within a step. Namespaces do not steer it. An address no manifest declares gives no evidence.
8. Joins by labels (no address, so not references of one file): a Service selector -> each workload whose pod labels it matches (configured-path, from the Service); a NetworkPolicy -> permission from each sending workload to each receiving one (ingress: peer -> governed pods; egress: governed -> peer), the ADR's rule for a declaration that joins two other parts. Matching is matchLabels plus matchExpressions (In, NotIn, Exists, DoesNotExist); a selector picks among the manifests of the nearest directory step that holds any match. A peer named only by namespaceSelector or ipBlock is not read, and a namespaceSelector beside a podSelector is ignored. Joins are resolved: the cluster picks pods by exactly these labels. They are read from the manifests in the directories of the bound files (code-check kubernetes-evidence.ts through code-facts kubernetesLinks).
9. Through a Service: a reference from bound code to a Service that no part binds (as symbol or file) reaches the parts that own the workloads the Service picks, so web's CART_ADDR joins Deployment/web to Deployment/cart. A bound Service keeps the reference.
10. Anchors: a Kubernetes anchor names the declaration that joins two drawn workloads (a Service, an Ingress, a route, a policy), so, as for Terraform, the check does not judge where its symbol is declared (support.ts); ANCHOR_SYMBOL_MISSING and the evidence-kind half still apply.
11. Secrets: a Secret gives the names of its data/stringData keys (env-name shaped) and never a value; secretKeyRef gives the Secret's address and the env name; nothing decodes or scans a Secret value. envFrom is a reexport import whose names the resolver fills from the ConfigMap's or Secret's keys, under the prefix (the adapter writes the prefix as the import's one name "<prefix>*").
12. Kustomize: bases, overlays and patches are read as files, each object a definition of its own; no merge (kustomize never runs).

microservices-demo (38e7348, cloned to scratch): 103 tracked YAML files; 86 manifests (plain, release, Kustomize base/components/overlays, Istio), 17 read as text (workflows, Cloud Build, Chart.yaml, values.yaml), 13 Helm templates unparsed; 34 ms cold, 17-26 ms warm; 147 definitions, 55 configured paths and 4 calls by address, all resolved; 116 environment names; 40 Service-workload joins and 15 permissions by labels. Temporary vault, two boards, 18 parts bound to Deployments and one to the network-policies component directory, real checkCode 120 ms. kubernetes-manifests board: RELATIONSHIP_UNDRAWN on adservice from frontend (AD_SERVICE_ADDR through the unbound Service adservice, planted by leaving it out); RELATIONSHIP_BACKWARDS emailservice -> checkoutservice (planted); RELATIONSHIP_UNSUPPORTED paymentservice -> emailservice (planted); anchor Service/cartservice in frontend.yaml holds; ANCHOR_SYMBOL_MISSING Service/paymnt and BINDING_SYMBOL_MISSING Deployment/shoppingcart (planted); cartservice -> redis-cart supported by REDIS_ADDR. kustomize/base + network-policies board: paymentservice -> checkoutservice backwards, by PAYMENT_SERVICE_ADDR (configured path) and by NetworkPolicy/paymentservice (permission checkoutservice -> paymentservice); checkoutservice -> cartservice undrawn. Each right. SHOPPING_ASSISTANT_SERVICE_ADDR resolves to the optional shopping-assistant component's Service, the nearest declaration, though the default manifests do not deploy it.

For TASK-367.23: Kubernetes facts give, per workload (by line within its Kind/name span): environment references (the names it sets in env), configured-path references from an env value to Service/<name> at the same line, secretKeyRef/configMapKeyRef configured paths, and reexport imports (envFrom) whose resolved names are the keys of the ConfigMap or Secret under the prefix, never a value. A ConfigMap's env-name keys are environment references, and its values naming a Service are configured paths from the ConfigMap. Workloads run images, not directories, so no `runs` is set; the join needs code drawn inside a workload-bound part. kubernetesLinks gives the Service -> workload joins to pass a Service on to its workloads.

Closing: Archboard server@TASK-367.19 branched at v131 from TASK-367.11 after TASK-367.09; Code facts and Code check descriptions restated (each at the 2000-character limit, so other adapters' sentences were tightened without dropping a fact a reader needs); summary set to the board's scope; compare: 2 parts changed. check --code with and without --variant TASK-367.19: no line differs (server not restarted: the dogfood repository holds no manifest). Footprint against base 928602761 (the parent of 52c0d4500): namedAndChanged Code check (52c0d4500) and Code facts (52c0d4500; 8ca30b732 is TASK-367.20); changedNotNamed and namedNotChanged empty. Adopted at v137. ./bin/dogfood check: no diagnostics. Behind lists neither of this task's commits.

Independent review (2026-10-06), NOT CLEAN before fixes; fixed in ddf940725 (code, owners) and 6fd9d4a41 (docs).
1. A Helm template that parses as YAML ({{ .Values.x }} is a YAML mapping) was a manifest with no objects: false BINDING_SYMBOL_MISSING and ANCHOR_SYMBOL_MISSING warnings on argocd-example-apps helm-guestbook/templates/service.yaml. Now a Helm action where YAML expects a value, or in a kind or name, makes the file one part whose every address is unknown. 18 templates that parse, across kubernetes/examples, kustomize and argocd-example-apps, are now skipped; no plain manifest is taken for a template (block scalars and quoted Go templates are not actions).
2. Skip reason at the boundary with 0a89fab4d: the template's unknown part (under '') is reported as expression-not-followed, while authoring.md promised symbol-unparsed. Kept the one mechanism and named Helm templates under expression-not-followed in authoring.md, design-checks.md, archboard-dev and the skip schema; kubernetes-check.test.ts owns it.
3. An address that two manifests at the nearest step declare resolved to the first in path order, as resolved evidence: the wrong copy for 6 of 8 such references in kustomize's test data. It now resolves to neither.
4. A file whose documents Bun and the line reader count apart (%YAML directive, empty first document) gave Infinity lines, which the answer schema refuses, or was read as text with a Secret's values. Now one part whose addresses are unknown.
5. A file without 'apiVersion' is not parsed (a 4 MB lockfile cost 120 ms in each pass's index).
6. A template's unknown part kept its key names, including the left side of a key-shaped line inside a multi-line quoted value; it keeps none now (under '' already makes every symbol unknown).
Safety probes (facts JSON and check outcome): data, stringData, base64, a Secret in a List, a Secret in a Helm template that parses and one that does not, an apiVersion v1beta9 Secret, credential URLs in env values and ConfigMap values, a block-scalar credential: no value in any fact, link, finding, evidence symbol or skip detail; Bun's parse error is discarded. A Secret document whose apiVersion is not a string is no object, so a file of only such is read as text, as before this task. Owned by the extended secret test.
Judged, not changed: a Kustomization or kubeconfig is a manifest with no objects (decision 2); label joins and resolution ignore namespaces (0 joins across written namespaces in four repositories); nearest-step resolution can reach a sibling overlay; a NetworkPolicy rule without from/to (allow all) gives no permission; a two-name host is outside the cluster; the manifest index parses every manifest synchronously in a pass when an address does not resolve.
Gate after the fixes (shared tree): lint 0 and type-check 0 on re-run (first run failed only in language-servers and nix files of other agents); fmt:check fails only on two untracked t367-22-*.ts scratch files at the root; test:system 195/0; test:repository 20/0; test:serial-browser 24/0; test:modules first run 4227/5, all five in nix-facts and nix-check whose sources another agent had uncommitted, and they pass on re-run.

Module lane re-run after the other agent's Nix fix: 4244 pass, 0 fail.
<!-- SECTION:NOTES:END -->
