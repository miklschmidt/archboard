# Codex workbench authored contracts

**Reviewed input:** 2026-08-30

**Protocol:** Codex app-server 0.151.0 with experimental APIs

**Owner:** TASK-143.01.17

This document freezes the authored inputs that an implementation worker must
not invent. Source modules load, hash, validate, and dispatch these contracts.
Changing prose, order, schemas, limits, or result tags is a product/agent-policy
change and requires a new review.

## Byte rules

- UTF-8, no BOM, LF line endings, and one terminal LF.
- The bytes inside each `text` fence, excluding the opening and closing fence
  lines, are canonical.
- The coordinator developer document is the workhorse bytes, then the literal
  separator `\n--- ARCHBOARD COORDINATOR ROLE ---\n`, then the coordinator
  extension bytes. Both component documents already end in LF; there is no
  extra blank line.
- Hashes are lowercase SHA-256 over those exact bytes. The implementation
  computes and freezes them; callers cannot supply a hash or authored suffix.

## Initialize and auxiliary request policy

The initialize capabilities object is literal:

```json
{
	"experimentalApi": true,
	"requestAttestation": false,
	"mcpServerOpenaiFormElicitation": true,
	"optOutNotificationMethods": [],
	"extensions": {}
}
```

Archboard supports the legacy `openai/form` elicitation shape through the
explicit boolean and advertises no MCP Apps UI extension. It opts out of no
notifications because the decoder/router is exhaustive. `attestation/generate`
must not be sent after `requestAttestation: false`; if received, the router
returns JSON-RPC error `-32601`, `"Attestation is not supported by this
client"`. `account/chatgptAuthTokens/refresh` is unsupported because Archboard
does not accept the client-managed token login variant; if received, it returns
`-32601`, `"Client-managed ChatGPT token refresh is not supported"`.

`currentTime/read` is always supported. After validating its `threadId` against
the current child, it returns exactly:

```json
{"currentTimeAt":<floor-of-current-Unix-milliseconds-divided-by-1000>}
```

The six generated login variants have one closed policy:

| Variant                   | Policy                                                                   |
| ------------------------- | ------------------------------------------------------------------------ |
| `apiKey`                  | Supported; secret enters one login RPC and is never snapshotted.         |
| `chatgpt`                 | Supported hosted browser login with cancel and completion correlation.   |
| `chatgptDeviceCode`       | Refused as unsupported by this UI.                                       |
| `chatgptAuthTokens`       | Refused; Archboard does not own token refresh.                           |
| `amazonBedrock`           | Supported with explicit API key and region.                              |
| `amazonBedrockAccessKeys` | Supported with explicit access keys, optional session token, and region. |

Bedrock profile/environment setup that depends on ambient AWS variables is
refused before an RPC because `BedrockSetupParams` contains only `profile` and
`environment` variants and the child strips ambient credentials. Bedrock is
available only through the two explicit `LoginAccountParams` credential forms
above. Unsupported variants are rejected with a visual recovery path; they do
not make the whole session incapable of a supported login.

## Dedicated child environment

The child environment is built from an empty object. If present and a valid
NUL-free string, only these ambient keys are copied, in this order:

```text
HOME, USER, LOGNAME, SHELL, PATH, LANG, LC_ALL, LC_CTYPE, TZ, TERM, COLORTERM,
TMPDIR, TMP, TEMP, XDG_CACHE_HOME, XDG_CONFIG_HOME, XDG_RUNTIME_DIR,
HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, NO_PROXY, http_proxy, https_proxy,
all_proxy, no_proxy, SSL_CERT_FILE, SSL_CERT_DIR, NIX_SSL_CERT_FILE,
GIT_SSL_CAINFO, NODE_EXTRA_CA_CERTS, SSH_AUTH_SOCK
```

The host then writes canonical absolute `CODEX_HOME` and `CODEX_SQLITE_HOME`
values over that object. Those two values are never copied from ambient input.
Every other variable is absent, including all other `CODEX_*`, `OPENAI_*`,
`AWS_*`, credential/token, listener/auth, daemon, Desktop, Electron, MCP, and
app-tools variables. Spawn also supplies the canonical checkout through the
process `cwd`; it does not add `PWD`.

Fixtures begin from a poisoned environment containing every retained key,
conflicting Codex roots, representative stripped prefixes, and an unrelated
sentinel. They assert the output key set exactly, copied values byte-for-byte,
dedicated-root overwrite precedence, absent optional keys rather than empty
strings, NUL rejection, and no ambient-key fallthrough.

## Literal thread profiles

The workhorse `thread/start` contains exactly these fields after placeholders
are substituted. Angle-bracket strings denote scalar authored values, except
the `dynamicTools` entries: each of those stands for the complete namespace
object frozen later in this document and is never serialized as a string.

```json
{
	"cwd": "<canonical-checkout-root>",
	"runtimeWorkspaceRoots": ["<same-canonical-checkout-root>"],
	"serviceName": "archboard",
	"developerInstructions": "<canonical-workhorse-bytes>",
	"ephemeral": false,
	"historyMode": "paginated",
	"sessionStartSource": "startup",
	"threadSource": "archboard",
	"dynamicTools": ["<canonical-archboard_app-namespace>"],
	"experimentalRawEvents": false
}
```

The coordinator uses exactly one of these two otherwise-identical profiles:

```json
{
	"model": "gpt-5.6-luna",
	"allowProviderModelFallback": false,
	"serviceTier": "priority",
	"cwd": "<canonical-checkout-root>",
	"runtimeWorkspaceRoots": ["<same-canonical-checkout-root>"],
	"config": { "features": { "realtime_conversation": true } },
	"serviceName": "archboard",
	"developerInstructions": "<canonical-composed-coordinator-bytes>",
	"ephemeral": false,
	"historyMode": "paginated",
	"sessionStartSource": "startup",
	"threadSource": "archboard",
	"dynamicTools": [
		"<canonical-archboard_workhorse-namespace>",
		"<canonical-archboard_voice-namespace>"
	],
	"experimentalRawEvents": false
}
```

When `model/list` does not advertise priority for `gpt-5.6-luna`, the fallback
profile omits `serviceTier`; it does not send `null` or another tier. Both
profiles intentionally omit `modelProvider`, `approvalPolicy`,
`approvalsReviewer`, `sandbox`, `permissions`, `baseInstructions`,
`personality`, `multiAgentMode`, `projectId`, `environments`,
`selectedCapabilityRoots`, and `mockExperimentalField`. Omission preserves the
dedicated child's reviewed config/default environment and therefore normal
shell, web, repository, and approval capabilities. Workhorse `model`,
`allowProviderModelFallback`, `serviceTier`, and `config` are also omitted so
the configured workhorse defaults remain authoritative and are recorded from
the returned thread.

After coordinator start, Archboard sends exactly one of:

```json
{"threadId":"<coordinator-thread-id>","model":"gpt-5.6-luna","serviceTier":"priority","effort":"medium"}
{"threadId":"<coordinator-thread-id>","model":"gpt-5.6-luna","effort":"medium"}
```

The empty response is not confirmation. Reuse requires a matching
`thread/settings/updated` notification whose model, effort, and effective tier
match the selected profile. It must also preserve the start response's
`approvalPolicy`, `approvalsReviewer`, `sandbox` as notification
`sandboxPolicy`, and `activePermissionProfile`. Those four generated names are
not interchangeable and the last one is never called `permissions` in a
notification.

The only accepted top-level `Thread.source` values are `"cli"`, `"vscode"`,
`"exec"`, and `"appServer"`. `{custom:...}`, `{subAgent:...}`, and `"unknown"`
remain inspect-only. This source set is used by classification and by the
literal `thread/list` query below.

## Literal turn, steer, fork, and injection bodies

Every Archboard-started ordinary turn uses this complete `TurnStartParams`
shape after placeholder substitution:

```json
{
	"threadId": "<target-thread-id>",
	"clientUserMessageId": "<host-minted-id>",
	"input": [{ "type": "text", "text": "<bounded-prompt>", "text_elements": [] }],
	"turnTrigger": "archboard",
	"additionalContext": {
		"archboard": { "kind": "application", "value": "<canonical-context-json>" }
	}
}
```

It omits `toolOutput`, `responsesapiClientMetadata`, `environments`, `cwd`,
`runtimeWorkspaceRoots`, `approvalPolicy`, `approvalsReviewer`,
`sandboxPolicy`, `permissions`, `model`, `serviceTier`, `serviceTierForTurn`,
`effort`, `summary`, `personality`, `outputSchema`, `collaborationMode`,
`multiAgentMode`, and `cyberAccessProgram`. Text is a `UserInput`; it is not a
developer-role Responses API item.

Every steer uses this complete `TurnSteerParams` shape:

```json
{
	"threadId": "<target-thread-id>",
	"clientUserMessageId": "<host-minted-id>",
	"input": [{ "type": "text", "text": "<bounded-prompt>", "text_elements": [] }],
	"additionalContext": {
		"archboard": { "kind": "application", "value": "<canonical-context-json>" }
	},
	"expectedTurnId": "<host-proven-active-turn-id>"
}
```

It omits only `responsesapiClientMetadata`. The caller never supplies
`expectedTurnId`.

A general-tool fork uses this complete `ThreadForkParams` profile:

```json
{
	"threadId": "<target-thread-id>",
	"cwd": "<canonical-checkout-root>",
	"runtimeWorkspaceRoots": ["<same-canonical-checkout-root>"],
	"developerInstructions": "<canonical-workhorse-bytes>",
	"ephemeral": false,
	"threadSource": "archboard",
	"excludeTurns": true
}
```

For a non-self fork, optional `beforeTurnId` is included only when supplied by
the validated tool input. For a self-fork, caller `beforeTurnId` is ignored and
the host sets `ThreadForkParams.beforeTurnId` to the executing
`DynamicToolCallParams.turnId`.
`lastTurnId`, `path`, `model`, `modelProvider`, `serviceTier`, `approvalPolicy`,
`approvalsReviewer`, `sandbox`, `permissions`, `config`, `baseInstructions`,
and `deferGoalContinuation` are always omitted.

Semantic bystander delivery alone uses `thread/inject_items` and this complete
body:

```json
{
	"threadId": "<exact-workhorse-thread-id>",
	"items": [
		{
			"type": "message",
			"role": "developer",
			"content": [{ "type": "input_text", "text": "<canonical-semantic-context>" }]
		}
	]
}
```

No ordinary `turn/start` or `turn/steer` body uses that developer-role shape.

## Literal session port

The session exposes exactly these public methods; consumers do not call a
generic RPC method:

```text
initialize, configRead, accountRead, accountLogin, accountLoginCancel,
accountLogout, modelList, threadStart, threadFork, threadListPage,
threadLoadedListPage, threadRead, threadTurnsListPage, threadItemsListPage,
threadDelete, threadSettingsUpdate, turnStart, turnSteer, turnInterrupt,
queueAdd, queueListPage, queueUpdate, queueDelete, queueReorder, queueStart,
threadInjectItems, realtimeStart, realtimeAppendText, realtimeAppendSpeech,
realtimeStop, timelineListPage, respondCurrentTime,
respondUnsupportedTokenRefresh, respondUnsupportedAttestation
```

The page methods preserve one decoded page. Classification/authority callers
loop them with cursor-loop detection; browser/tool callers receive the bounded
page contract stated below.

## Literal timing policy

All values are milliseconds:

| Constant                         |   Value | Required relationship                                      |
| -------------------------------- | ------: | ---------------------------------------------------------- |
| `CODEX_PROCESS_RESTART_BASE_MS`  |   1,000 | first retry delay                                          |
| `CODEX_PROCESS_RESTART_MAX_MS`   |  30,000 | at least request settlement; exponential backoff caps here |
| `CODEX_REQUEST_SETTLEMENT_MS`    |  30,000 | lost non-idempotent response becomes `outcome_unknown`     |
| `CODEX_BROWSER_COMMAND_LEASE_MS` | 150,000 | longer than the 120,000 wait cap and approval expiry       |
| `CODEX_APPROVAL_EXPIRY_MS`       |  90,000 | shorter than browser lease                                 |
| `CODEX_SPOKEN_GATE_EXPIRY_MS`    |  60,000 | no longer than approval expiry                             |
| `CODEX_SEMANTIC_FRESHNESS_MS`    |  30,000 | shorter than realtime recovery                             |
| `CODEX_REALTIME_START_MS`        |  15,000 | bounds permission-independent SDP/start readiness          |
| `CODEX_REALTIME_STOP_MS`         |   3,000 | completes before TERM grace                                |
| `CODEX_REALTIME_RECOVERY_MS`     |  45,000 | longer than semantic freshness                             |
| `CODEX_TERM_GRACE_MS`            |   5,000 | TERM-to-KILL escalation after realtime stop                |
| `CODEX_COMPOSED_SHUTDOWN_MS`     |  10,000 | greater than realtime stop plus TERM grace                 |

Expiry never proves a remote mutation failed. Restart delay doubles from base
to max and resets only after one account-ready session. Shutdown stops
realtime first, settles local waiters, closes stdin, sends TERM, and sends KILL
at the grace bound while remaining inside the composed cap.

### Workhorse developer instructions

```text
You are the Codex workhorse linked to one Archboard pane and repository checkout. Treat the supplied Archboard thread link, child epoch, board, pane, and operation identities as authoritative; never infer a target from recency, focus, or another thread.

Use Archboard's normal repository instructions and the archboard CLI when work needs the canvas. Keep board claim and doing state honest. A person's board edits are design input. Agent-only board changes must not be narrated back as new human intent.

Carry sustained repository and implementation work to completion. Use the archboard_app coordination tools only when another Codex thread is genuinely needed. Do not invent a host, process, thread, turn, queue, approval, or realtime identity; the host validates and supplies identities that are not present in a tool schema.

Board context may arrive as developer-role semantic updates. Apply each update to later reasoning without starting duplicate work. If delivery is marked outcome_unknown, inspect authoritative thread or board state before acting; never retry a non-idempotent operation blindly.
```

### Coordinator role extension

```text
You are the persistent voice coordinator for one Archboard thread link. Stay capable: you may inspect the repository, search the web, run shell commands, use ordinary Codex tools, and make one explicit unambiguous board change directly. Default sustained coding or multi-step repository work to the linked workhorse.

Keep coordinator and workhorse histories distinct. Never wait synchronously for the workhorse. Use inspect_workhorse for current state, delegate_to_workhorse for new sustained work, manage_workhorse_queue only for the host-approved created-workhorse queue, and steer_workhorse only when the host exposes an exact active turn.

Realtime speech cannot settle a Codex approval. When the host asks for spoken approval classification, answer in a later ordinary coordinator turn by calling resolve_spoken_approval with only accept or decline. If the intent is ambiguous or the tool refuses, leave the request for the visual approval surface.

Semantic callbacks are context, not user commands. Operation callbacks report correlated progress. Do not repeat a delegation, queue mutation, steer, or approval after outcome_unknown; inspect authoritative state and explain the uncertainty.
```

## Canonical additional context

The only app-server `additionalContext` entry is named `archboard`:

```json
{ "archboard": { "kind": "application", "value": "<canonical-json>" } }
```

`<canonical-json>` is compact JSON with keys in this exact order. Optional
values are present as `null`; keys are never omitted or added.

```json
{
	"schema": 1,
	"paneId": "<opaque>",
	"board": { "note": "<vault-relative>", "version": 0, "cursor": "<opaque-or-null>" },
	"threadLink": { "state": "executable|inspect_only|unbound", "reason": "<closed-reason-or-null>" },
	"child": { "id": "<opaque>", "epoch": "<opaque>" },
	"workhorse": { "threadId": "<opaque-or-null>", "turnId": "<opaque-or-null>" },
	"coordinator": { "threadId": "<opaque-or-null>", "realtimeSessionId": "<opaque-or-null>" },
	"semantic": {
		"brief": "<bounded-text>",
		"capturedAtMs": 0,
		"freshUntilMs": 0,
		"truncated": false
	},
	"focus": { "paneId": "<opaque-or-null>", "capturedAtMs": 0 },
	"selection": { "elementIds": [], "capturedAtMs": 0 },
	"claim": { "holder": "human|agent|none", "doing": "<text-or-null>" },
	"ambiguity": [],
	"operation": {
		"id": "<opaque-or-null>",
		"kind": "<closed-kind-or-null>",
		"outcome": "delivered|not_delivered|outcome_unknown|null"
	}
}
```

The semantic brief, selection IDs, ambiguity entries, and doing text use the
limits below. Encoding rejects overflow rather than truncating silently:

| Value                 | Limit                                          |
| --------------------- | ---------------------------------------------- |
| semantic brief        | 8,192 UTF-8 bytes                              |
| selection IDs         | 128 entries, 64 bytes each                     |
| ambiguity entries     | 16 entries, 256 UTF-8 bytes each               |
| doing                 | 512 UTF-8 bytes                                |
| tool prompt/input     | 16,384 UTF-8 bytes unless narrower below       |
| cursor                | 1,024 UTF-8 bytes                              |
| wait targets          | 8                                              |
| wait timeout          | 0 through 120,000 milliseconds                 |
| transcript delegation | input 4,096 bytes; transcriptDelta 4,096 bytes |

An Archboard semantic injection or callback is exactly one raw Responses API
developer message with one `input_text` part:

```json
{
	"type": "message",
	"role": "developer",
	"content": [{ "type": "input_text", "text": "<canonical-context-or-callback-text>" }]
}
```

## Realtime V3 start policy

Every start uses a new host-minted `realtimeSessionId` and these choices:

```json
{
	"clientManagedHandoffs": false,
	"delegationAckFiller": true,
	"flushTranscriptTailOnSessionEnd": true,
	"codexResponsesAsItems": false,
	"codexResponseHandoffMode": "bemTags",
	"outputModality": "audio",
	"includeStartupContext": true,
	"initialItems": [{ "role": "developer", "text": "<fresh-canonical-semantic-brief>" }],
	"realtimeStartInstructions": "<canonical-composed-coordinator-bytes>",
	"realtimeEndInstructions": "Finish the current sentence, preserve unresolved approvals for the visual workbench, and leave no work waiting on voice.",
	"prompt": null,
	"realtimeSessionId": "<new-opaque-id>",
	"transport": { "type": "webrtc", "sdp": "<browser-offer>" },
	"version": "v3",
	"voice": "breeze"
}
```

`breeze` is the only first-release voice. The workbench has no voice list,
selector, persistence, per-session override, or fallback choice.

The start response is `{}`. The SDP answer comes only from a matching
`thread/realtime/sdp` notification. Readiness additionally requires matching
`thread/realtime/started` child, thread, realtime-session, and version identity.
WebSocket transport, `appendAudio`, and `outputAudio` are outside this product
contract.

## Dynamic-tool wire form

All three catalogues use `DynamicToolNamespaceSpec` with `type: "namespace"`.
Every listed function has `type: "function"` and `deferLoading: false`; the
catalogues are eager and ordered as written. Every object schema has
`additionalProperties: false`.

A valid call response contains exactly one text item. The text is canonical
compact JSON in one of these envelopes:

```json
{"tag":"ok","operationId":"<opaque>","value":{}}
{"tag":"refused","reason":"invalid_call|not_ready|not_loaded|not_controllable|system_error|stale_child|prior_epoch|unknown_provenance|approval_declined|cycle|busy|expired|unsupported","message":"<bounded-actionable-text>"}
{"tag":"approval_required","operationId":"<opaque>","summary":"<bounded-effect-summary>"}
{"tag":"outcome_unknown","operationId":"<opaque>","message":"The request may have taken effect. Inspect authoritative state before another mutation."}
```

The app-server response is:

```json
{ "contentItems": [{ "type": "inputText", "text": "<one-envelope-above>" }], "success": true }
```

Unknown tool/schema/media/identity/manifest calls use `success: false` with one
`refused` envelope and perform no effect. A valid refusal or uncertainty is a
successful tool execution and therefore keeps `success: true`.

The `ok.value` object is closed per tool:

```json
{
	"create_thread": {
		"threadId": "<opaque>",
		"state": "executable|inspect_only",
		"initialTurn": {
			"delivery": "delivered|not_delivered|outcome_unknown",
			"turnId": "<opaque-or-null>",
			"operationId": "<opaque-or-null>",
			"reason": "<bounded-text-or-null>"
		}
	},
	"fork_thread": {
		"threadId": "<opaque>",
		"state": "executable|inspect_only",
		"initialTurn": {
			"delivery": "not_requested|delivered|not_delivered|outcome_unknown",
			"turnId": "<opaque-or-null>",
			"operationId": "<opaque-or-null>",
			"reason": "<bounded-text-or-null>"
		}
	},
	"list_threads": {
		"threads": [
			{
				"threadId": "<opaque>",
				"title": "<string-or-null>",
				"status": "notLoaded|idle|systemError|active",
				"source": "cli|vscode|exec|appServer",
				"epoch": "current|prior|unknown",
				"ownership": "created|attached|foreign",
				"loaded": false,
				"canAcceptDirectInput": null
			}
		],
		"nextCursor": "<opaque-or-null>"
	},
	"read_thread": {
		"threadId": "<opaque>",
		"turns": [
			{
				"turnId": "<opaque>",
				"status": "inProgress|completed|interrupted|failed",
				"summary": "<bounded-text>",
				"outputsIncluded": true,
				"outputsTruncated": false
			}
		],
		"nextCursor": "<opaque-or-null>"
	},
	"send_message_to_thread": {
		"threadId": "<opaque>",
		"delivery": "delivered|not_delivered|outcome_unknown"
	},
	"wait_threads": {
		"event": "completed|attention|timeout",
		"threadId": "<opaque-or-null>",
		"cursor": "<opaque-or-null>"
	},
	"inspect_workhorse": {
		"threadId": "<opaque>",
		"status": "notLoaded|idle|systemError|active",
		"activeTurnId": "<opaque-or-null>",
		"queuedSubmissionIds": []
	},
	"delegate_to_workhorse": {
		"mode": "started|queued",
		"clientUserMessageId": "<opaque>",
		"queuedSubmissionId": "<opaque-or-null>",
		"turnId": "<opaque-or-null>"
	},
	"manage_workhorse_queue": {
		"operation": "list|add|update|delete|reorder|start",
		"queuedSubmissionIds": []
	},
	"steer_workhorse": {
		"turnId": "<opaque>",
		"delivery": "delivered|not_delivered|outcome_unknown"
	},
	"resolve_spoken_approval": {
		"verdict": "accept|decline",
		"settlement": "delivered|not_delivered|outcome_unknown"
	}
}
```

The outer object above is documentation shorthand: a response contains only
the value under the invoked tool name, never the other tool keys. Thread and
turn summaries are bounded by the same text limits and cannot embed raw media,
credentials, process identity, or an unbounded app-server object. `loaded` and
`outputsIncluded` are booleans; `canAcceptDirectInput` is boolean or null.

## `archboard_app` manifest

```json
{
	"type": "namespace",
	"name": "archboard_app",
	"description": "Coordinate bounded work across Codex threads owned or inspected by this Archboard app-server session.",
	"tools": [
		{
			"type": "function",
			"name": "create_thread",
			"description": "Create one persistent Archboard Codex thread after host approval and return its confirmed identity or uncertainty.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"prompt": { "type": "string", "minLength": 1, "maxLength": 16384 }
				},
				"required": ["prompt"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "fork_thread",
			"description": "Fork one eligible loaded controllable thread at a reviewed turn boundary after host approval.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"threadId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"beforeTurnId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"prompt": { "type": "string", "minLength": 1, "maxLength": 16384 }
				},
				"required": ["threadId"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "list_threads",
			"description": "List inspectable threads from the owned app-server session without loading or mutating them.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"cursor": { "type": "string", "minLength": 1, "maxLength": 1024 },
					"limit": { "type": "integer", "minimum": 1, "maximum": 100 }
				},
				"required": [],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "read_thread",
			"description": "Read bounded authoritative history for one inspectable thread without loading or mutating it.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"threadId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"cursor": { "type": "string", "minLength": 1, "maxLength": 1024 },
					"turnLimit": { "type": "integer", "minimum": 1, "maximum": 20 },
					"includeOutputs": { "type": "boolean" }
				},
				"required": ["threadId"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "send_message_to_thread",
			"description": "Send one message to an eligible target after policy and approval checks; never retry an uncertain mutation.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"threadId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"prompt": { "type": "string", "minLength": 1, "maxLength": 16384 }
				},
				"required": ["threadId", "prompt"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "wait_threads",
			"description": "Wait without creating a dependency cycle for the first bounded target to complete or need attention.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"threadIds": {
						"type": "array",
						"minItems": 1,
						"maxItems": 8,
						"uniqueItems": true,
						"items": { "type": "string", "minLength": 1, "maxLength": 128 }
					},
					"timeoutMs": { "type": "integer", "minimum": 0, "maximum": 120000 },
					"cursor": { "type": "string", "minLength": 1, "maxLength": 1024 }
				},
				"required": ["threadIds"],
				"additionalProperties": false
			},
			"deferLoading": false
		}
	]
}
```

Approval mapping: `create_thread`, `fork_thread`, and arbitrary
`send_message_to_thread` require a fresh visual broker approval. A self-fork
sets `ThreadForkParams.beforeTurnId` to the executing
`DynamicToolCallParams.turnId` and ignores any caller override.
`list_threads` and `read_thread` are read-only. `wait_threads` is allowed only
when the wait graph proves no transitive cycle.

The caller itself must always be an Archboard-created, current-epoch, loaded,
controllable thread executing the matching dynamic call. The target matrix is
literal; `any` means that dimension is observational and does not grant a
mutation:

| Tool                     | Target epoch               | Target provenance             | Loaded    | `canAcceptDirectInput` | Status                             | Relation      | Result                                  |
| ------------------------ | -------------------------- | ----------------------------- | --------- | ---------------------- | ---------------------------------- | ------------- | --------------------------------------- |
| `create_thread`          | N/A                        | N/A                           | N/A       | N/A                    | N/A                                | N/A           | allowed after approval                  |
| `list_threads`           | N/A                        | N/A                           | N/A       | N/A                    | N/A                                | N/A           | allowed, bounded page                   |
| `read_thread`            | current, prior, or unknown | created, attached, or foreign | yes or no | any                    | any                                | self or other | inspect-only allowed                    |
| `fork_thread`            | current                    | created or attached           | yes       | `true`                 | `idle`                             | other         | allowed after approval                  |
| `fork_thread`            | current                    | created or attached           | yes       | `true`                 | `active`                           | self only     | allowed after approval at host boundary |
| `send_message_to_thread` | current                    | created or attached           | yes       | `true`                 | `idle`                             | other         | allowed after approval                  |
| `wait_threads`           | current                    | created or attached           | yes       | any                    | `active`, `idle`, or `systemError` | other         | allowed if acyclic                      |

Every unlisted combination is refused before effect. Prior epoch yields
`prior_epoch`; foreign/unknown mutation provenance yields
`unknown_provenance`; unloaded or `notLoaded` yields `not_loaded`; false or
null direct-input capability yields `not_controllable`; `systemError` mutation
yields `system_error`; active non-self fork/send yields `busy`; self send/wait
yields `cycle`; stale child/link yields `stale_child`.

Operation and pagination semantics are exact:

- `create_thread` sends `thread/start` with the literal workhorse profile, then
  the literal `turn/start` body. There is no title argument. A lost start uses
  the outer `outcome_unknown`. After confirmed start, the `ok` result always
  retains `threadId`; initial-turn rejection uses `not_delivered`, and a lost
  turn response uses `outcome_unknown`, `state: "inspect_only"`, and the
  initial-turn `operationId`. Neither boundary is retried.
- `fork_thread` sends the literal `thread/fork` body once. A lost fork uses the
  outer `outcome_unknown`. After a confirmed fork, absence of `prompt` yields
  `initialTurn.delivery: "not_requested"`; a prompt produces one literal
  `turn/start`. Its rejection/uncertainty remains inside the confirmed-fork
  result exactly as for create.
- `send_message_to_thread` sends one literal `turn/start` to the allowed idle
  target. This general tool never steers. A lost response is
  `outcome_unknown` and is not retried.
- `list_threads` sends one `thread/list` page with
  `{cursor,limit,sortKey:"recency_at",sortDirection:"desc",sourceKinds:["cli","vscode","exec","appServer"],archived:false,useStateDbOnly:false}`;
  omitted input cursor becomes `null` and omitted limit becomes `10`. It then
  exhausts `thread/loaded/list` from
  `{cursor:null,limit:100}` solely to annotate that persisted page. The output
  cursor wraps only the returned `thread/list.nextCursor`.
- `read_thread` first classifies the target by exhausting `thread/list` from
  `{cursor:null,limit:100,sortKey:"recency_at",sortDirection:"desc",sourceKinds:["cli","vscode","exec","appServer"],archived:false,useStateDbOnly:false}`
  and `thread/loaded/list` from `{cursor:null,limit:100}`. It then
  sends one `thread/turns/list` page with
  `{threadId,cursor,limit,sortDirection:"desc",itemsView:"summary"}`; omitted
  cursor becomes `null` and omitted `turnLimit` becomes `10`. When
  `includeOutputs` is false or omitted, it sends no item request. When true, it
  sends exactly one `thread/items/list`
  `{threadId,turnId,cursor:null,limit:100,sortDirection:"asc"}` for each returned
  turn, in returned turn order. `outputsTruncated` is true when that item page
  has `nextCursor` or the bounded projection truncates text.
- A turn `summary` is not read from the generated `Turn`, which has no such
  field. It is the deterministic string
  `<status> · user: <first-user-text-or-none> · assistant: <last-assistant-text-or-none>`.
  Whitespace collapses to one ASCII space; non-text media becomes `[media]`;
  tool names/statuses may be included but command/file/tool output bodies are
  omitted unless `includeOutputs` is true. The complete summary is capped at
  512 UTF-8 bytes and ends with `…` when truncated. Secrets and raw media never
  enter it.
- `wait_threads` canonicalizes its target set by sorting unique ThreadIds. A
  cursor is optional; when supplied it must unwrap to the same child epoch,
  method, sorted target set, and prior delivered event sequence. It returns
  `attention` only for a target-owned pending broker request or `systemError`;
  `completed` requires a matching terminal turn/thread event; timeout is not
  attention. Its output cursor resumes after the last delivered event. The
  wait graph rejects cycles before registration.
- Every exposed cursor is an opaque host envelope bound to child epoch, method,
  pagination direction, and canonical query. Authority reads exhaust pages
  with repeated-cursor detection; tool reads preserve the exact bounded page
  behavior above.

## Coordinator manifests

```json
{
	"type": "namespace",
	"name": "archboard_workhorse",
	"description": "Inspect and steer the one workhorse bound by the host to this coordinator; no caller selects a target.",
	"tools": [
		{
			"type": "function",
			"name": "inspect_workhorse",
			"description": "Read the linked workhorse identity, state, queue, and bounded recent progress without waiting.",
			"inputSchema": {
				"type": "object",
				"properties": {},
				"required": [],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "delegate_to_workhorse",
			"description": "Delegate one sustained request and bounded realtime transcript context to the linked workhorse.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"input": { "type": "string", "minLength": 1, "maxLength": 4096 },
					"transcriptDelta": { "type": "string", "minLength": 0, "maxLength": 4096 }
				},
				"required": ["input", "transcriptDelta"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "manage_workhorse_queue",
			"description": "Inspect or mutate the linked created-workhorse queue through the host's serialized queue policy.",
			"inputSchema": {
				"type": "object",
				"properties": {
					"operation": {
						"type": "string",
						"enum": ["list", "add", "update", "delete", "reorder", "start"]
					},
					"submissionId": { "type": "string", "minLength": 1, "maxLength": 128 },
					"prompt": { "type": "string", "minLength": 1, "maxLength": 16384 },
					"orderedSubmissionIds": {
						"type": "array",
						"minItems": 1,
						"maxItems": 100,
						"uniqueItems": true,
						"items": { "type": "string", "minLength": 1, "maxLength": 128 }
					}
				},
				"required": ["operation"],
				"additionalProperties": false
			},
			"deferLoading": false
		},
		{
			"type": "function",
			"name": "steer_workhorse",
			"description": "Append one bounded instruction to the host-proven active workhorse turn; the host supplies expectedTurnId.",
			"inputSchema": {
				"type": "object",
				"properties": { "input": { "type": "string", "minLength": 1, "maxLength": 4096 } },
				"required": ["input"],
				"additionalProperties": false
			},
			"deferLoading": false
		}
	]
}
```

`manage_workhorse_queue` has operation-dependent validation: `add` requires
`prompt`; `update` requires `submissionId` and `prompt`; `delete` and `start`
require `submissionId`; `reorder` requires `orderedSubmissionIds`; `list`
accepts no other property.

```json
{
	"type": "namespace",
	"name": "archboard_voice",
	"description": "Resolve the sole host-validated spoken binary approval from a later ordinary coordinator turn.",
	"tools": [
		{
			"type": "function",
			"name": "resolve_spoken_approval",
			"description": "Return accept or decline for the sole still-current spoken approval; the host supplies and validates every request identity.",
			"inputSchema": {
				"type": "object",
				"properties": { "verdict": { "type": "string", "enum": ["accept", "decline"] } },
				"required": ["verdict"],
				"additionalProperties": false
			},
			"deferLoading": false
		}
	]
}
```

`resolve_spoken_approval` is never called from realtime directly. After the
effect prompt, the host arms one immutable eligible request only from the next
matching final **user** item. It binds the realtime session, item id, and
monotonic item sequence. Assistant output, provisional user deltas, pre-prompt
items, duplicates, and stale sessions can never arm authority.

The later ordinary coordinator turn receives these exact UTF-8 template bytes
(LF endings, one terminal LF) after placeholder substitution:

```text
Classify one spoken binary approval for Archboard. The host has already bound the request identity; do not infer or mention another request.

<spoken_approval>
effect: <bounded-effect-summary>
user_final_item_id: <opaque-item-id>
user_final_sequence: <decimal-sequence>
user_final_text: <verbatim-bounded-final-user-text>
</spoken_approval>

If and only if the user clearly accepts or declines this effect, call archboard_voice.resolve_spoken_approval once with {"verdict":"accept"} or {"verdict":"decline"}. Otherwise do not call the tool; say the request must be resolved in the visual workbench.
```

The host accepts the resulting call only when child, epoch, coordinator thread,
classifier turn, call, namespace, tool, manifest hash, realtime session, final
user item/sequence, effect fingerprint, and expiry still match. It then supplies
the sole pending approval identity to the broker.
