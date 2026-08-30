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
refused because the child strips ambient credentials. Unsupported variants are
rejected before an RPC with a visual recovery path; they do not make the whole
session incapable of a supported login.

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
match the selected profile and whose approval, sandbox, and permissions equal
the values captured from the start response.

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
	"voice": "<reviewed-user-choice>"
}
```

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
	"create_thread": { "threadId": "<opaque>", "state": "executable|inspect_only" },
	"fork_thread": { "threadId": "<opaque>", "state": "executable|inspect_only" },
	"list_threads": {
		"threads": [
			{
				"threadId": "<opaque>",
				"title": "<string-or-null>",
				"status": "notLoaded|idle|systemError|active",
				"loaded": true,
				"canAcceptDirectInput": true,
				"provenance": "current|prior|unknown"
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
				"summary": "<bounded-text>"
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
credentials, process identity, or an unbounded app-server object.

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
					"turnLimit": { "type": "integer", "minimum": 1, "maximum": 100 },
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
					"timeoutMs": { "type": "integer", "minimum": 0, "maximum": 120000 }
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
uses the server-supplied executing `beforeTurnId` and no caller override.
`list_threads` and `read_thread` are read-only. `wait_threads` is allowed only
when the wait graph proves no transitive cycle.

Operation semantics are exact:

- `create_thread` sends `thread/start` with the literal workhorse profile, then
  `turn/start` with the required prompt. There is no title argument. A lost
  start is `outcome_unknown`; a confirmed thread plus refused/not-delivered
  turn returns the confirmed inspectable thread and the turn outcome; a lost
  turn response is `outcome_unknown` and is never repeated.
- `fork_thread` sends `thread/fork` once. When `prompt` is present, a confirmed
  fork is followed by one `turn/start`; the two uncertainty boundaries match
  create. With no prompt, the confirmed fork is the terminal success.
- `send_message_to_thread` sends one `turn/start` only to an idle loaded
  controllable target. An active target is `refused: busy`; this general tool
  never steers. A lost response is `outcome_unknown`.
- `wait_threads` returns `attention` only for a target-owned pending broker
  request or a target entering `systemError`. `completed` requires a matching
  terminal turn/thread event; timeout is not attention. The wait graph rejects
  cycles before registration.
- Authority, ownership, and policy reads always exhaust pages. Tool
  `list_threads`, `read_thread`, and wait progress preserve requested pages.
  Every exposed cursor is an opaque host envelope bound to child epoch, method,
  and canonical query; it cannot be replayed against another child or query.

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
			"description": "Inspect or mutate the linked created-workhorse queue through the host's versioned queue policy.",
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
