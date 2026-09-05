type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function threadItemBranch(type: string): JsonRecord | undefined {
	switch (type) {
		case "userMessage":
			return {
				type,
				id: "item-1",
				clientId: null,
				content: [{ type: "text", text: "fixture", text_elements: [] }],
			};
		case "agentMessage":
			return {
				type,
				id: "item-1",
				text: "fixture",
				phase: null,
				memoryCitation: null,
				delivery: null,
			};
		case "functionCallOutput":
			return {
				type,
				id: "item-1",
				name: "fixture",
				namespace: null,
				output: [{ type: "input_text", text: "fixture" }],
			};
		case "commandExecution":
			return {
				type,
				id: "item-1",
				pluginId: null,
				scriptPath: null,
				command: "true",
				cwd: "/tmp/archboard",
				processId: null,
				source: "agent",
				status: "completed",
				commandActions: [],
				aggregatedOutput: null,
				exitCode: 0,
				durationMs: 1,
			};
		case "fileChange":
			return { type, id: "item-1", changes: [], status: "completed" };
		case "mcpToolCall":
			return {
				type,
				id: "item-1",
				server: "fixture",
				tool: "fixture",
				status: "completed",
				arguments: {},
				appContext: null,
				pluginId: null,
				readOnlyHint: null,
				result: null,
				error: null,
				durationMs: 1,
			};
		case "dynamicToolCall":
			return {
				type,
				id: "item-1",
				namespace: null,
				tool: "fixture",
				arguments: {},
				status: "completed",
				contentItems: null,
				success: null,
				durationMs: 1,
			};
		case "collabAgentToolCall":
			return {
				type,
				id: "item-1",
				tool: "wait",
				status: "completed",
				senderThreadId: "thread-1",
				receiverThreadIds: [],
				prompt: null,
				model: null,
				reasoningEffort: null,
				agentsStates: {},
			};
		case "subAgentActivity":
			return { type, id: "item-1", kind: "started", agentThreadId: "thread-1", agentPath: "1" };
		case "webSearch":
			return { type, id: "item-1", query: "fixture", action: null, results: null };
		case "imageGeneration":
			return {
				type,
				id: "item-1",
				status: "completed",
				revisedPrompt: null,
				result: "fixture",
				failure: { type: "usageLimitExceeded", limitId: "fixture", resetsAt: null },
			};
	}
	return undefined;
}

function responseItemBranch(type: string): JsonRecord | undefined {
	switch (type) {
		case "message":
			return {
				type,
				role: "assistant",
				content: [{ type: "output_text", text: "fixture" }],
				phase: "commentary",
			};
		case "agent_message":
			return {
				type,
				author: "fixture",
				recipient: "fixture",
				content: [{ type: "input_text", text: "fixture" }],
			};
		case "reasoning":
			return {
				type,
				summary: [{ type: "summary_text", text: "fixture" }],
				content: [{ type: "reasoning_text", text: "fixture" }],
				encrypted_content: null,
			};
		case "local_shell_call":
			return {
				type,
				call_id: "call-1",
				status: "completed",
				action: {
					type: "exec",
					command: ["true"],
					timeout_ms: null,
					working_directory: null,
					env: null,
					user: null,
				},
			};
		case "function_call_output":
			return { type, output: [{ type: "input_text", text: "fixture" }] };
		case "custom_tool_call_output":
			return { type, call_id: "call-1", output: [{ type: "input_text", text: "fixture" }] };
		case "web_search_call":
			return { type, action: { type: "search", query: "fixture" } };
	}
	return undefined;
}

function generatedBranch(type: string): JsonRecord | undefined {
	return (
		threadItemBranch(type) ??
		responseItemBranch(type) ??
		({
			image: { type, detail: "auto", url: "https://example.test/image" },
			localImage: { type, detail: "auto", path: "/tmp/archboard/image" },
			text: { type, text: "fixture", text_elements: [] },
			input_text: { type, text: "fixture" },
			input_image: { type, image_url: "https://example.test/image", detail: "auto" },
			input_audio: { type, audio_url: "https://example.test/audio" },
			encrypted_content: { type, encrypted_content: "fixture" },
			output_text: { type, text: "fixture" },
			reasoning_text: { type, text: "fixture" },
			special: { type, value: { kind: "project_roots", subpath: null } },
			path: { type, path: "/tmp/archboard" },
			realtimeSessionStarted: { type, id: "item-1", realtimeSessionId: "realtime-1" },
			transcriptSegment: {
				type,
				id: "item-1",
				realtimeSessionId: "realtime-1",
				role: "user",
				text: "fixture",
			},
			bemItemPromoted: {
				type,
				id: "item-1",
				realtimeSessionId: "realtime-1",
				turnId: "turn-1",
				itemId: "item-1",
				presentation: { type: "inlineVisualization", index: 0 },
			},
			realtimeSessionClosed: {
				type,
				id: "item-1",
				realtimeSessionId: "realtime-1",
				outcome: "ended",
			},
			active: { type, activeFlags: [] },
			externalSandbox: { type, networkAccess: "restricted" },
			readOnly: { type, networkAccess: false },
			workspaceWrite: {
				type,
				writableRoots: [],
				networkAccess: false,
				excludeTmpdirEnvVar: false,
				excludeSlashTmp: false,
			},
			command: { type, source: "shell", command: "true", cwd: "/tmp/archboard" },
			execve: {
				type,
				source: "shell",
				program: "true",
				argv: [],
				cwd: "/tmp/archboard",
			},
			networkAccess: {
				type,
				target: "https://example.test",
				host: "example.test",
				protocol: "https",
				port: 443,
			},
			requestPermissions: {
				type,
				reason: null,
				permissions: {
					network: null,
					fileSystem: {
						read: null,
						write: null,
						entries: [{ path: { type: "path", path: "/tmp/archboard" }, access: "read" }],
					},
				},
			},
		}[type] as JsonRecord | undefined)
	);
}

function arrayMember(fieldName: string, next: string): unknown {
	if (fieldName === "activeFlags") {
		return "waitingOnApproval";
	}
	if (fieldName === "verifications") {
		return "trustedAccessForCyber";
	}
	if (fieldName === "entries") {
		return { kind: "context", text: "fixture" };
	}
	if (fieldName === "changes") {
		return { path: "file", kind: { type: "add" }, diff: "" };
	}
	if (fieldName === "files") {
		return {
			root: "/",
			path: "file",
			match_type: "file",
			file_name: "file",
			score: 0,
			indices: null,
		};
	}
	if (fieldName === "itemTypeResults") {
		return {
			itemType: "AGENTS_MD",
			successes: [],
			failures: [],
		};
	}
	if (fieldName === "successes") {
		return {
			itemType: "AGENTS_MD",
			cwd: null,
			source: null,
			target: null,
			title: null,
		};
	}
	if (fieldName === "failures") {
		return {
			itemType: "AGENTS_MD",
			errorType: null,
			subErrorType: null,
			failureStage: "fixture",
			message: "fixture",
			cwd: null,
			source: null,
		};
	}
	if (fieldName === "plan") {
		return { step: "fixture", status: "pending" };
	}
	if (fieldName === "commandActions") {
		return { type: "read", command: "true", name: "fixture", path: "/tmp/archboard" };
	}
	if (fieldName === "content" || fieldName === "output" || fieldName === "contentItems") {
		return generatedBranch(next) ?? { type: "inputText", text: "fixture" };
	}
	return {};
}

function nullableMember(fieldName: string): unknown {
	switch (fieldName) {
		case "error":
			return {
				message: "fixture",
				codexErrorInfo: null,
				additionalDetails: null,
				misalignment: null,
			};
		case "codexErrorInfo":
			return { activeTurnNotSteerable: { turnKind: "review" } };
		case "misalignment":
			return {
				errorType: null,
				detailedExplanation: null,
				steer: { message: "fixture" },
			};
		case "section":
			return { id: "section-1", name: "Fixture", appearance: null };
		case "appMetadata":
			return {
				review: { status: "approved" },
				categories: [],
				subCategories: [],
				seoDescription: null,
				screenshots: [],
				developer: null,
				version: null,
				versionId: null,
				versionNotes: null,
				firstPartyRequiresInstall: null,
				showInComposerWhenUnlinked: null,
			};
		case "result":
			return { content: [], structuredContent: null, _meta: null };
		case "contentItems":
			return [{ type: "inputText", text: "fixture" }];
		case "action":
			return { type: "search", query: null, queries: null };
		case "source":
			return { subAgent: "review" };
		case "failure":
			return { type: "usageLimitExceeded", limitId: "fixture", resetsAt: null };
	}
	return {};
}

function optionalMember(fieldName: string): unknown {
	if (fieldName === "phase") {
		return "commentary";
	}
	return undefined;
}

export { type JsonRecord, isRecord, generatedBranch, arrayMember, nullableMember, optionalMember };
