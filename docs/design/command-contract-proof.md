<!-- Generated from the run.ts registry and public CommandContract metadata. -->

# Command contract proof reference

## start

Explicitly starts the local canvas, overriding automatic-start opt-outs.

Usage:

```text
archboard start
```

Output: json (Server startup state).

Prerequisites: none. Effects: local-write.

REST relationships:

- GET `/health`, conditional. Identity probe before and after a possible local spawn

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"running": {
			"type": "boolean",
			"const": true
		},
		"url": {
			"type": "string"
		},
		"spawned": {
			"type": "boolean"
		},
		"pid": {
			"type": "integer",
			"exclusiveMinimum": 0,
			"maximum": 9007199254740991
		},
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"required": ["running", "url", "spawned"],
	"additionalProperties": false
}
```

## stop

Stops only a live process that identifies itself as this canvas service.

Usage:

```text
archboard stop
```

Output: json (Identity-safe stop result).

Prerequisites: none. Effects: local-write.

REST relationships:

- GET `/health`, one. Identity check before signaling a local process

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"stopped": {
			"type": "boolean"
		},
		"pid": {
			"type": "integer",
			"exclusiveMinimum": 0,
			"maximum": 9007199254740991
		},
		"message": {
			"type": "string"
		},
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"required": ["stopped", "message"],
	"additionalProperties": false
}
```

## status

Reports canvas availability, identity, source freshness, and synchronization state.

Usage:

```text
archboard status
```

Output: json (Canvas status).

Prerequisites: none. Effects: read.

REST relationships:

- GET `/health`, one. Identity and health
- GET `/api/sync/status`, conditional. Best-effort synchronization state after valid health

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{
			"type": "object",
			"properties": {
				"running": {
					"type": "boolean",
					"const": false
				},
				"url": {
					"type": "string"
				}
			},
			"required": ["running", "url"],
			"additionalProperties": {}
		},
		{
			"type": "object",
			"properties": {
				"running": {
					"type": "boolean",
					"const": false
				},
				"url": {
					"type": "string"
				},
				"conflict": {
					"type": "string"
				}
			},
			"required": ["running", "url", "conflict"],
			"additionalProperties": {}
		},
		{
			"type": "object",
			"properties": {
				"running": {
					"type": "boolean",
					"const": true
				},
				"url": {
					"type": "string"
				},
				"pid": {
					"type": "integer",
					"minimum": -9007199254740991,
					"maximum": 9007199254740991
				},
				"elements": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"browserClients": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"stale": {
					"type": "object",
					"properties": {
						"startedAt": {
							"type": "string"
						},
						"changedFile": {
							"type": "string"
						},
						"changedAt": {
							"type": "string"
						},
						"says": {
							"type": "string"
						}
					},
					"required": ["startedAt", "changedFile", "changedAt", "says"],
					"additionalProperties": false
				}
			},
			"required": ["running", "url", "elements", "browserClients"],
			"additionalProperties": {}
		}
	]
}
```

## apply

Validates a complete element patch before applying it as one board write.

Usage:

```text
archboard apply [patch.json|-] [--document]
```

Output: json (Patch receipt).

Prerequisites: server, board, doing. Effects: write.

REST relationships:

- GET `/api/elements`, conditional. Resolve updated and deleted ids
- POST `/api/elements/changes`, one. Apply the complete patch

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"created": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"updated": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"deleted": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"elements": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"id": {
						"type": "string"
					},
					"type": {
						"type": "string",
						"enum": [
							"rectangle",
							"ellipse",
							"diamond",
							"arrow",
							"text",
							"line",
							"freedraw",
							"image"
						]
					},
					"x": {
						"type": "number"
					},
					"y": {
						"type": "number"
					}
				},
				"required": ["id", "type", "x", "y"],
				"additionalProperties": {}
			}
		},
		"fingerprint": {
			"type": "object",
			"properties": {
				"elements": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"note": {
					"type": "string"
				},
				"version": {
					"anyOf": [
						{
							"type": "integer",
							"minimum": 0,
							"maximum": 9007199254740991
						},
						{
							"type": "null"
						}
					]
				}
			},
			"required": ["elements", "note", "version"],
			"additionalProperties": false
		},
		"document": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"id": {
						"type": "string"
					},
					"type": {
						"type": "string",
						"enum": [
							"rectangle",
							"ellipse",
							"diamond",
							"arrow",
							"text",
							"line",
							"freedraw",
							"image"
						]
					},
					"x": {
						"type": "number"
					},
					"y": {
						"type": "number"
					}
				},
				"required": ["id", "type", "x", "y"],
				"additionalProperties": {}
			}
		},
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"required": ["success", "created", "updated", "deleted", "elements", "fingerprint"],
	"additionalProperties": {}
}
```

## add

Creates one or more elements in one batch.

Usage:

```text
archboard add [elements.json] (or stdin) [--document]
add --one '{"type":"rectangle",...}'
```

Output: json (Creation receipt).

Prerequisites: server, board, doing. Effects: write.

REST relationships:

- POST `/api/elements/batch`, one. Create the batch

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"count": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"elements": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"id": {
						"type": "string"
					},
					"type": {
						"type": "string",
						"enum": [
							"rectangle",
							"ellipse",
							"diamond",
							"arrow",
							"text",
							"line",
							"freedraw",
							"image"
						]
					},
					"x": {
						"type": "number"
					},
					"y": {
						"type": "number"
					}
				},
				"required": ["id", "type", "x", "y"],
				"additionalProperties": {}
			}
		},
		"fingerprint": {
			"type": "object",
			"properties": {
				"elements": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"note": {
					"type": "string"
				},
				"version": {
					"anyOf": [
						{
							"type": "integer",
							"minimum": 0,
							"maximum": 9007199254740991
						},
						{
							"type": "null"
						}
					]
				}
			},
			"required": ["elements", "note", "version"],
			"additionalProperties": false
		},
		"document": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"id": {
						"type": "string"
					},
					"type": {
						"type": "string",
						"enum": [
							"rectangle",
							"ellipse",
							"diamond",
							"arrow",
							"text",
							"line",
							"freedraw",
							"image"
						]
					},
					"x": {
						"type": "number"
					},
					"y": {
						"type": "number"
					}
				},
				"required": ["id", "type", "x", "y"],
				"additionalProperties": {}
			}
		},
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"required": ["success", "count", "elements", "fingerprint"],
	"additionalProperties": {}
}
```

## update

Updates one element in one version-checked board write.

Usage:

```text
archboard update <id> --set '{"backgroundColor":"#ffc9c9"}' [--document]

  ANSWERS WITH WHAT THE BOARD BECAME: `elements` is every element the write touched in
  its resulting form, including what the server made and you never named — the ids it
  minted, the text element it expanded from a `label`, the arrows it re-routed behind a
  move. `fingerprint` is the board in one line: how many elements, the sha-256 of its
  note, and which edit of that note this write produced. Keep the last one and you can
  tell in a single comparison whether anything you did not do has changed, instead of
  re-reading the board — and pass `fingerprint.version` as --expect-version on your
  next write to have it refused if somebody got there first.

  --document adds the whole board. OFF BY DEFAULT AND USUALLY WRONG: 300 elements is
  about 60,000 tokens, so a loop that asks for it pulls the board through a context once
  per box. Use `describe` for a summary or `query` for a part.
```

Output: json (Versioned write result).

Prerequisites: server, board, doing. Effects: local-read, write.

REST relationships:

- PUT `/api/elements/:id`, one. Exactly one board write

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"element": {
			"type": "object",
			"properties": {
				"id": {
					"type": "string"
				},
				"type": {
					"type": "string",
					"enum": ["rectangle", "ellipse", "diamond", "arrow", "text", "line", "freedraw", "image"]
				},
				"x": {
					"type": "number"
				},
				"y": {
					"type": "number"
				}
			},
			"required": ["id", "type", "x", "y"],
			"additionalProperties": {}
		},
		"elements": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"id": {
						"type": "string"
					},
					"type": {
						"type": "string",
						"enum": [
							"rectangle",
							"ellipse",
							"diamond",
							"arrow",
							"text",
							"line",
							"freedraw",
							"image"
						]
					},
					"x": {
						"type": "number"
					},
					"y": {
						"type": "number"
					}
				},
				"required": ["id", "type", "x", "y"],
				"additionalProperties": {}
			}
		},
		"fingerprint": {
			"type": "object",
			"properties": {
				"elements": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"note": {
					"type": "string"
				},
				"version": {
					"anyOf": [
						{
							"type": "integer",
							"minimum": 0,
							"maximum": 9007199254740991
						},
						{
							"type": "null"
						}
					]
				}
			},
			"required": ["elements", "note", "version"],
			"additionalProperties": false
		},
		"document": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"id": {
						"type": "string"
					},
					"type": {
						"type": "string",
						"enum": [
							"rectangle",
							"ellipse",
							"diamond",
							"arrow",
							"text",
							"line",
							"freedraw",
							"image"
						]
					},
					"x": {
						"type": "number"
					},
					"y": {
						"type": "number"
					}
				},
				"required": ["id", "type", "x", "y"],
				"additionalProperties": {}
			}
		},
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"required": ["success", "element", "elements", "fingerprint"],
	"additionalProperties": false
}
```

## delete

Resolves every id before deleting them in one write.

Usage:

```text
archboard delete <id> [<id> ...] [--document]
```

Output: json (Deletion receipt).

Prerequisites: server, board, doing. Effects: write.

REST relationships:

- GET `/api/elements`, one. Resolve all ids before writing
- POST `/api/elements/changes`, one. Delete all ids

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"deleted": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"count": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"elements": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"id": {
						"type": "string"
					},
					"type": {
						"type": "string",
						"enum": [
							"rectangle",
							"ellipse",
							"diamond",
							"arrow",
							"text",
							"line",
							"freedraw",
							"image"
						]
					},
					"x": {
						"type": "number"
					},
					"y": {
						"type": "number"
					}
				},
				"required": ["id", "type", "x", "y"],
				"additionalProperties": {}
			}
		},
		"fingerprint": {
			"type": "object",
			"properties": {
				"elements": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"note": {
					"type": "string"
				},
				"version": {
					"anyOf": [
						{
							"type": "integer",
							"minimum": 0,
							"maximum": 9007199254740991
						},
						{
							"type": "null"
						}
					]
				}
			},
			"required": ["elements", "note", "version"],
			"additionalProperties": false
		},
		"document": {
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"id": {
						"type": "string"
					},
					"type": {
						"type": "string",
						"enum": [
							"rectangle",
							"ellipse",
							"diamond",
							"arrow",
							"text",
							"line",
							"freedraw",
							"image"
						]
					},
					"x": {
						"type": "number"
					},
					"y": {
						"type": "number"
					}
				},
				"required": ["id", "type", "x", "y"],
				"additionalProperties": {}
			}
		},
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"required": ["success", "deleted", "count", "elements", "fingerprint"],
	"additionalProperties": {}
}
```

## get

Returns one server-owned element payload.

Usage:

```text
archboard get <id>
```

Output: json (Element payload).

Prerequisites: server, board. Effects: read.

REST relationships:

- GET `/api/elements/:id`, one. Read the element

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"id": {
			"type": "string"
		},
		"type": {
			"type": "string",
			"enum": ["rectangle", "ellipse", "diamond", "arrow", "text", "line", "freedraw", "image"]
		},
		"x": {
			"type": "number"
		},
		"y": {
			"type": "number"
		}
	},
	"required": ["id", "type", "x", "y"],
	"additionalProperties": {}
}
```

## query

Queries the board and applies typed client-side predicates without changing it.

Usage:

```text
archboard query [--type rectangle] [--bbox x0,y0,x1,y1] [--filter locked=true] [--filter-json '{...}']
```

Output: json (Bare element array).

Prerequisites: server, board. Effects: read.

REST relationships:

- GET `/api/elements`, conditional. Unconstrained read
- GET `/api/elements/search`, conditional. Type or bbox search

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "array",
	"items": {
		"type": "object",
		"properties": {
			"id": {
				"type": "string"
			},
			"type": {
				"type": "string",
				"enum": ["rectangle", "ellipse", "diamond", "arrow", "text", "line", "freedraw", "image"]
			},
			"x": {
				"type": "number"
			},
			"y": {
				"type": "number"
			}
		},
		"required": ["id", "type", "x", "y"],
		"additionalProperties": {}
	}
}
```

## selection

Reads the server-cached browser selection without retransmitting the scene.

Usage:

```text
archboard selection [--text]
```

Output: json (Structured view state); text (Human-readable view state).

Prerequisites: server, board. Effects: read.

REST relationships:

- GET `/api/selection`, one. Read the current selection

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{},
		{
			"type": "string"
		}
	]
}
```

## panes

Reads pane layout and view state, including the valid no-pane state.

Usage:

```text
archboard panes [--text]
```

Output: json (Structured view state); text (Human-readable view state).

Prerequisites: server. Effects: read.

REST relationships:

- GET `/api/panes`, one. Read pane view state

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{},
		{
			"type": "string"
		}
	]
}
```

## pane

Routes pane mutation commands.

Usage:

```text
archboard pane open [--board <key>] | pane close <spec>
```

Output: json (Namespace refusal).

Prerequisites: none. Effects: none.

REST relationships:

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"not": {}
}
```

## pane open

Splits the rendered canvas and optionally opens the globally named board there.

Usage:

```text
archboard pane open [--board <key>]
```

Output: json (Opened pane).

Prerequisites: server, browser. Effects: browser.

REST relationships:

- POST `/api/panes/open`, one. Open the pane
- POST `/api/boards/open`, conditional. Open the named board in the new pane

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema"
}
```

## pane close

Takes one board off screen without changing the board itself.

Usage:

```text
archboard pane close <spec>
```

Output: json (Closed pane).

Prerequisites: server, browser. Effects: browser.

REST relationships:

- POST `/api/panes/close`, one. Close the selected pane

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema"
}
```

## viewport

Moves the camera owned by a rendered browser pane.

Usage:

```text
archboard viewport --fit [--zoom-factor 0.8] [--pane <spec>]
viewport --ids a,b,c [--zoom-factor 0.8] [--pane <spec>]
viewport --element <id> [--pane <spec>]
viewport --zoom 1.5 [--offset-x 0] [--offset-y 0] [--pane <spec>]

  Exactly one of those four. --fit frames everything on the board, --ids frames those elements,
  --element centres on one without changing zoom, and the last sets explicit camera values.
  --zoom-factor is the padding on a fit: lower leaves more room around the content.

  It names a PANE, not a board, because a pane holds one board and that settles which is meant
  (ADR 0009). With one pane on screen that is the one; with two, --pane says which half moves,
  and without it the pane that answers for the browser does.
```

Output: json (Viewport acknowledgement).

Prerequisites: server, browser. Effects: browser.

REST relationships:

- POST `/api/viewport`, one. One browser camera request

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean"
		},
		"message": {
			"type": "string"
		},
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"required": ["success"],
	"additionalProperties": false
}
```

## repo

Routes repository registry subcommands.

Usage:

```text
archboard Usage: repo list [--text] | repo add [dir] | repo forget <identity>
```

Output: json (Namespace refusal).

Prerequisites: none. Effects: none.

REST relationships:

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"not": {}
}
```

## repo list

Reads the machine-local repository registry.

Usage:

```text
archboard repo list [--text]
```

Output: json (Repository registry); text (Human-readable registry).

Prerequisites: none. Effects: local-read.

REST relationships:

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{
			"type": "object",
			"properties": {
				"success": {
					"type": "boolean",
					"const": true
				},
				"registry": {
					"type": "string"
				},
				"repos": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"repo": {
								"type": "string"
							},
							"root": {
								"type": "string"
							},
							"source": {
								"type": "string",
								"enum": ["declared", "observed"]
							},
							"addedAt": {
								"type": "string"
							},
							"exists": {
								"type": "boolean"
							}
						},
						"required": ["repo", "root", "source", "addedAt"],
						"additionalProperties": false
					}
				}
			},
			"required": ["success", "registry", "repos"],
			"additionalProperties": false
		},
		{
			"type": "string"
		}
	]
}
```

## repo add

Derives a checkout identity from git and records its local root.

Usage:

```text
archboard repo add [dir]
```

Output: json (Registered checkout).

Prerequisites: none. Effects: local-read, local-write.

REST relationships:

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"repo": {
			"type": "string"
		},
		"root": {
			"type": "string"
		},
		"source": {
			"type": "string",
			"enum": ["declared", "observed"]
		},
		"addedAt": {
			"type": "string"
		},
		"registry": {
			"type": "string"
		}
	},
	"required": ["success", "repo", "root", "source", "addedAt", "registry"],
	"additionalProperties": false
}
```

## repo forget

Removes one identity from the machine-local registry.

Usage:

```text
archboard repo forget <identity>
```

Output: json (Forget receipt).

Prerequisites: none. Effects: local-read, local-write.

REST relationships:

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"repo": {
			"type": "string"
		},
		"forgotten": {
			"type": "boolean"
		},
		"registry": {
			"type": "string"
		}
	},
	"required": ["success", "repo", "forgotten", "registry"],
	"additionalProperties": false
}
```

## board

Routes board lifecycle commands.

Usage:

```text
archboard board needs a subcommand: list, info, new, open, save
```

Output: json (Namespace refusal).

Prerequisites: none. Effects: none.

REST relationships:

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"not": {}
}
```

## board list

Lists vault and in-memory boards, optionally filtered by repository binding.

Usage:

```text
archboard board list [--repo <host/owner/name> | --here] [--text]
```

Output: json (Board listing); text (Human-readable board listing).

Prerequisites: server. Effects: local-read, read.

REST relationships:

- GET `/api/boards`, one. List boards

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{
			"type": "object",
			"properties": {
				"success": {
					"type": "boolean",
					"const": true
				},
				"vault": {
					"type": "string"
				},
				"boards": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"key": {
								"type": "string"
							}
						},
						"required": ["key"],
						"additionalProperties": {}
					}
				},
				"open": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"key": {
								"type": "string"
							}
						},
						"required": ["key"],
						"additionalProperties": {}
					}
				},
				"onScreen": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"paneId": {
								"type": "string"
							},
							"place": {
								"type": "string"
							},
							"board": {
								"type": "string"
							}
						},
						"required": ["paneId", "place", "board"],
						"additionalProperties": {}
					}
				},
				"held": {
					"type": "object",
					"properties": {
						"board": {
							"type": "string"
						},
						"message": {
							"type": "string"
						}
					},
					"required": ["board", "message"],
					"additionalProperties": {}
				}
			},
			"required": ["success", "vault", "boards", "open", "onScreen"],
			"additionalProperties": {}
		},
		{
			"type": "string"
		}
	]
}
```

## board info

Reads the globally named board's current identity and save state.

Usage:

```text
archboard board info
```

Output: json (Board state).

Prerequisites: server, board. Effects: read.

REST relationships:

- GET `/api/boards/info`, one. Read board state

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema"
}
```

## board new

Creates an empty board after server contact and optionally shows it in one pane.

Usage:

```text
archboard board new <name> [--variant v] [--level l] [--pane <spec>]
```

Output: json (New board).

Prerequisites: server. Effects: write.

REST relationships:

- POST `/api/boards/new`, one. Create the board

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema"
}
```

## board open

Loads one board and optionally points a selected pane at it.

Usage:

```text
archboard board open <name[@variant]> [--variant v] [--reload] [--pane <spec>]
```

Output: json (Opened board).

Prerequisites: server. Effects: read, browser.

REST relationships:

- POST `/api/boards/open`, one. Open the board

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema"
}
```

## board save

Writes or branches a board note and returns structured save or conflict state.

Usage:

```text
archboard board save --board <key> [--as <name>] [--variant v] [--level l] [--force]
```

Output: json (Board save or structured conflict).

Prerequisites: server, board. Effects: local-read, write.

REST relationships:

- POST `/api/boards/save`, one. One board-note save attempt

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{
			"type": "object",
			"properties": {
				"success": {
					"type": "boolean",
					"const": true
				},
				"board": {
					"type": "string"
				},
				"identity": {
					"type": "object",
					"properties": {
						"board": {
							"type": "string"
						},
						"variant": {
							"type": "string"
						},
						"level": {
							"type": "string"
						},
						"displayName": {
							"type": "string"
						}
					},
					"required": ["board", "variant"],
					"additionalProperties": false
				},
				"saveKind": {
					"type": "string",
					"enum": ["same-board", "named", "branch"]
				},
				"savedFrom": {
					"type": "string"
				},
				"file": {
					"type": "string"
				},
				"panes": {
					"type": "object",
					"properties": {
						"moved": {
							"type": "array",
							"items": {
								"type": "object",
								"properties": {
									"paneId": {
										"type": "string"
									},
									"clientId": {
										"type": "string"
									},
									"place": {
										"type": "string"
									},
									"position": {
										"type": "integer",
										"minimum": -9007199254740991,
										"maximum": 9007199254740991
									}
								},
								"required": ["paneId", "clientId", "place", "position"],
								"additionalProperties": {}
							}
						},
						"kept": {
							"type": "array",
							"items": {
								"type": "object",
								"properties": {
									"paneId": {
										"type": "string"
									},
									"clientId": {
										"type": "string"
									},
									"place": {
										"type": "string"
									},
									"position": {
										"type": "integer",
										"minimum": -9007199254740991,
										"maximum": 9007199254740991
									}
								},
								"required": ["paneId", "clientId", "place", "position"],
								"additionalProperties": {}
							}
						},
						"onScreen": {
							"type": "array",
							"items": {
								"type": "object",
								"properties": {
									"paneId": {
										"type": "string"
									},
									"place": {
										"type": "string"
									},
									"board": {
										"type": "string"
									}
								},
								"required": ["paneId", "place", "board"],
								"additionalProperties": {}
							}
						}
					},
					"required": ["moved", "kept"],
					"additionalProperties": {}
				},
				"held": {
					"type": "object",
					"properties": {
						"board": {
							"type": "string"
						},
						"message": {
							"type": "string"
						}
					},
					"required": ["board", "message"],
					"additionalProperties": {}
				}
			},
			"required": ["success", "board", "identity"],
			"additionalProperties": {}
		},
		{
			"type": "object",
			"properties": {
				"success": {
					"type": "boolean",
					"const": false
				},
				"conflict": {
					"type": "object",
					"properties": {
						"board": {
							"type": "string"
						},
						"file": {
							"type": "string"
						},
						"reason": {
							"type": "string",
							"enum": ["changed", "unseen"]
						},
						"actualHash": {
							"type": "string"
						},
						"versionMove": {
							"type": "string",
							"enum": ["unchanged", "behind", "ahead", "unknown"]
						},
						"outcomes": {
							"type": "object",
							"properties": {
								"reload": {
									"type": "string"
								},
								"overwrite": {
									"type": "string"
								},
								"saveAs": {
									"type": "string"
								}
							},
							"required": ["reload", "overwrite", "saveAs"],
							"additionalProperties": false
						},
						"message": {
							"type": "string"
						}
					},
					"required": [
						"board",
						"file",
						"reason",
						"actualHash",
						"versionMove",
						"outcomes",
						"message"
					],
					"additionalProperties": {}
				},
				"held": {
					"type": "object",
					"properties": {
						"board": {
							"type": "string"
						},
						"message": {
							"type": "string"
						}
					},
					"required": ["board", "message"],
					"additionalProperties": {}
				}
			},
			"required": ["success", "conflict"],
			"additionalProperties": false
		}
	]
}
```

## compare

Returns the complete semantic comparison without opening either board.

Usage:

```text
archboard compare <from> [to]
```

Output: json (Complete comparison).

Prerequisites: server. Effects: read.

REST relationships:

- GET `/api/boards/compare`, one. Read the semantic comparison

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema"
}
```

## changes

Reads cursor-based semantic change events or their net coalesced difference.

Usage:

```text
archboard changes --board <key> [--since <cursor>] [--coalesce] [--detail] [--text]
```

Output: json (Structured change feed); text (Human-readable change feed).

Prerequisites: server, board. Effects: read.

REST relationships:

- GET `/api/changes`, one. Read semantic changes

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{
			"type": "object",
			"properties": {
				"success": {
					"type": "boolean"
				},
				"board": {
					"type": "string"
				},
				"feedId": {
					"type": "string"
				},
				"cursor": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"events": {
					"type": "array",
					"items": {
						"type": "object",
						"propertyNames": {
							"type": "string"
						},
						"additionalProperties": {}
					}
				},
				"held": {
					"type": "object",
					"properties": {
						"board": {
							"type": "string"
						},
						"message": {
							"type": "string"
						}
					},
					"required": ["board", "message"],
					"additionalProperties": {}
				}
			},
			"required": ["success", "board", "cursor", "events"],
			"additionalProperties": {}
		},
		{
			"type": "string"
		}
	]
}
```

## inject

Routes injection status and test commands.

Usage:

```text
archboard inject status | inject test [--note "..."] [--loud]
```

Output: json (Namespace refusal).

Prerequisites: none. Effects: none.

REST relationships:

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"not": {}
}
```

## inject status

Reports the server-start injection decision and target.

Usage:

```text
archboard inject status
```

Output: json (Injection status).

Prerequisites: server. Effects: read.

REST relationships:

- GET `/api/injection`, one. Read injection status

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"additionalProperties": {}
}
```

## inject test

Sends one explicit injection probe, quietly unless loud is selected.

Usage:

```text
archboard inject test [--note "..."] [--loud]
```

Output: json (Injection probe result).

Prerequisites: server. Effects: write.

REST relationships:

- POST `/api/injection/test`, one. Send the injection probe

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"additionalProperties": {}
}
```

## describe

Returns the complete human-readable description for the named board.

Usage:

```text
archboard describe
```

Output: text (Scene description).

Prerequisites: server, board. Effects: read.

REST relationships:

- GET `/api/elements`, one. Read scene elements
- GET `/api/boards/info`, one. Read the board heading

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "string"
}
```

## export

Builds a portable scene and emits raw content or writes one local file.

Usage:

```text
archboard export [--out scene.excalidraw | note.excalidraw.md] [--format json|obsidian] [--force] (a .md out path implies obsidian; --force overwrites a non-Excalidraw destination, still preserving its frontmatter)
```

Output: raw (Exact serialized scene content); file-receipt (Validated file receipt).

Prerequisites: server, board. Effects: local-read, read, local-write.

REST relationships:

- GET `/api/elements`, parallel. Required scene elements
- GET `/api/files`, parallel. Best-effort image files

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{
			"type": "string"
		},
		{
			"type": "object",
			"properties": {
				"success": {
					"type": "boolean",
					"const": true
				},
				"file": {
					"type": "string"
				},
				"elements": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"format": {
					"type": "string",
					"enum": ["json", "obsidian"]
				},
				"held": {
					"type": "object",
					"properties": {
						"board": {
							"type": "string"
						},
						"message": {
							"type": "string"
						}
					},
					"required": ["board", "message"],
					"additionalProperties": {}
				}
			},
			"required": ["success", "file", "elements", "format"],
			"additionalProperties": false
		}
	]
}
```

## import

Imports scene data after the canvas prerequisite, merging unless replace is selected.

Usage:

```text
archboard import [scene.excalidraw|note.excalidraw.md|-] [--replace] (or stdin)
```

Output: json (Import receipt).

Prerequisites: server, board, doing. Effects: write.

REST relationships:

- POST `/api/elements/batch`, one. Merge imported elements
- DELETE `/api/elements/clear`, conditional. Clear before replace import

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"imported": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"files": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"mode": {
			"type": "string",
			"enum": ["merge", "replace"]
		},
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"required": ["success", "imported", "files", "mode"],
	"additionalProperties": false
}
```

## clear

Clears the named board only after explicit confirmation.

Usage:

```text
archboard clear --yes
```

Output: json (Clear receipt).

Prerequisites: server, board, doing. Effects: write.

REST relationships:

- DELETE `/api/elements/clear`, one. Clear the board

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"cleared": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"held": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"message": {
					"type": "string"
				}
			},
			"required": ["board", "message"],
			"additionalProperties": {}
		}
	},
	"required": ["success", "cleared"],
	"additionalProperties": false
}
```

## install-skill

Installs the bundled skill locally and optionally records repo-specific setup.

Usage:

```text
archboard install-skill [--agent codex|claude-code] [--target claude] [--dir <skills-root>]
              [--print-source]
              [--repo <dir>] [--vault <path>] [--doc <file>] [--no-doc] [--yes]
```

Output: json (Installed source or destination details).

Prerequisites: none. Effects: local-read, local-write.

REST relationships:

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{
			"type": "object",
			"properties": {
				"success": {
					"type": "boolean",
					"const": true
				},
				"skill": {
					"type": "string",
					"const": "archboard"
				},
				"source": {
					"type": "string"
				},
				"files": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				}
			},
			"required": ["success", "skill", "source", "files"],
			"additionalProperties": false
		},
		{
			"type": "object",
			"properties": {
				"success": {
					"type": "boolean",
					"const": true
				},
				"skill": {
					"type": "string",
					"const": "archboard"
				},
				"mode": {
					"type": "string"
				},
				"root": {
					"type": "string"
				},
				"target": {
					"type": "string"
				},
				"files": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"setup": {
					"type": "object",
					"properties": {
						"repo": {
							"type": "string"
						},
						"vault": {
							"type": "string"
						},
						"vaultCreated": {
							"type": "boolean"
						},
						"vaultIgnored": {
							"type": "boolean"
						},
						"doc": {
							"type": "string"
						},
						"docCreated": {
							"type": "boolean"
						},
						"blockUpdated": {
							"type": "boolean"
						},
						"command": {
							"type": "string"
						},
						"onPath": {
							"type": "boolean"
						}
					},
					"required": [
						"repo",
						"vault",
						"vaultCreated",
						"vaultIgnored",
						"doc",
						"docCreated",
						"blockUpdated",
						"command",
						"onPath"
					],
					"additionalProperties": false
				}
			},
			"required": ["success", "skill", "mode", "root", "target", "files"],
			"additionalProperties": false
		}
	]
}
```
