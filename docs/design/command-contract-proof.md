<!-- Generated from the run.ts registry and public CommandContract metadata. -->

# Command contract proof reference

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
					"type": "boolean"
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
