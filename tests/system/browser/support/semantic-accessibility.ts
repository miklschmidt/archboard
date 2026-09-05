import type { AgentBrowserSession } from "./agent-browser.ts";

interface SemanticAccessibilitySnapshot {
	atomic: boolean | null;
	ignored: boolean;
	live: string | null;
	name: string | null;
	role: string | null;
}

export async function readSemanticAccessibility(
	browser: AgentBrowserSession,
): Promise<SemanticAccessibilitySnapshot> {
	const currentUrl = await browser.eval<string>("location.href");
	const output = await browser.run(["get", "cdp-url"]);
	const endpoint = output.match(/ws:\/\/[^\s"']+/)?.[0];
	if (!endpoint) {
		throw new Error(`agent-browser returned no CDP endpoint: ${output.trim()}`);
	}
	const socket = new WebSocket(endpoint);
	await new Promise<void>((resolve, reject) => {
		socket.addEventListener("open", () => resolve(), { once: true });
		socket.addEventListener("error", () => reject(new Error("could not open page CDP socket")), {
			once: true,
		});
	});
	let nextId = 14_309;
	const pending = new Map<
		number,
		{ resolve: (result: Record<string, unknown>) => void; reject: (error: Error) => void }
	>();
	socket.addEventListener("message", (event) => {
		const message = JSON.parse(String(event.data)) as {
			id?: number;
			result?: Record<string, unknown>;
			error?: { message?: string };
		};
		if (message.id === undefined) {
			return;
		}
		const request = pending.get(message.id);
		if (!request) {
			return;
		}
		pending.delete(message.id);
		if (message.error) {
			request.reject(new Error(message.error.message ?? "CDP command failed"));
		} else {
			request.resolve(message.result ?? {});
		}
	});
	const command = (
		method: string,
		params: Record<string, unknown> = {},
		sessionId?: string,
	): Promise<Record<string, unknown>> => {
		const id = nextId++;
		const response = new Promise<Record<string, unknown>>((resolve, reject) => {
			pending.set(id, { resolve, reject });
		});
		socket.send(JSON.stringify({ id, method, params, sessionId }));
		return response;
	};
	let sessionId: string | undefined;
	try {
		const targets = (await command("Target.getTargets")) as {
			targetInfos?: Array<{ targetId: string; type: string; url: string }>;
		};
		const page = targets.targetInfos?.find(
			({ type, url }) => type === "page" && url === currentUrl,
		);
		if (!page) {
			throw new Error(`CDP browser target has no page for ${currentUrl}`);
		}
		const attached = (await command("Target.attachToTarget", {
			targetId: page.targetId,
			flatten: true,
		})) as { sessionId?: string };
		sessionId = attached.sessionId;
		if (!sessionId) {
			throw new Error("CDP did not attach to the shell page");
		}
		const evaluated = (await command(
			"Runtime.evaluate",
			{ expression: 'document.querySelector(".workbench-semantic-announcer")' },
			sessionId,
		)) as { result?: { objectId?: string } };
		const objectId = evaluated.result?.objectId;
		if (!objectId) {
			throw new Error("semantic announcer is absent from the browser page");
		}
		const tree = (await command(
			"Accessibility.getPartialAXTree",
			{ fetchRelatives: false, objectId },
			sessionId,
		)) as {
			nodes?: Array<{
				ignored?: boolean;
				name?: { value?: string };
				properties?: Array<{ name?: string; value?: { value?: boolean | string } }>;
				role?: { value?: string };
			}>;
		};
		const node = tree.nodes?.[0];
		if (!node) {
			throw new Error("semantic announcer is absent from the accessibility tree");
		}
		const property = (name: string): boolean | string | null =>
			node.properties?.find((candidate) => candidate.name === name)?.value?.value ?? null;
		return {
			atomic: property("atomic") as boolean | null,
			ignored: node.ignored === true,
			live: property("live") as string | null,
			name: node.name?.value ?? null,
			role: node.role?.value ?? null,
		};
	} finally {
		if (sessionId) {
			await command("Target.detachFromTarget", { sessionId });
		}
		socket.close();
	}
}
