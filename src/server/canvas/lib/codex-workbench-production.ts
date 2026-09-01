import path from "node:path";
import { mkdirSync } from "node:fs";

import { resolveProjectCodexExecutable } from "../../../runtime/codex-process/executable.js";
import { createCodexWaitGraph } from "../../../runtime/codex-wait-graph/index.js";
import { createCoordinatorCallbackRealtimePort } from "../../../runtime/codex-coordinator-callbacks/index.js";
import {
	ArchboardContextSchema,
	type ArchboardContext,
} from "../../../runtime/codex-instructions/index.js";
import type {
	SemanticContextPublisherOptions,
	SettledSemanticChangeEvent,
} from "../../../runtime/codex-semantic-context/index.js";
import type { LogicalToolCallCorrelation } from "../../../shared/codex-workbench-identity/index.js";
import type { WorkhorseOperationBinding } from "../../../runtime/codex-workhorse-operations/index.js";
import { stateDir } from "../../../runtime/engine/state-dir.js";
import type {
	CodexWorkbenchComponents,
	CodexWorkbenchGenerationHooks,
	CodexWorkbenchGenerationInput,
	InstallProductionCodexWorkbenchOptions,
	ProductionCodexWorkbenchBindings,
} from "./codex-workbench.js";
import {
	createCanvasBrowserGatewayOptions,
	type CanvasBrowserBindingState,
} from "./codex-workbench-browser-gateway.js";
import {
	createCanvasDynamicApprovalOwner,
	type CanvasDynamicApprovalOwner,
} from "./codex-workbench-approvals.js";
import {
	createCanvasDynamicAuthorityAdapters,
	type CanvasDynamicAuthorityAdapters,
} from "./codex-workbench-authority.js";
import {
	createCanvasDynamicLifecycleOwner,
	createCanvasDynamicOperationIdAdapter,
	type CanvasDynamicLifecycleOwner,
} from "./codex-workbench-operation-lifecycle.js";

export interface CanvasCodexWorkbenchHost {
	readonly checkoutRoot: string;
	readonly semanticPublisher: SemanticContextPublisherOptions;
	readonly paneIds: () => readonly string[];
	readonly contextForEvent: (
		event: SettledSemanticChangeEvent,
		paneId: string,
		operation?: Omit<
			Extract<ArchboardContext["operation"], { readonly id: string; readonly outcome: null }>,
			"outcome"
		>,
	) => ArchboardContext;
	readonly contextForOperation: (
		authority: {
			readonly paneId: string;
			readonly childId: LogicalToolCallCorrelation["child"];
			readonly epoch: LogicalToolCallCorrelation["epoch"];
			readonly threadId: LogicalToolCallCorrelation["threadId"];
			readonly linkRevision?: number;
		},
		operation: Omit<
			Extract<ArchboardContext["operation"], { readonly id: string; readonly outcome: null }>,
			"outcome"
		>,
	) => ArchboardContext;
	readonly waitForTargets: Parameters<
		typeof createCanvasDynamicLifecycleOwner
	>[0]["waitForTargets"];
	readonly installIdentityDecoders: (identity: CodexWorkbenchComponents["identity"]) => void;
	readonly installLifecycleSignals: (components: CodexWorkbenchComponents) => () => void;
	readonly installBrowserGateway: (gateway: CodexWorkbenchComponents["gateway"]) => () => void;
	readonly stopBrowser: (gateway: CodexWorkbenchComponents["gateway"]) => Promise<void>;
	readonly stopRealtime: (realtime: CodexWorkbenchComponents["realtime"]) => Promise<void>;
	readonly stopQueue: (queue: CodexWorkbenchComponents["queue"]) => Promise<void> | void;
	readonly onFatal: (error: unknown) => void;
}

interface GenerationOwners {
	approval: CanvasDynamicApprovalOwner | null;
	authority: CanvasDynamicAuthorityAdapters | null;
	lifecycle: CanvasDynamicLifecycleOwner | null;
	currentCoordinatorCall: LogicalToolCallCorrelation | null;
	browserState: CanvasBrowserBindingState;
	approvalProjectionInstalled: boolean;
	projectionListeners: Set<() => void>;
	dynamicProjectionUnsubscribe: (() => void) | null;
}

function requireCreated<Name extends keyof CodexWorkbenchComponents>(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
	name: Name,
): CodexWorkbenchComponents[Name] {
	const component = created[name];
	if (component === undefined)
		throw new Error(`The production Codex ${name} dependency is not ready.`);
	return component;
}

function currentOperationBinding(
	created: Readonly<Partial<CodexWorkbenchComponents>>,
): WorkhorseOperationBinding | null {
	const workhorse = created.workhorse?.snapshot();
	const coordinator = created.coordinator?.snapshot();
	if (
		workhorse?.state !== "ready" ||
		coordinator?.state !== "ready" ||
		workhorse.threadId === null ||
		workhorse.childId === null ||
		workhorse.epoch === null ||
		workhorse.operationId === null ||
		coordinator.threadId === null ||
		coordinator.childId === null ||
		coordinator.epoch === null ||
		coordinator.operationId === null ||
		coordinator.childId !== workhorse.childId ||
		coordinator.epoch !== workhorse.epoch
	)
		return null;
	return {
		childId: workhorse.childId,
		epoch: workhorse.epoch,
		coordinator: {
			threadId: coordinator.threadId,
			childId: coordinator.childId,
			epoch: coordinator.epoch,
			operationId: coordinator.operationId,
		},
		workhorse: {
			threadId: workhorse.threadId,
			childId: workhorse.childId,
			epoch: workhorse.epoch,
			operationId: workhorse.operationId,
		},
	};
}

function currentRealtimeGeneration(created: Readonly<Partial<CodexWorkbenchComponents>>) {
	const generation = created.realtime?.generation();
	return generation === null || generation === undefined
		? null
		: {
				childId: generation.child,
				epoch: generation.epoch,
				coordinatorThreadId: generation.coordinatorThreadId,
				wireSessionId: generation.wireSessionId,
				browserSessionId: generation.browserSessionId,
				browserCorrelationId: generation.browserCorrelationId,
			};
}

/** Build the one mandatory real production installation used by the canvas application. */
export function createCanvasCodexWorkbenchInstallation(
	host: CanvasCodexWorkbenchHost,
): InstallProductionCodexWorkbenchOptions {
	const root = path.join(stateDir(), "codex-workbench");
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const codexHome = path.join(root, "codex-home");
	const sqliteHome = path.join(root, "sqlite-home");
	const epochRoot = path.join(root, "epoch");
	const waitGraph = createCodexWaitGraph();
	const byGeneration = new Map<number, GenerationOwners>();
	const ownersFor = (input: CodexWorkbenchGenerationInput): GenerationOwners => {
		let owners = byGeneration.get(input.generation);
		if (owners === undefined) {
			owners = {
				approval: null,
				authority: null,
				lifecycle: null,
				currentCoordinatorCall: null,
				approvalProjectionInstalled: false,
				projectionListeners: new Set(),
				dynamicProjectionUnsubscribe: null,
				browserState: {
					readiness: { kind: "readiness", state: "initialized" },
					account: {
						kind: "account",
						state: "unknown",
						reason: "Account state has not been read.",
					},
					login: { kind: "login", state: "idle" },
					queue: { kind: "queue", status: "unavailable", entries: [] },
				},
			};
			byGeneration.set(input.generation, owners);
		}
		return owners;
	};

	const bindings = (input: CodexWorkbenchGenerationInput): ProductionCodexWorkbenchBindings => {
		const owners = ownersFor(input);
		const requireOwners = (created: Readonly<Partial<CodexWorkbenchComponents>>) => {
			if (owners.authority === null) {
				if (
					created.identity === undefined ||
					created.epoch === undefined ||
					created.threadLink === undefined
				)
					throw new Error("Dynamic authority dependencies are not ready.");
				owners.authority = createCanvasDynamicAuthorityAdapters({
					identity: created.identity,
					epoch: created.epoch,
					threadLink: created.threadLink,
					paneIds: host.paneIds,
					contextFor: (context) => {
						const captured = host.contextForOperation(
							{
								paneId: context.authority.paneId,
								childId: context.authority.childId,
								epoch: context.authority.epoch,
								threadId: context.authority.threadId,
							},
							{
								id: context.operationId,
								kind: context.kind,
								rpc: "turn/start",
							},
						);
						return ArchboardContextSchema.parse({
							...captured,
							workhorse: {
								threadId: context.caller.wireThreadId,
								turnId: context.caller.wireTurnId,
							},
						});
					},
				});
			}
			if (owners.approval === null) {
				const identity = requireCreated(created, "identity");
				owners.approval = createCanvasDynamicApprovalOwner({
					identity,
					now: () => Date.now(),
					bindingForCaller: (threadId) => {
						const paneId = owners.authority!.paneForThread(threadId);
						if (paneId === null) throw new Error("The dynamic caller has no live pane binding.");
						return {
							commandId: identity.identity.issuer.mintBrowserCommandId(),
							paneId,
							capturedLink: {
								threadId,
								childId: identity.identity.validator.childId,
								epoch: identity.identity.validator.epoch,
							},
						};
					},
				});
				owners.dynamicProjectionUnsubscribe = owners.approval.subscribe(() => {
					if (!owners.approvalProjectionInstalled) return;
					for (const listener of owners.projectionListeners) listener();
				});
			}
			if (owners.lifecycle === null) {
				owners.lifecycle = createCanvasDynamicLifecycleOwner({
					waitGraph,
					waitForTargets: host.waitForTargets,
					shutdownEpoch: async (child, epoch) => {
						await input.process.stop();
						return { child, epoch, sessionClosed: true, transportClosed: true };
					},
					onFatal: host.onFatal,
				});
			}
			return {
				authority: owners.authority,
				approval: owners.approval,
				lifecycle: owners.lifecycle,
			};
		};
		return {
			epoch: () => ({ rootDirectory: epochRoot, codexHome, sqliteHome }),
			transport: () => ({ child: input.child }),
			session: () => ({
				storage: { codexHome, sqliteHome, configPath: path.join(codexHome, "config.toml") },
				checkoutRoot: host.checkoutRoot,
				lifecycle: input.child.lifecycle,
			}),
			threadLink: (created) => ({
				currentEpoch: () => created.epoch?.snapshot().manifest.activeEpoch ?? null,
			}),
			workhorse: () => ({ checkoutRoot: host.checkoutRoot }),
			semanticPublisher: () => host.semanticPublisher,
			realtime: (created) => ({
				freshSemanticBrief: () => requireCreated(created, "semanticPublisher").freshBrief().brief,
				currentBinding: () => {
					const workhorse = created.workhorse?.snapshot();
					const coordinator = created.coordinator?.snapshot();
					if (
						workhorse?.state !== "ready" ||
						coordinator?.state !== "ready" ||
						workhorse.childId === null ||
						workhorse.epoch === null ||
						workhorse.threadId === null ||
						coordinator.threadId === null
					)
						return null;
					return {
						child: workhorse.childId,
						epoch: workhorse.epoch,
						linkedThreadId: workhorse.threadId,
						coordinatorThreadId: coordinator.threadId,
					};
				},
			}),
			approvals: (created) => ({
				onError: host.onFatal,
				getCurrentBinding: (request) => {
					const binding = created.semanticDelivery?.snapshot().binding ?? null;
					return binding?.target.threadId === request.threadId
						? { link: `pane:${binding.paneId}` }
						: { link: null };
				},
				onChange: () => {
					if (!owners.approvalProjectionInstalled) return;
					for (const listener of owners.projectionListeners) listener();
				},
			}),
			dynamicAdapters: {
				approval: (created) => requireOwners(created).approval.port,
				threadAuthority: (created) => requireOwners(created).authority.thread,
				context: (created) => requireOwners(created).authority.context,
				operationId: (created) => {
					if (created.identity === undefined) throw new Error("Operation authority is not ready.");
					return createCanvasDynamicOperationIdAdapter(created.identity.operation);
				},
				lifecycle: (created) => requireOwners(created).lifecycle.port,
			},
			dynamicTools: () => ({ waitGraph, checkoutRoot: host.checkoutRoot }),
			semanticDelivery: (created) => ({
				feedId: host.semanticPublisher.feedId,
				now: () => Date.now(),
				publisher: requireCreated(created, "semanticPublisher"),
				currentExecution: () => ({
					childId: requireCreated(created, "identity").identity.validator.childId,
					epoch: requireCreated(created, "identity").identity.validator.epoch,
				}),
				hooks: {
					contextForEvent: (event, binding) => host.contextForEvent(event, binding.paneId),
				},
				retireEpoch: () => requireCreated(created, "epoch").close(),
			}),
			coordinator: () => ({ checkoutRoot: host.checkoutRoot }),
			queue: (created) => ({
				currentBinding: () => {
					const workhorse = created.workhorse?.snapshot();
					const coordinator = created.coordinator?.snapshot();
					if (
						workhorse?.state !== "ready" ||
						coordinator?.state !== "ready" ||
						workhorse.childId === null ||
						workhorse.epoch === null ||
						workhorse.threadId === null ||
						coordinator.threadId === null
					)
						return null;
					return {
						childId: workhorse.childId,
						epoch: workhorse.epoch,
						coordinatorThreadId: coordinator.threadId,
						workhorseThreadId: workhorse.threadId,
					};
				},
			}),
			operations: (created) => ({
				currentBinding: () => currentOperationBinding(created),
				currentCoordinatorCall: () => owners.currentCoordinatorCall,
				contextFor: (operation) => {
					const workhorse = requireCreated(created, "workhorse").snapshot();
					if (
						workhorse.state !== "ready" ||
						workhorse.paneId === null ||
						workhorse.childId === null ||
						workhorse.epoch === null ||
						workhorse.threadId === null
					)
						throw new Error("A workhorse operation has no exact proven pane target.");
					return host.contextForOperation(
						{
							paneId: workhorse.paneId,
							childId: workhorse.childId,
							epoch: workhorse.epoch,
							threadId: workhorse.threadId,
							linkRevision: workhorse.binding?.revision,
						},
						{
							id: operation.operationId,
							kind: operation.kind,
							rpc: operation.rpc,
						},
					);
				},
			}),
			spokenApproval: (created) => ({
				currentRealtime: () => {
					const generation = created.realtime?.generation();
					return generation === null || generation === undefined
						? null
						: {
								sessionId: generation.browserSessionId,
								correlationId: generation.browserCorrelationId,
							};
				},
			}),
			coordinatorTools: (created) => ({
				authority: {
					currentCoordinator: () => created.coordinator?.snapshot() ?? null,
					currentWorkhorseBinding: () => currentOperationBinding(created),
					currentCall: () => owners.currentCoordinatorCall,
					expectedTurnId: () => owners.currentCoordinatorCall?.turnId ?? null,
				},
			}),
			coordinatorCall: {
				run: async (request, operation) => {
					owners.currentCoordinatorCall = request.logicalCall;
					try {
						return await operation();
					} finally {
						if (owners.currentCoordinatorCall === request.logicalCall)
							owners.currentCoordinatorCall = null;
					}
				},
			},
			callbacks: (created) => ({
				semantic: requireCreated(created, "semanticPublisher"),
				realtime: createCoordinatorCallbackRealtimePort({
					session: requireCreated(created, "session"),
					currentGeneration: () => currentRealtimeGeneration(created),
				}),
				currentChild: () => ({
					childId: requireCreated(created, "identity").identity.validator.childId,
					epoch: requireCreated(created, "identity").identity.validator.epoch,
				}),
				currentCoordinator: () => {
					const snapshot = created.coordinator?.snapshot();
					if (
						snapshot?.state !== "ready" ||
						snapshot.threadId === null ||
						snapshot.childId === null ||
						snapshot.epoch === null
					)
						return null;
					return {
						...snapshot,
						state: "ready" as const,
						threadId: snapshot.threadId,
						childId: snapshot.childId,
						epoch: snapshot.epoch,
					};
				},
				currentWorkhorseLink: () => {
					const workhorse = created.workhorse?.snapshot();
					if (
						workhorse?.state !== "ready" ||
						workhorse.binding === null ||
						workhorse.threadId === null ||
						workhorse.childId === null ||
						workhorse.epoch === null ||
						workhorse.operationId === null
					)
						return null;
					return {
						binding: workhorse.binding,
						target: {
							threadId: workhorse.threadId,
							childId: workhorse.childId,
							epoch: workhorse.epoch,
							operationId: workhorse.operationId,
						},
					};
				},
				currentRealtimeGeneration: () => currentRealtimeGeneration(created),
			}),
			gateway: (created) => {
				const dynamic = requireOwners(created).approval;
				return createCanvasBrowserGatewayOptions({
					components: created,
					dynamicApprovals: dynamic,
					state: owners.browserState,
					checkoutRoot: host.checkoutRoot,
					contextForOperation: (context, operation) =>
						host.contextForOperation(
							{
								paneId: context.paneId,
								childId: context.childId,
								epoch: context.epoch,
								threadId: context.link.threadId!,
								linkRevision: context.linkRevision,
							},
							operation,
						),
					onChange: (listener) => {
						owners.projectionListeners.add(listener);
						return () => void owners.projectionListeners.delete(listener);
					},
				});
			},
		};
	};

	const hooks = (input: CodexWorkbenchGenerationInput): CodexWorkbenchGenerationHooks => ({
		threadContext: {
			contextForEvent: (event, binding) => host.contextForEvent(event, binding.paneId),
		},
		installIdentityDecoders: host.installIdentityDecoders,
		installLifecycleSignals: host.installLifecycleSignals,
		installApprovalProjection: () => {
			const owners = ownersFor(input);
			if (owners.approvalProjectionInstalled)
				throw new Error("The Codex approval projection is already installed.");
			owners.approvalProjectionInstalled = true;
			return () => {
				owners.approvalProjectionInstalled = false;
			};
		},
		installBrowserGateway: host.installBrowserGateway,
		initializeSession: async (session, components) => {
			const epochSnapshot = components.epoch.snapshot();
			components.epoch.startEpoch({
				childId: components.identity.identity.validator.childId,
				epoch: components.identity.identity.validator.epoch,
				operationId: components.identity.operation.issuer.mintOperationId(),
				kind: "epoch_start",
				rpc: "epoch/start",
				workspaceRoot: host.checkoutRoot,
				// Epoch ownership has no remote instruction or tool-manifest effect.
				instructionHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
				manifestHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
				...(epochSnapshot.manifest.activeEpoch === null ? {} : { expected: epochSnapshot.cas }),
			});
			await session.initialize();
			input.child.lifecycle.markAppServerReady();
			const account = await session.accountRead();
			const owners = ownersFor(input);
			owners.browserState.account =
				account.account === null
					? { kind: "account", state: "signed_out" }
					: { kind: "account", state: "ready", accountType: account.account.type };
			owners.browserState.readiness =
				account.account === null
					? { kind: "readiness", state: "signed_out" }
					: { kind: "readiness", state: "thread_capable" };
			if (account.account !== null) {
				input.child.lifecycle.markAccountReady();
				const coordinator = await components.coordinator.ensure({
					operationId: components.identity.operation.issuer.mintOperationId(),
				});
				if (coordinator.state !== "ready")
					throw new Error(
						coordinator.reason ?? "The production Codex coordinator did not become ready.",
					);
			}
		},
		stopBrowser: host.stopBrowser,
		stopRealtime: host.stopRealtime,
		stopQueue: host.stopQueue,
		cancelDynamicApprovalsAndWaits: async (_components, cause) => {
			const owners = ownersFor(input);
			owners.approval?.settleAll(cause);
			await owners.lifecycle?.shutdown();
			owners.authority?.dispose();
			owners.dynamicProjectionUnsubscribe?.();
			owners.dynamicProjectionUnsubscribe = null;
			owners.projectionListeners.clear();
		},
		settleOrdinaryRequests: async (approvals, cause) => {
			for (const snapshot of approvals.inspect()) {
				if (snapshot.state === "pending")
					await approvals.cancel(
						snapshot.requestId,
						cause === "host_shutdown" ? "host shutdown" : "child disconnected",
					);
			}
		},
	});

	return {
		process: {
			executablePath: resolveProjectCodexExecutable(),
			checkoutRoot: host.checkoutRoot,
			storage: { rootDirectory: root },
		},
		bindings,
		hooks,
	};
}
