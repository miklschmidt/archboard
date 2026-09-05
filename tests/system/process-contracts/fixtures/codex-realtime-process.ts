import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
	createCodexProcess,
	type CodexProcess,
	type CodexProcessChild,
} from "../../../../src/runtime/codex-process/index.ts";
import {
	createCodexRealtimeAdapter,
	type CodexRealtimeAdapter,
	type CodexRealtimeBinding,
} from "../../../../src/runtime/codex-realtime/index.ts";
import {
	createCodexSession,
	type CodexSession,
} from "../../../../src/runtime/codex-session/index.ts";
import {
	createCodexTransport,
	type CodexTransport,
	type CodexTransportChild,
} from "../../../../src/runtime/codex-transport/index.ts";
import {
	createIdentityAuthority,
	type IdentityAuthority,
	type WireRequestCorrelation,
} from "../../../../src/shared/codex-workbench-identity/index.ts";
import type { RealtimeSemanticEvent } from "../../../../src/shared/codex-realtime-host/index.ts";

const repoRoot = resolve(import.meta.dir, "../../../..");
const CODEX_VERSION = "codex-cli 0.151.0";
const DEFAULTS = {
	startEvents: [
		{ method: "thread/realtime/sdp", params: { threadId: "$THREAD", sdp: "answer-sdp" } },
		{
			method: "thread/realtime/started",
			params: { threadId: "$THREAD", realtimeSessionId: "$SESSION", version: "v3" },
		},
	],
	afterStartEvents: [],
	pages: [],
	exitOn: null,
	drop: [],
};

export type FixtureControl = {
	readonly startEvents?: readonly {
		readonly method: string;
		readonly params: unknown;
		readonly delayMs?: number;
	}[];
	readonly afterStartEvents?: readonly {
		readonly method: string;
		readonly params: unknown;
		readonly delayMs?: number;
	}[];
	readonly pages?: readonly unknown[];
	readonly startDelayMs?: number;
	readonly exitOn?: string | null;
	readonly drop?: readonly string[];
};

export interface Generation {
	readonly identity: IdentityAuthority;
	readonly binding: CodexRealtimeBinding;
	readonly transport: CodexTransport;
	readonly session: CodexSession;
	readonly adapter: CodexRealtimeAdapter;
	readonly ready: Promise<void>;
	readonly readyState: { settled: boolean };
}

export interface RealtimeHarness {
	readonly root: string;
	readonly controlPath: string;
	readonly logPath: string;
	readonly owner: CodexProcess;
	readonly generations: Generation[];
	readonly events: RealtimeSemanticEvent[];
	readonly start: () => Promise<Generation>;
	readonly setControl: (control: FixtureControl) => void;
	readonly close: () => Promise<void>;
}

class PublicChildBridge extends EventEmitter implements CodexTransportChild {
	exitCode: number | null = null;
	signalCode: NodeJS.Signals | null = null;
	readonly stdin: CodexProcessChild["stdin"];
	readonly stdout: CodexProcessChild["stdout"];
	readonly stderr: CodexProcessChild["stderr"];

	constructor(child: CodexProcessChild) {
		super();
		this.stdin = child.stdin;
		this.stdout = child.stdout;
		this.stderr = child.stderr;
	}
}

const FAKE_CODEX_SOURCE = (
	logPath: string,
	controlPath: string,
	version: string,
): string => `#!${process.execPath}
const fs=require("node:fs"),logPath=${JSON.stringify(logPath)},controlPath=${JSON.stringify(controlPath)},version=${JSON.stringify(version)};
const expectedArgs=JSON.stringify(["app-server","--stdio","--strict-config"]); let pageIndex=0,realtimeSessionId="";
const record=value=>fs.appendFileSync(logPath,JSON.stringify(value)+"\\n");
const control=()=>{try{return JSON.parse(fs.readFileSync(controlPath,"utf8"));}catch{return {};}};
const replace=(value,sessionId,threadId)=>JSON.parse(JSON.stringify(value).replaceAll("$SESSION",sessionId).replaceAll("$THREAD",threadId));
const send=value=>process.stdout.write(JSON.stringify(value)+"\\n");
const response=(frame,result)=>{record({kind:"response",method:frame.method,result});send({id:frame.id,result});};
const notification=(method,params)=>{record({kind:"notification",method,params});send({method,params});};
const configResponse=()=>({config:{model:null,review_model:null,model_context_window:null,model_auto_compact_token_limit:null,model_auto_compact_token_limit_scope:null,model_provider:null,approval_policy:null,approvals_reviewer:null,sandbox_mode:null,sandbox_workspace_write:null,forced_chatgpt_workspace_id:null,forced_login_method:null,web_search:null,tools:null,instructions:null,developer_instructions:null,compact_prompt:null,model_reasoning_effort:null,model_reasoning_summary:null,model_verbosity:null,service_tier:null,analytics:null,apps:null,browser_use:null,computer_use:null,desktop:null,sqlite_home:process.env.CODEX_SQLITE_HOME},origins:{sqlite_home:{name:{type:"user",file:process.env.CODEX_HOME+"/config.toml",profile:null},version:"fixture"}},layers:null});
function handle(frame){record({kind:"frame",frame});
if(frame.method==="initialize"){response(frame,{userAgent:"Codex Desktop/0.151.0",codexHome:process.env.CODEX_HOME,platformFamily:"unix",platformOs:"linux"});return;}
if(frame.method==="initialized")return;
if(frame.method==="configRequirements/read"){response(frame,{requirements:null});return;}
if(frame.method==="config/read"){response(frame,configResponse());return;}
if(frame.method==="account/read"){response(frame,{account:{type:"chatgpt",email:null,planType:"pro"},requiresOpenaiAuth:true});return;}
const current=control();record({kind:"request",method:frame.method,params:frame.params});
if(frame.method==="thread/realtime/start"){realtimeSessionId=frame.params.realtimeSessionId;response(frame,{});const emitEvents=values=>{let delay=0;for(const event of values){delay+=event.delayMs??0;setTimeout(()=>notification(event.method,replace(event.params,realtimeSessionId,frame.params.threadId)),delay);}};const emitStart=()=>{const latest=control();emitEvents(latest.startEvents??${JSON.stringify(DEFAULTS.startEvents)});emitEvents(latest.afterStartEvents??[]);};if(current.startDelayMs)setTimeout(emitStart,current.startDelayMs);else emitStart();return;}
if(frame.method==="thread/timeline/list"){const pages=current.pages??[];const page=pages[pageIndex++]??{data:[],nextCursor:null,activeRealtimeSessionAtPageStart:null};response(frame,replace(page,realtimeSessionId,frame.params.threadId));return;}
if(current.exitOn===frame.method){process.exit(17);return;} if((current.drop??[]).includes(frame.method))return; response(frame,{});
}
if(process.argv[2]==="--version"){record({kind:"version_probe",args:process.argv.slice(2),version});process.stdout.write(version+"\\n");process.exit(0);} if(JSON.stringify(process.argv.slice(2))!==expectedArgs){process.stderr.write("argv rejected\\n");process.exit(9);}
record({kind:"app_server_spawn",args:process.argv.slice(2)});
let input="";process.stdin.on("data",chunk=>{input+=chunk.toString();let newline;while((newline=input.indexOf("\\n"))>=0){const line=input.slice(0,newline);input=input.slice(newline+1);if(!line.trim())continue;try{handle(JSON.parse(line));}catch(error){record({kind:"fixture-error",message:String(error),stack:error&&error.stack});process.stderr.write(String(error)+"\\n");process.exit(19);}}});process.stdin.resume();
`;

function sleep(milliseconds: number): Promise<void> {
	return new Promise((done) => setTimeout(done, milliseconds));
}

export async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		if (Date.now() >= deadline) {
			throw new Error("Timed out waiting for the realtime process fixture.");
		}
		await sleep(10);
	}
}

function writeControl(path: string, control: FixtureControl, threadId = "$THREAD"): void {
	writeFileSync(path, JSON.stringify({ ...DEFAULTS, ...control }).replaceAll("$THREAD", threadId));
}

function makeBinding(identity: IdentityAuthority): CodexRealtimeBinding {
	const ids = identity.decoder.adoptCodexResponseIdentities({
		threadIds: ["linked-thread", "coordinator-thread", "other-thread"],
	});
	const linkedThreadId = ids.threadIds[0];
	const coordinatorThreadId = ids.threadIds[1];
	if (!linkedThreadId || !coordinatorThreadId) {
		throw new Error("Fixture thread identities were not issued.");
	}
	return {
		child: identity.validator.childId,
		epoch: identity.validator.epoch,
		linkedThreadId,
		coordinatorThreadId,
	};
}

export function makeNotification(
	identity: IdentityAuthority,
	method: string,
	params: unknown,
	overrides: Partial<Pick<WireRequestCorrelation, "child" | "epoch">> = {},
): Parameters<CodexRealtimeAdapter["onNotification"]>[0] {
	return {
		correlation: {
			child: overrides.child ?? identity.validator.childId,
			epoch: overrides.epoch ?? identity.validator.epoch,
			requestId: null,
		},
		notification: { method, params } as never,
	} as Parameters<CodexRealtimeAdapter["onNotification"]>[0];
}

function writeFakeExecutable(
	root: string,
	logPath: string,
	controlPath: string,
	version: string,
): string {
	const executable = join(root, "codex-fixture");
	writeFileSync(executable, FAKE_CODEX_SOURCE(logPath, controlPath, version), { mode: 0o700 });
	chmodSync(executable, 0o700);
	return executable;
}

export async function createHarness(
	control: FixtureControl = {},
	options: { readonly version?: string } = {},
): Promise<RealtimeHarness> {
	const root = mkdtempSync(join(tmpdir(), "archboard-codex-realtime-process-"));
	const controlPath = join(root, "control.json");
	const logPath = join(root, "requests.ndjson");
	writeFileSync(logPath, "");
	writeControl(controlPath, control);
	const owner = createCodexProcess({
		executablePath: writeFakeExecutable(
			root,
			logPath,
			controlPath,
			options.version ?? CODEX_VERSION,
		),
		checkoutRoot: repoRoot,
		storage: { rootDirectory: join(root, "storage") },
	});
	const generations: Generation[] = [];
	const events: RealtimeSemanticEvent[] = [];
	let current: Generation | null = null;
	let closed = false;
	let controlState = control;
	let bridge: PublicChildBridge | null = null;
	let bridgeExitForwarded = false;
	const unsubscribeSnapshot = owner.subscribe((snapshot) => {
		if (!bridge || bridgeExitForwarded || snapshot.pid !== null || snapshot.lastExit === null) {
			return;
		}
		bridgeExitForwarded = true;
		bridge.emit("exit", snapshot.lastExit.code, snapshot.lastExit.signal);
	});
	const unsubscribeChild = owner.onChild((child) => {
		bridge = new PublicChildBridge(child);
		bridgeExitForwarded = false;
		const identity = createIdentityAuthority();
		const binding = makeBinding(identity);
		writeControl(
			controlPath,
			controlState,
			identity.decoder.serializeCodexIdentity(binding.coordinatorThreadId),
		);
		const readyState = { settled: false };
		let adapter!: CodexRealtimeAdapter;
		bridge.stdout.prependOnceListener("end", () => bridge?.emit("exit", null, null));
		const transport = createCodexTransport({ child: bridge, identity });
		const session = createCodexSession({
			transport,
			identity,
			storage: {
				codexHome: join(root, "storage/codex-home"),
				sqliteHome: join(root, "storage/sqlite-home"),
				configPath: join(root, "storage/codex-home/config.toml"),
			},
			checkoutRoot: repoRoot,
			lifecycle: child.lifecycle,
			onNotification: (event) => adapter.onNotification(event),
		});
		const generation = {
			identity,
			binding,
			transport,
			session,
			adapter: undefined as never,
			ready: undefined as never,
			readyState,
		} as Generation;
		adapter = createCodexRealtimeAdapter({
			session,
			identity,
			freshSemanticBrief: () => '{"source":"fresh-process-brief","board":"Architecture"}',
			currentBinding: () => (current === generation && !closed ? binding : null),
		});
		Object.assign(generation, { adapter });
		adapter.onSemanticEvent((event) => events.push(event));
		current = generation;
		generations.push(generation);
		const ready = (async () => {
			await session.initialize();
			await session.accountRead();
		})().finally(() => {
			readyState.settled = true;
		});
		Object.assign(generation, { ready });
		void ready.catch(() => undefined);
		transport.onExit(() => {
			if (current === generation) {
				current = null;
			}
			adapter.dispose();
			void transport.shutdown().catch(() => undefined);
		});
	});

	const start = async (): Promise<Generation> => {
		const processReady = owner.start();
		await waitFor(() => generations.length > 0);
		const generation = generations.at(-1);
		if (!generation) {
			throw new Error("The Codex process did not publish a generation.");
		}
		await generation.ready.catch((error) => {
			throw new Error(
				`Fixture session setup failed: ${String(error)}\\n${readFileSync(logPath, "utf8")}`,
				{
					cause: error,
				},
			);
		});
		await processReady.catch((error) => {
			throw new Error(
				`Fixture process setup failed: ${String(error)}\\n${readFileSync(logPath, "utf8")}`,
				{
					cause: error,
				},
			);
		});
		return generation;
	};
	const setControl = (next: FixtureControl): void => {
		controlState = next;
		writeControl(
			controlPath,
			next,
			current
				? current.identity.decoder.serializeCodexIdentity(current.binding.coordinatorThreadId)
				: "$THREAD",
		);
	};
	const close = async (): Promise<void> => {
		if (closed) {
			return;
		}
		closed = true;
		current = null;
		for (const generation of generations) {
			generation.adapter.dispose();
		}
		let stopError: unknown;
		try {
			await owner.stop();
		} catch (error) {
			stopError = error;
		}
		unsubscribeSnapshot();
		unsubscribeChild();
		for (const generation of generations) {
			await generation.ready.catch(() => undefined);
			await generation.transport.shutdown().catch(() => undefined);
			expectCleanup(generation);
		}
		expectCleanupOwner(owner, stopError);
		const cleanupLog = stopError ? readFileSync(logPath, "utf8") : "";
		rmSync(root, { recursive: true, force: true });
		if (existsSync(root)) {
			throw new Error("Fixture temporary root survived cleanup.");
		}
		if (stopError) {
			throw new Error(`Fixture cleanup failed: ${String(stopError)}\\n${cleanupLog}`, {
				cause: stopError,
			});
		}
	};
	return { root, controlPath, logPath, owner, generations, events, start, setControl, close };
}

function expectCleanup(generation: Generation): void {
	if (!generation.readyState.settled) {
		throw new Error("Fixture generation setup did not settle.");
	}
	const inspect = generation.transport.inspect();
	if (
		inspect.state !== "closed" ||
		inspect.pendingRequests !== 0 ||
		inspect.pendingReverseRequests !== 0 ||
		inspect.queuedFrames !== 0 ||
		inspect.queuedBytes !== 0
	) {
		throw new Error(`Fixture transport retained work: ${JSON.stringify(inspect)}`);
	}
}

function expectCleanupOwner(owner: CodexProcess, stopError: unknown): void {
	if (owner.currentChild() !== null) {
		throw new Error("Fixture child survived cleanup.");
	}
	if (stopError) {
		return;
	}
	const snapshot = owner.snapshot();
	if (
		snapshot.state !== "stopped" ||
		snapshot.nextRestartAtMs !== null ||
		snapshot.restartDelayMs !== null
	) {
		throw new Error(`Fixture process retained lifecycle state: ${JSON.stringify(snapshot)}`);
	}
}

export async function withHarness(
	control: FixtureControl,
	operation: (harness: RealtimeHarness, generation: Generation) => Promise<void>,
): Promise<void> {
	const harness = await createHarness(control);
	try {
		const generation = await harness.start();
		await operation(harness, generation);
	} finally {
		await harness.close();
	}
}

export function latestState(harness: RealtimeHarness) {
	for (let index = harness.events.length - 1; index >= 0; index -= 1) {
		const event = harness.events[index];
		if (event?.kind === "state") {
			return event.state;
		}
	}
	throw new Error("The realtime harness has not emitted a state.");
}

export async function waitForState(harness: RealtimeHarness): Promise<void> {
	await waitFor(() => latestState(harness).phase === "recoverable_error");
}

export async function waitForGenerations(harness: RealtimeHarness, count: number): Promise<void> {
	await waitFor(() => harness.generations.length === count);
}
