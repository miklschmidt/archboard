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
		{
			"type": "object",
			"properties": {
				"elementIds": {
					"type": "array",
					"items": {
						"type": "string"
					}
				},
				"count": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"nodeCount": {
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
							}
						},
						"required": ["id"],
						"additionalProperties": {}
					}
				},
				"missingIds": {
					"type": "array",
					"items": {
						"type": "string"
					}
				},
				"clientId": {
					"anyOf": [
						{
							"type": "string"
						},
						{
							"type": "null"
						}
					]
				},
				"at": {
					"anyOf": [
						{
							"type": "string"
						},
						{
							"type": "null"
						}
					]
				},
				"browserClients": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"summary": {
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
			"required": [
				"elementIds",
				"count",
				"nodeCount",
				"elements",
				"missingIds",
				"clientId",
				"at",
				"browserClients",
				"summary"
			],
			"additionalProperties": {}
		},
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
		{
			"type": "object",
			"properties": {
				"paneCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"arrangement": {
					"type": "string",
					"enum": ["none", "single", "side-by-side", "stacked", "grid", "overlapping"]
				},
				"focused": {
					"anyOf": [
						{
							"type": "string"
						},
						{
							"type": "null"
						}
					]
				},
				"sameBoard": {
					"type": "boolean"
				},
				"panes": {
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
							"position": {
								"type": "integer",
								"exclusiveMinimum": 0,
								"maximum": 9007199254740991
							},
							"place": {
								"type": "string"
							},
							"focused": {
								"type": "boolean"
							},
							"primary": {
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
									}
								},
								"required": ["board", "variant"],
								"additionalProperties": {}
							},
							"elementCount": {
								"type": "integer",
								"minimum": 0,
								"maximum": 9007199254740991
							},
							"viewport": {
								"type": "object",
								"properties": {
									"x": {
										"type": "number"
									},
									"y": {
										"type": "number"
									},
									"width": {
										"type": "number"
									},
									"height": {
										"type": "number"
									},
									"zoom": {
										"type": "number"
									}
								},
								"required": ["x", "y", "width", "height", "zoom"],
								"additionalProperties": false
							},
							"rect": {
								"type": "object",
								"properties": {
									"x": {
										"type": "number"
									},
									"y": {
										"type": "number"
									},
									"width": {
										"type": "number"
									},
									"height": {
										"type": "number"
									}
								},
								"required": ["x", "y", "width", "height"],
								"additionalProperties": false
							},
							"selection": {
								"type": "object",
								"properties": {
									"count": {
										"type": "integer",
										"minimum": 0,
										"maximum": 9007199254740991
									},
									"elementIds": {
										"type": "array",
										"items": {
											"type": "string"
										}
									},
									"moreIds": {
										"type": "integer",
										"minimum": 0,
										"maximum": 9007199254740991
									},
									"nodeCount": {
										"type": "integer",
										"minimum": 0,
										"maximum": 9007199254740991
									},
									"names": {
										"type": "array",
										"items": {
											"type": "string"
										}
									},
									"summary": {
										"type": "string"
									},
									"at": {
										"anyOf": [
											{
												"type": "string"
											},
											{
												"type": "null"
											}
										]
									}
								},
								"required": [
									"count",
									"elementIds",
									"moreIds",
									"nodeCount",
									"names",
									"summary",
									"at"
								],
								"additionalProperties": false
							},
							"at": {
								"type": "string"
							}
						},
						"required": [
							"paneId",
							"clientId",
							"position",
							"place",
							"focused",
							"primary",
							"board",
							"identity",
							"elementCount",
							"viewport",
							"rect",
							"selection",
							"at"
						],
						"additionalProperties": {}
					}
				},
				"summary": {
					"type": "string"
				},
				"activeBoard": {
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
			"required": [
				"paneCount",
				"arrangement",
				"focused",
				"sameBoard",
				"panes",
				"summary",
				"activeBoard"
			],
			"additionalProperties": {}
		},
		{
			"type": "string"
		}
	]
}
```

## promote

Promotes selected or named elements as one architecture node write.

Usage:

```text
archboard promote --kind <kind> [--ids a,b,c] [--path file] [--text]
```

Output: json (Structured promotion result); text (Promotion summary).

Prerequisites: server, board, doing. Effects: local-read, read, write.

REST relationships:

- GET `/api/elements`, one. Read the board
- GET `/api/selection`, conditional. Resolve default targets
- GET `/api/boards/info`, one. Read board variant
- POST `/api/elements/changes`, conditional. Apply promotion

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
				"summary": {
					"type": "string"
				},
				"nodes": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"node": {
								"type": "string"
							},
							"kind": {
								"type": "string",
								"enum": ["service", "queue", "datastore", "gateway", "external"]
							},
							"name": {
								"type": "string"
							},
							"elementIds": {
								"type": "array",
								"items": {
									"type": "string"
								}
							},
							"binding": {
								"type": "object",
								"properties": {
									"repo": {
										"type": "string"
									},
									"path": {
										"type": "string"
									},
									"branch": {
										"type": "string"
									},
									"commit": {
										"type": "string"
									},
									"confirmedAt": {
										"type": "string"
									}
								},
								"required": ["path"],
								"additionalProperties": {}
							},
							"link": {
								"type": "string"
							},
							"variant": {
								"type": "string"
							},
							"level": {
								"type": "string"
							}
						},
						"required": ["node", "kind", "name", "elementIds", "variant"],
						"additionalProperties": false
					}
				},
				"elementsUpdated": {
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
			"required": ["success", "summary", "nodes", "elementsUpdated"],
			"additionalProperties": {}
		},
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
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"pane": {
			"anyOf": [
				{
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
				},
				{
					"type": "null"
				}
			]
		},
		"paneCount": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
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
		"board": {
			"type": "object",
			"properties": {
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
				"elementCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
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
				},
				"placeholder": {
					"type": "boolean"
				},
				"file": {
					"type": "string"
				},
				"savedAt": {
					"type": "string"
				},
				"loadedAt": {
					"type": "string"
				},
				"success": {
					"type": "boolean",
					"const": true
				},
				"source": {
					"type": "string",
					"enum": ["vault", "memory"]
				},
				"pane": {
					"anyOf": [
						{
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
						},
						{
							"type": "null"
						}
					]
				},
				"declaredKey": {
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
			"required": [
				"board",
				"identity",
				"elementCount",
				"version",
				"placeholder",
				"success",
				"source",
				"pane"
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
	"required": ["success", "pane", "paneCount", "onScreen"],
	"additionalProperties": {}
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
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"closed": {
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
				},
				"board": {
					"type": "string"
				}
			},
			"required": ["paneId", "clientId", "place", "position", "board"],
			"additionalProperties": {}
		},
		"paneCount": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
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
	"required": ["success", "closed", "paneCount", "onScreen"],
	"additionalProperties": {}
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
	"required": ["success", "message"],
	"additionalProperties": false
}
```

## demote

Demotes every element belonging to the selected nodes in one write.

Usage:

```text
archboard demote [--ids a,b,c] [--text]
```

Output: json (Structured promotion result); text (Promotion summary).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/elements`, one. Read the board
- GET `/api/selection`, conditional. Resolve default targets
- POST `/api/elements/changes`, conditional. Apply demotion

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
				"summary": {
					"type": "string"
				},
				"nodes": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"node": {
								"type": "string"
							},
							"name": {
								"type": "string"
							},
							"elementIds": {
								"type": "array",
								"items": {
									"type": "string"
								}
							}
						},
						"required": ["elementIds"],
						"additionalProperties": false
					}
				},
				"elementsUpdated": {
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
			"required": ["success", "summary", "nodes", "elementsUpdated"],
			"additionalProperties": {}
		},
		{
			"type": "string"
		}
	]
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
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
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
		"elementCount": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
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
		},
		"placeholder": {
			"type": "boolean"
		},
		"file": {
			"type": "string"
		},
		"savedAt": {
			"type": "string"
		},
		"loadedAt": {
			"type": "string"
		},
		"success": {
			"type": "boolean",
			"const": true
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
	"required": ["board", "identity", "elementCount", "version", "placeholder", "success"],
	"additionalProperties": {}
}
```

## board new

Creates an empty board after server contact and optionally shows it in one pane.

Usage:

```text
archboard board new <name> [--variant v] [--level l] [--pane <spec>]
```

Output: json (New board).

Prerequisites: server. Effects: server-state-write, browser.

REST relationships:

- POST `/api/boards/new`, one. Create the board

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
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
		"elementCount": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
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
		},
		"placeholder": {
			"type": "boolean"
		},
		"file": {
			"type": "string"
		},
		"savedAt": {
			"type": "string"
		},
		"loadedAt": {
			"type": "string"
		},
		"success": {
			"type": "boolean",
			"const": true
		},
		"created": {
			"type": "boolean",
			"const": true
		},
		"saved": {
			"type": "boolean",
			"const": false
		},
		"pane": {
			"anyOf": [
				{
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
				},
				{
					"type": "null"
				}
			]
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
	"required": [
		"board",
		"identity",
		"elementCount",
		"version",
		"placeholder",
		"success",
		"created",
		"saved",
		"pane"
	],
	"additionalProperties": {}
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
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
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
		"elementCount": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
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
		},
		"placeholder": {
			"type": "boolean"
		},
		"file": {
			"type": "string"
		},
		"savedAt": {
			"type": "string"
		},
		"loadedAt": {
			"type": "string"
		},
		"success": {
			"type": "boolean",
			"const": true
		},
		"source": {
			"type": "string",
			"enum": ["vault", "memory"]
		},
		"pane": {
			"anyOf": [
				{
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
				},
				{
					"type": "null"
				}
			]
		},
		"declaredKey": {
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
	"required": [
		"board",
		"identity",
		"elementCount",
		"version",
		"placeholder",
		"success",
		"source",
		"pane"
	],
	"additionalProperties": {}
}
```

## board save

Writes or branches a board note and returns structured save or conflict state.

Usage:

```text
archboard board save --board <key> [--as <name>] [--variant v] [--level l] [--force]
```

Output: json (Board save or structured conflict).

Prerequisites: server, board, doing. Effects: local-read, write.

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
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean",
			"const": true
		},
		"from": {
			"type": "object",
			"properties": {
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
				"source": {
					"type": "string",
					"enum": ["memory", "vault"]
				},
				"elementCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"nodeCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"edgeCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"plainCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				}
			},
			"required": [
				"board",
				"identity",
				"source",
				"elementCount",
				"nodeCount",
				"edgeCount",
				"plainCount"
			],
			"additionalProperties": {}
		},
		"to": {
			"type": "object",
			"properties": {
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
				"source": {
					"type": "string",
					"enum": ["memory", "vault"]
				},
				"elementCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"nodeCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"edgeCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"plainCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				}
			},
			"required": [
				"board",
				"identity",
				"source",
				"elementCount",
				"nodeCount",
				"edgeCount",
				"plainCount"
			],
			"additionalProperties": {}
		},
		"summary": {
			"type": "object",
			"properties": {
				"comparable": {
					"type": "boolean"
				},
				"identical": {
					"type": "boolean"
				},
				"sharedNodes": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"nodesAdded": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"nodesRemoved": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"nodesChanged": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"nodesUnchanged": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"nodesMovedOnly": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"edgesAdded": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"edgesRemoved": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"edgesChanged": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"edgesUnchanged": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"layoutSignalsChanged": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				}
			},
			"required": [
				"comparable",
				"identical",
				"sharedNodes",
				"nodesAdded",
				"nodesRemoved",
				"nodesChanged",
				"nodesUnchanged",
				"nodesMovedOnly",
				"edgesAdded",
				"edgesRemoved",
				"edgesChanged",
				"edgesUnchanged",
				"layoutSignalsChanged"
			],
			"additionalProperties": false
		},
		"nodes": {
			"type": "object",
			"properties": {
				"added": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"node": {
								"type": "string"
							},
							"name": {
								"type": "string"
							}
						},
						"required": ["node", "name"],
						"additionalProperties": {}
					}
				},
				"removed": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"node": {
								"type": "string"
							},
							"name": {
								"type": "string"
							}
						},
						"required": ["node", "name"],
						"additionalProperties": {}
					}
				},
				"changed": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"node": {
								"type": "string"
							},
							"name": {
								"type": "string"
							}
						},
						"required": ["node", "name"],
						"additionalProperties": {}
					}
				},
				"unchanged": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"node": {
								"type": "string"
							},
							"name": {
								"type": "string"
							}
						},
						"required": ["node", "name"],
						"additionalProperties": {}
					}
				}
			},
			"required": ["added", "removed", "changed", "unchanged"],
			"additionalProperties": false
		},
		"edges": {
			"type": "object",
			"properties": {
				"added": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"from": {
								"type": "string"
							},
							"to": {
								"type": "string"
							}
						},
						"required": ["from", "to"],
						"additionalProperties": {}
					}
				},
				"removed": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"from": {
								"type": "string"
							},
							"to": {
								"type": "string"
							}
						},
						"required": ["from", "to"],
						"additionalProperties": {}
					}
				},
				"changed": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"from": {
								"type": "string"
							},
							"to": {
								"type": "string"
							}
						},
						"required": ["from", "to"],
						"additionalProperties": {}
					}
				},
				"unchanged": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"from": {
								"type": "string"
							},
							"to": {
								"type": "string"
							}
						},
						"required": ["from", "to"],
						"additionalProperties": {}
					}
				}
			},
			"required": ["added", "removed", "changed", "unchanged"],
			"additionalProperties": {}
		},
		"layout": {
			"type": "object",
			"properties": {
				"method": {
					"type": "object",
					"propertyNames": {
						"type": "string"
					},
					"additionalProperties": {
						"type": "string"
					}
				},
				"cannotExpress": {
					"type": "array",
					"items": {
						"type": "string"
					}
				}
			},
			"required": ["method", "cannotExpress"],
			"additionalProperties": {}
		},
		"warnings": {
			"type": "array",
			"items": {
				"type": "string"
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
	"required": ["success", "from", "to", "summary", "nodes", "edges", "layout", "warnings"],
	"additionalProperties": {}
}
```

## check

Reads the named note directly and reports whole-board findings without starting the canvas or changing the vault.

Usage:

```text
archboard check --board <key> [--text] [--strict] [--font-family <family>]
      [--dimension-tolerance <px>] [--intersection-tolerance <px>] [--overlap-tolerance <px>]

  Strict exits: 0 complete and clean; 6 complete with warnings only;
                7 complete with errors; 8 indeterminate coverage (takes precedence).
```

Output: json (Schema-v1 inspection report); text (Concise deterministic inspection report).

Prerequisites: board. Effects: local-read.

REST relationships:

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{
			"type": "object",
			"properties": {
				"schemaVersion": {
					"type": "number",
					"const": 1
				},
				"success": {
					"type": "boolean",
					"const": true
				},
				"policy": {
					"type": "object",
					"properties": {
						"allowedFontFamilies": {
							"anyOf": [
								{
									"type": "string",
									"const": "any"
								},
								{
									"type": "array",
									"items": {
										"anyOf": [
											{
												"type": "number",
												"const": 1
											},
											{
												"type": "number",
												"const": 2
											},
											{
												"type": "number",
												"const": 3
											},
											{
												"type": "number",
												"const": 5
											},
											{
												"type": "number",
												"const": 6
											},
											{
												"type": "number",
												"const": 7
											},
											{
												"type": "number",
												"const": 8
											}
										]
									}
								}
							]
						},
						"dimensionTolerance": {
							"type": "number",
							"minimum": 0
						},
						"intersectionTolerance": {
							"type": "number",
							"minimum": 0
						},
						"overlapTolerance": {
							"type": "number",
							"minimum": 0
						}
					},
					"required": [
						"allowedFontFamilies",
						"dimensionTolerance",
						"intersectionTolerance",
						"overlapTolerance"
					],
					"additionalProperties": false
				},
				"limits": {
					"type": "object",
					"properties": {
						"broadPhaseComparisons": {
							"type": "number",
							"const": 2000000
						}
					},
					"required": ["broadPhaseComparisons"],
					"additionalProperties": false
				},
				"totalElementCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"liveElementCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"locatableElementCount": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"broadPhaseComparisons": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"coverage": {
					"type": "string",
					"enum": ["complete", "indeterminate"]
				},
				"clean": {
					"type": "boolean"
				},
				"maxSeverity": {
					"type": "string",
					"enum": ["none", "warning", "error"]
				},
				"counts": {
					"type": "object",
					"properties": {
						"bySeverity": {
							"type": "object",
							"properties": {
								"error": {
									"type": "integer",
									"minimum": 0,
									"maximum": 9007199254740991
								},
								"warning": {
									"type": "integer",
									"minimum": 0,
									"maximum": 9007199254740991
								}
							},
							"required": ["error", "warning"],
							"additionalProperties": false
						},
						"byCode": {
							"type": "object",
							"propertyNames": {
								"type": "string",
								"enum": [
									"INVALID_RENDER_GEOMETRY",
									"STALE_LINEAR_DIMENSIONS",
									"BROKEN_REFERENCE",
									"LABEL_CORRUPTION",
									"FONT_POLICY_VIOLATION",
									"UNSUPPORTED_GEOMETRY",
									"AMBIGUOUS_GEOMETRY",
									"INSPECTION_LIMIT_EXCEEDED",
									"CONNECTOR_PENETRATES_NODE",
									"CONNECTOR_PENETRATES_OBSTACLE",
									"CONNECTOR_INTERSECTION_UNMARKED",
									"NODE_OVERLAP",
									"LABEL_OVERLAP"
								]
							},
							"additionalProperties": {
								"type": "integer",
								"minimum": 0,
								"maximum": 9007199254740991
							},
							"required": [
								"INVALID_RENDER_GEOMETRY",
								"STALE_LINEAR_DIMENSIONS",
								"BROKEN_REFERENCE",
								"LABEL_CORRUPTION",
								"FONT_POLICY_VIOLATION",
								"UNSUPPORTED_GEOMETRY",
								"AMBIGUOUS_GEOMETRY",
								"INSPECTION_LIMIT_EXCEEDED",
								"CONNECTOR_PENETRATES_NODE",
								"CONNECTOR_PENETRATES_OBSTACLE",
								"CONNECTOR_INTERSECTION_UNMARKED",
								"NODE_OVERLAP",
								"LABEL_OVERLAP"
							]
						}
					},
					"required": ["bySeverity", "byCode"],
					"additionalProperties": false
				},
				"coverageReasons": {
					"type": "array",
					"items": {
						"type": "string"
					}
				},
				"findings": {
					"type": "array",
					"items": {
						"anyOf": [
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "INVALID_RENDER_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "invalid-render-fields"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"invalidFields": {
												"minItems": 1,
												"type": "array",
												"items": {
													"type": "string",
													"enum": ["x", "y", "width", "height"]
												}
											},
											"valueKinds": {
												"type": "object",
												"propertyNames": {
													"type": "string",
													"enum": ["x", "y", "width", "height"]
												},
												"additionalProperties": {
													"type": "string"
												}
											}
										},
										"required": ["invalidFields", "valueKinds"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "INVALID_RENDER_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "unlocatable-record"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"recordKind": {
												"type": "string"
											},
											"invalidFields": {
												"minItems": 1,
												"type": "array",
												"items": {
													"type": "string",
													"enum": ["x", "y"]
												}
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											}
										},
										"required": ["recordKind", "invalidFields", "sourceIndex"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "STALE_LINEAR_DIMENSIONS"
									},
									"reason": {
										"type": "string",
										"const": "width"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"storedWidth": {
												"type": "number"
											},
											"storedHeight": {
												"type": "number"
											},
											"measuredWidth": {
												"type": "number",
												"minimum": 0
											},
											"measuredHeight": {
												"type": "number",
												"minimum": 0
											},
											"widthDelta": {
												"type": "number"
											},
											"heightDelta": {
												"type": "number"
											}
										},
										"required": [
											"storedWidth",
											"storedHeight",
											"measuredWidth",
											"measuredHeight",
											"widthDelta",
											"heightDelta"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "STALE_LINEAR_DIMENSIONS"
									},
									"reason": {
										"type": "string",
										"const": "height"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"storedWidth": {
												"type": "number"
											},
											"storedHeight": {
												"type": "number"
											},
											"measuredWidth": {
												"type": "number",
												"minimum": 0
											},
											"measuredHeight": {
												"type": "number",
												"minimum": 0
											},
											"widthDelta": {
												"type": "number"
											},
											"heightDelta": {
												"type": "number"
											}
										},
										"required": [
											"storedWidth",
											"storedHeight",
											"measuredWidth",
											"measuredHeight",
											"widthDelta",
											"heightDelta"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "STALE_LINEAR_DIMENSIONS"
									},
									"reason": {
										"type": "string",
										"const": "width-and-height"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"storedWidth": {
												"type": "number"
											},
											"storedHeight": {
												"type": "number"
											},
											"measuredWidth": {
												"type": "number",
												"minimum": 0
											},
											"measuredHeight": {
												"type": "number",
												"minimum": 0
											},
											"widthDelta": {
												"type": "number"
											},
											"heightDelta": {
												"type": "number"
											}
										},
										"required": [
											"storedWidth",
											"storedHeight",
											"measuredWidth",
											"measuredHeight",
											"widthDelta",
											"heightDelta"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "invalid-element-identity"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"identityIssue": {
												"type": "string",
												"enum": ["missing-id", "empty-string-id", "non-string-id"]
											},
											"rawIdType": {
												"type": "string",
												"enum": [
													"missing",
													"undefined",
													"null",
													"string",
													"number",
													"boolean",
													"bigint",
													"symbol",
													"function",
													"array",
													"object"
												]
											},
											"rawIdDescription": {
												"type": "string"
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"intendedRoles": {
												"type": "array",
												"items": {
													"type": "string",
													"enum": [
														"connector",
														"semantic-node-member",
														"valid-library-body",
														"qualifying-group-body",
														"bound-label",
														"label-container",
														"closed-boundary",
														"font-policy-text",
														"node-overlap-body",
														"label-overlap-body"
													]
												}
											},
											"availableElementType": {
												"anyOf": [
													{
														"type": "string"
													},
													{
														"type": "null"
													}
												]
											}
										},
										"required": [
											"identityIssue",
											"rawIdType",
											"rawIdDescription",
											"sourceIndex",
											"intendedRoles",
											"availableElementType"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "duplicate-element-id"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"duplicateId": {
												"type": "string",
												"minLength": 1
											},
											"sourceIndexes": {
												"minItems": 2,
												"type": "array",
												"items": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											}
										},
										"required": ["duplicateId", "sourceIndexes"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "missing-binding-target"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"type": "string",
												"minLength": 1
											},
											"end": {
												"type": "string",
												"enum": ["start", "end"]
											},
											"targetId": {
												"type": "string",
												"minLength": 1
											}
										},
										"required": ["connectorId", "end", "targetId"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "invalid-binding-target-type"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"type": "string",
												"minLength": 1
											},
											"end": {
												"type": "string",
												"enum": ["start", "end"]
											},
											"targetId": {
												"type": "string",
												"minLength": 1
											},
											"targetType": {
												"type": "string"
											}
										},
										"required": ["connectorId", "end", "targetId", "targetType"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "missing-binding-reciprocal"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"type": "string",
												"minLength": 1
											},
											"end": {
												"type": "string",
												"enum": ["start", "end"]
											},
											"targetId": {
												"type": "string",
												"minLength": 1
											}
										},
										"required": ["connectorId", "end", "targetId"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "malformed-start-binding"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"rawKind": {
												"type": "string"
											},
											"issue": {
												"type": "string",
												"enum": [
													"not-object",
													"array",
													"missing-element-id",
													"empty-element-id",
													"non-string-element-id",
													"missing-focus",
													"nonfinite-focus",
													"missing-gap",
													"nonfinite-gap",
													"invalid-fixed-point"
												]
											},
											"readableTargetId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"classificationBlocked": {
												"type": "boolean"
											}
										},
										"required": [
											"connectorId",
											"sourceIndex",
											"rawKind",
											"issue",
											"readableTargetId",
											"classificationBlocked"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "malformed-end-binding"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"rawKind": {
												"type": "string"
											},
											"issue": {
												"type": "string",
												"enum": [
													"not-object",
													"array",
													"missing-element-id",
													"empty-element-id",
													"non-string-element-id",
													"missing-focus",
													"nonfinite-focus",
													"missing-gap",
													"nonfinite-gap",
													"invalid-fixed-point"
												]
											},
											"readableTargetId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"classificationBlocked": {
												"type": "boolean"
											}
										},
										"required": [
											"connectorId",
											"sourceIndex",
											"rawKind",
											"issue",
											"readableTargetId",
											"classificationBlocked"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "malformed-bound-elements"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"ownerId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"rawKind": {
												"type": "string"
											},
											"entryIndex": {
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
											},
											"issue": {
												"type": "string",
												"enum": [
													"not-array",
													"entry-not-object",
													"missing-id",
													"empty-id",
													"non-string-id",
													"missing-type",
													"invalid-type"
												]
											},
											"readableEntries": {
												"type": "array",
												"items": {
													"type": "object",
													"properties": {
														"id": {
															"type": "string",
															"minLength": 1
														},
														"type": {
															"type": "string",
															"enum": ["text", "arrow"]
														}
													},
													"required": ["id", "type"],
													"additionalProperties": false
												}
											},
											"classificationBlocked": {
												"type": "boolean"
											}
										},
										"required": [
											"ownerId",
											"sourceIndex",
											"rawKind",
											"entryIndex",
											"issue",
											"readableEntries",
											"classificationBlocked"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "malformed-container-id"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"textId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"rawKind": {
												"type": "string"
											},
											"rawDescription": {
												"type": "string"
											},
											"issue": {
												"type": "string",
												"enum": ["empty-container-id", "non-string-container-id"]
											},
											"ownerClassificationBlocked": {
												"type": "boolean"
											}
										},
										"required": [
											"textId",
											"sourceIndex",
											"rawKind",
											"rawDescription",
											"issue",
											"ownerClassificationBlocked"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "dangling-bound-text"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"ownerId": {
												"type": "string",
												"minLength": 1
											},
											"targetId": {
												"type": "string",
												"minLength": 1
											}
										},
										"required": ["ownerId", "targetId"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "dangling-bound-arrow"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"ownerId": {
												"type": "string",
												"minLength": 1
											},
											"targetId": {
												"type": "string",
												"minLength": 1
											}
										},
										"required": ["ownerId", "targetId"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "conflicting-bound-label-owner"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"textId": {
												"type": "string",
												"minLength": 1
											},
											"forwardContainerId": {
												"type": "string",
												"minLength": 1
											},
											"reverseContainerIds": {
												"type": "array",
												"items": {
													"type": "string",
													"minLength": 1
												}
											}
										},
										"required": ["textId", "forwardContainerId", "reverseContainerIds"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "persisted-agent-endpoint"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"type": "string",
												"minLength": 1
											},
											"end": {
												"type": "string",
												"enum": ["start", "end"]
											},
											"inputTargetId": {
												"type": "string",
												"minLength": 1
											},
											"bindingTargetId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											}
										},
										"required": ["connectorId", "end", "inputTargetId", "bindingTargetId"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "invalid-node-metadata"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"elementId": {
												"type": "string",
												"minLength": 1
											},
											"valueKind": {
												"type": "string"
											}
										},
										"required": ["elementId", "valueKind"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "invalid-code-binding"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"elementId": {
												"type": "string",
												"minLength": 1
											},
											"issues": {
												"minItems": 1,
												"type": "array",
												"items": {
													"type": "string"
												}
											}
										},
										"required": ["elementId", "issues"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "derived-link-persisted"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"elementId": {
												"type": "string",
												"minLength": 1
											},
											"link": {
												"type": "string"
											}
										},
										"required": ["elementId", "link"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "BROKEN_REFERENCE"
									},
									"reason": {
										"type": "string",
										"const": "invalid-library-attribution"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"elementId": {
												"type": "string",
												"minLength": 1
											},
											"issues": {
												"minItems": 1,
												"type": "array",
												"items": {
													"type": "string"
												}
											},
											"rescuedByGroup": {
												"type": "boolean"
											}
										},
										"required": ["elementId", "issues", "rescuedByGroup"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "LABEL_CORRUPTION"
									},
									"reason": {
										"type": "string",
										"const": "orphan"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"textId": {
												"type": "string",
												"minLength": 1
											},
											"containerId": {
												"type": "string",
												"minLength": 1
											}
										},
										"required": ["textId", "containerId"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "LABEL_CORRUPTION"
									},
									"reason": {
										"type": "string",
										"const": "duplicate"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"containerId": {
												"type": "string",
												"minLength": 1
											},
											"keeperId": {
												"type": "string",
												"minLength": 1
											},
											"duplicateIds": {
												"minItems": 1,
												"type": "array",
												"items": {
													"type": "string",
													"minLength": 1
												}
											}
										},
										"required": ["containerId", "keeperId", "duplicateIds"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "LABEL_CORRUPTION"
									},
									"reason": {
										"type": "string",
										"const": "missing-reciprocal"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"textId": {
												"type": "string",
												"minLength": 1
											},
											"containerId": {
												"type": "string",
												"minLength": 1
											},
											"missingSide": {
												"type": "string",
												"enum": ["text", "container"]
											}
										},
										"required": ["textId", "containerId", "missingSide"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "LABEL_CORRUPTION"
									},
									"reason": {
										"type": "string",
										"const": "conflicting-owner"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"textId": {
												"type": "string",
												"minLength": 1
											},
											"containerId": {
												"type": "string",
												"minLength": 1
											},
											"otherContainerIds": {
												"type": "array",
												"items": {
													"type": "string",
													"minLength": 1
												}
											}
										},
										"required": ["textId", "containerId", "otherContainerIds"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "LABEL_CORRUPTION"
									},
									"reason": {
										"type": "string",
										"const": "drift"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"textId": {
												"type": "string",
												"minLength": 1
											},
											"containerId": {
												"type": "string",
												"minLength": 1
											},
											"distance": {
												"type": "number",
												"minimum": 0
											},
											"allowed": {
												"type": "number",
												"minimum": 0
											}
										},
										"required": ["textId", "containerId", "distance", "allowed"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "LABEL_CORRUPTION"
									},
									"reason": {
										"type": "string",
										"const": "persisted-seed"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"elementId": {
												"type": "string",
												"minLength": 1
											},
											"seedField": {
												"type": "string",
												"enum": ["label", "text"]
											}
										},
										"required": ["elementId", "seedField"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "FONT_POLICY_VIOLATION"
									},
									"reason": {
										"type": "string",
										"const": "missing-font-family"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"effectiveFamily": {
												"type": "number",
												"const": 1
											},
											"allowedFamilies": {
												"anyOf": [
													{
														"type": "string",
														"const": "any"
													},
													{
														"type": "array",
														"items": {
															"type": "integer",
															"minimum": -9007199254740991,
															"maximum": 9007199254740991
														}
													}
												]
											}
										},
										"required": ["effectiveFamily", "allowedFamilies"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "FONT_POLICY_VIOLATION"
									},
									"reason": {
										"type": "string",
										"const": "disallowed-font-family"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"rawFamily": {
												"type": "integer",
												"minimum": -9007199254740991,
												"maximum": 9007199254740991
											},
											"effectiveFamily": {
												"type": "integer",
												"minimum": -9007199254740991,
												"maximum": 9007199254740991
											},
											"allowedFamilies": {
												"anyOf": [
													{
														"type": "string",
														"const": "any"
													},
													{
														"type": "array",
														"items": {
															"type": "integer",
															"minimum": -9007199254740991,
															"maximum": 9007199254740991
														}
													}
												]
											}
										},
										"required": ["rawFamily", "effectiveFamily", "allowedFamilies"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "FONT_POLICY_VIOLATION"
									},
									"reason": {
										"type": "string",
										"const": "invalid-font-family"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"rawType": {
												"type": "string"
											},
											"rawDescription": {
												"type": "string"
											},
											"allowedFamilies": {
												"anyOf": [
													{
														"type": "string",
														"const": "any"
													},
													{
														"type": "array",
														"items": {
															"type": "integer",
															"minimum": -9007199254740991,
															"maximum": 9007199254740991
														}
													}
												]
											}
										},
										"required": ["rawType", "rawDescription", "allowedFamilies"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "UNSUPPORTED_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "unsupported-type"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"rawType": {
												"type": "string"
											}
										},
										"required": ["rawType"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "UNSUPPORTED_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "rotation"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"angle": {
												"type": "number"
											}
										},
										"required": ["angle"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "UNSUPPORTED_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "curve"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"curveKind": {
												"type": "string"
											}
										},
										"required": ["curveKind"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "UNSUPPORTED_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "rounded-or-elbowed"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"roundness": {
												"anyOf": [
													{
														"type": "string"
													},
													{
														"type": "null"
													}
												]
											},
											"elbowed": {
												"type": "boolean"
											},
											"fixedSegments": {
												"type": "boolean"
											}
										},
										"required": ["roundness", "elbowed", "fixedSegments"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "AMBIGUOUS_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "points-missing"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"rawPointsKind": {
												"type": "string",
												"const": "missing"
											},
											"rawPointsDescription": {
												"type": "string"
											},
											"pointCount": {
												"type": "null"
											},
											"minimumRequired": {
												"type": "number",
												"const": 2
											},
											"issue": {
												"type": "string",
												"const": "missing"
											}
										},
										"required": [
											"connectorId",
											"sourceIndex",
											"rawPointsKind",
											"rawPointsDescription",
											"pointCount",
											"minimumRequired",
											"issue"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "AMBIGUOUS_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "points-not-array"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"rawPointsKind": {
												"type": "string"
											},
											"rawPointsDescription": {
												"type": "string"
											},
											"pointCount": {
												"type": "null"
											},
											"minimumRequired": {
												"type": "number",
												"const": 2
											},
											"issue": {
												"type": "string",
												"const": "non-array"
											}
										},
										"required": [
											"connectorId",
											"sourceIndex",
											"rawPointsKind",
											"rawPointsDescription",
											"pointCount",
											"minimumRequired",
											"issue"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "AMBIGUOUS_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "points-empty"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"rawPointsKind": {
												"type": "string",
												"const": "array"
											},
											"rawPointsDescription": {
												"type": "string"
											},
											"pointCount": {
												"type": "number",
												"const": 0
											},
											"minimumRequired": {
												"type": "number",
												"const": 2
											},
											"issue": {
												"type": "string",
												"const": "empty"
											}
										},
										"required": [
											"connectorId",
											"sourceIndex",
											"rawPointsKind",
											"rawPointsDescription",
											"pointCount",
											"minimumRequired",
											"issue"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "AMBIGUOUS_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "points-one-point"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"rawPointsKind": {
												"type": "string",
												"const": "array"
											},
											"rawPointsDescription": {
												"type": "string"
											},
											"pointCount": {
												"type": "number",
												"const": 1
											},
											"minimumRequired": {
												"type": "number",
												"const": 2
											},
											"issue": {
												"type": "string",
												"const": "insufficient-cardinality"
											}
										},
										"required": [
											"connectorId",
											"sourceIndex",
											"rawPointsKind",
											"rawPointsDescription",
											"pointCount",
											"minimumRequired",
											"issue"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "AMBIGUOUS_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "malformed-point"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"pointIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"issue": {
												"type": "string"
											}
										},
										"required": ["connectorId", "sourceIndex", "pointIndex", "issue"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "AMBIGUOUS_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "zero-length"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"anyOf": [
													{
														"type": "string",
														"minLength": 1
													},
													{
														"type": "null"
													}
												]
											},
											"sourceIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"segmentIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											}
										},
										"required": ["connectorId", "sourceIndex", "segmentIndex"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "AMBIGUOUS_GEOMETRY"
									},
									"reason": {
										"type": "string",
										"const": "collinear-overlap"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"firstConnectorId": {
												"type": "string",
												"minLength": 1
											},
											"firstSegmentIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"secondConnectorId": {
												"type": "string",
												"minLength": 1
											},
											"secondSegmentIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											}
										},
										"required": [
											"firstConnectorId",
											"firstSegmentIndex",
											"secondConnectorId",
											"secondSegmentIndex"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "INSPECTION_LIMIT_EXCEEDED"
									},
									"reason": {
										"type": "string",
										"const": "broad-phase-comparison-ceiling"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"limit": {
												"type": "integer",
												"exclusiveMinimum": 0,
												"maximum": 9007199254740991
											},
											"attempted": {
												"type": "integer",
												"exclusiveMinimum": 0,
												"maximum": 9007199254740991
											},
											"pass": {
												"type": "string"
											},
											"segmentCount": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"nodeCount": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"obstacleCount": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"labelCount": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											}
										},
										"required": [
											"limit",
											"attempted",
											"pass",
											"segmentCount",
											"nodeCount",
											"obstacleCount",
											"labelCount"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "CONNECTOR_PENETRATES_NODE"
									},
									"reason": {
										"type": "string",
										"const": "leaf-footprint-interior"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"type": "string",
												"minLength": 1
											},
											"segmentIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"nodeId": {
												"type": "string",
												"minLength": 1
											},
											"entry": {
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													}
												},
												"required": ["x", "y"],
												"additionalProperties": false
											},
											"exit": {
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													}
												},
												"required": ["x", "y"],
												"additionalProperties": false
											}
										},
										"required": ["connectorId", "segmentIndex", "nodeId", "entry", "exit"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "CONNECTOR_PENETRATES_OBSTACLE"
									},
									"reason": {
										"type": "string",
										"const": "obstacle-footprint-interior"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"connectorId": {
												"type": "string",
												"minLength": 1
											},
											"segmentIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"obstacleId": {
												"type": "string",
												"minLength": 1
											},
											"entry": {
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													}
												},
												"required": ["x", "y"],
												"additionalProperties": false
											},
											"exit": {
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													}
												},
												"required": ["x", "y"],
												"additionalProperties": false
											}
										},
										"required": ["connectorId", "segmentIndex", "obstacleId", "entry", "exit"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "CONNECTOR_INTERSECTION_UNMARKED"
									},
									"reason": {
										"type": "string",
										"const": "proper-interior-crossing"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"firstConnectorId": {
												"type": "string",
												"minLength": 1
											},
											"firstSegmentIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"secondConnectorId": {
												"type": "string",
												"minLength": 1
											},
											"secondSegmentIndex": {
												"type": "integer",
												"minimum": 0,
												"maximum": 9007199254740991
											},
											"point": {
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													}
												},
												"required": ["x", "y"],
												"additionalProperties": false
											}
										},
										"required": [
											"firstConnectorId",
											"firstSegmentIndex",
											"secondConnectorId",
											"secondSegmentIndex",
											"point"
										],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "NODE_OVERLAP"
									},
									"reason": {
										"type": "string",
										"const": "leaf-footprint-overlap"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"firstNodeId": {
												"type": "string",
												"minLength": 1
											},
											"secondNodeId": {
												"type": "string",
												"minLength": 1
											},
											"overlapWidth": {
												"type": "number",
												"minimum": 0
											},
											"overlapHeight": {
												"type": "number",
												"minimum": 0
											}
										},
										"required": ["firstNodeId", "secondNodeId", "overlapWidth", "overlapHeight"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "LABEL_OVERLAP"
									},
									"reason": {
										"type": "string",
										"const": "label-node-overlap"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"labelId": {
												"type": "string",
												"minLength": 1
											},
											"nodeId": {
												"type": "string",
												"minLength": 1
											},
											"overlapWidth": {
												"type": "number",
												"minimum": 0
											},
											"overlapHeight": {
												"type": "number",
												"minimum": 0
											}
										},
										"required": ["labelId", "nodeId", "overlapWidth", "overlapHeight"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							},
							{
								"type": "object",
								"properties": {
									"code": {
										"type": "string",
										"const": "LABEL_OVERLAP"
									},
									"reason": {
										"type": "string",
										"const": "label-label-overlap"
									},
									"severity": {
										"type": "string",
										"enum": ["error", "warning"]
									},
									"affectsCoverage": {
										"type": "boolean"
									},
									"message": {
										"type": "string",
										"minLength": 1
									},
									"elements": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"type": {
													"anyOf": [
														{
															"type": "string"
														},
														{
															"type": "null"
														}
													]
												},
												"sourceIndex": {
													"type": "integer",
													"minimum": 0,
													"maximum": 9007199254740991
												}
											},
											"required": ["id", "type", "sourceIndex"],
											"additionalProperties": false
										}
									},
									"nodes": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"minLength": 1
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"labelElementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												}
											},
											"required": ["id", "elementIds", "labelElementIds"],
											"additionalProperties": false
										}
									},
									"obstacles": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"id": {
													"type": "string",
													"pattern": "^obstacle:.*"
												},
												"kind": {
													"type": "string",
													"enum": ["library-component", "grouped-component"]
												},
												"elementIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"groupIds": {
													"type": "array",
													"items": {
														"type": "string",
														"minLength": 1
													}
												},
												"library": {
													"type": "array",
													"items": {
														"type": "object",
														"properties": {
															"elementId": {
																"type": "string",
																"minLength": 1
															},
															"item": {
																"type": "string",
																"minLength": 1
															},
															"source": {
																"type": "string"
															}
														},
														"required": ["elementId", "item"],
														"additionalProperties": false
													}
												}
											},
											"required": ["id", "kind", "elementIds", "groupIds", "library"],
											"additionalProperties": false
										}
									},
									"points": {
										"type": "array",
										"items": {
											"type": "object",
											"properties": {
												"x": {
													"type": "number"
												},
												"y": {
													"type": "number"
												}
											},
											"required": ["x", "y"],
											"additionalProperties": false
										}
									},
									"affectedBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"focusBBox": {
										"anyOf": [
											{
												"type": "object",
												"properties": {
													"x": {
														"type": "number"
													},
													"y": {
														"type": "number"
													},
													"width": {
														"type": "number",
														"minimum": 0
													},
													"height": {
														"type": "number",
														"minimum": 0
													}
												},
												"required": ["x", "y", "width", "height"],
												"additionalProperties": false
											},
											{
												"type": "null"
											}
										]
									},
									"details": {
										"type": "object",
										"properties": {
											"firstLabelId": {
												"type": "string",
												"minLength": 1
											},
											"secondLabelId": {
												"type": "string",
												"minLength": 1
											},
											"overlapWidth": {
												"type": "number",
												"minimum": 0
											},
											"overlapHeight": {
												"type": "number",
												"minimum": 0
											}
										},
										"required": ["firstLabelId", "secondLabelId", "overlapWidth", "overlapHeight"],
										"additionalProperties": false
									}
								},
								"required": [
									"code",
									"reason",
									"severity",
									"affectsCoverage",
									"message",
									"elements",
									"nodes",
									"obstacles",
									"points",
									"affectedBBox",
									"focusBBox",
									"details"
								],
								"additionalProperties": false
							}
						]
					}
				},
				"board": {
					"type": "string",
					"minLength": 1
				}
			},
			"required": [
				"schemaVersion",
				"success",
				"policy",
				"limits",
				"totalElementCount",
				"liveElementCount",
				"locatableElementCount",
				"broadPhaseComparisons",
				"coverage",
				"clean",
				"maxSeverity",
				"counts",
				"coverageReasons",
				"findings",
				"board"
			],
			"additionalProperties": false
		},
		{
			"type": "string"
		}
	]
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

## claim

Takes or extends a board lease for substantial work.

Usage:

```text
archboard claim --board <key> --reason <reason> [--for 10m]
```

Output: json (Claim state).

Prerequisites: server, board. Effects: server-state-write.

REST relationships:

- POST `/api/boards/claim`, one. Take or extend the claim

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean"
		},
		"board": {
			"type": "string"
		},
		"created": {
			"type": "boolean"
		},
		"claim": {
			"type": "object",
			"properties": {
				"board": {
					"type": "string"
				},
				"holder": {
					"type": "object",
					"properties": {
						"id": {
							"type": "string"
						},
						"kind": {
							"type": "string"
						},
						"since": {
							"type": "string"
						},
						"until": {
							"type": "string"
						},
						"process": {
							"type": "string"
						},
						"reason": {
							"type": "string"
						}
					},
					"required": ["id", "kind", "since", "until", "process"],
					"additionalProperties": {}
				},
				"expires": {
					"type": "string"
				}
			},
			"required": ["board", "holder", "expires"],
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
	"required": ["success", "board", "created", "claim"],
	"additionalProperties": {}
}
```

## release

Ends this caller's board claim if one remains.

Usage:

```text
archboard release --board <key>
```

Output: json (Release state).

Prerequisites: server, board. Effects: server-state-write.

REST relationships:

- POST `/api/boards/release`, one. Release the claim

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean"
		},
		"board": {
			"type": "string"
		},
		"released": {
			"type": "boolean"
		},
		"claim": {
			"anyOf": [
				{
					"type": "object",
					"properties": {
						"board": {
							"type": "string"
						},
						"holder": {
							"type": "object",
							"properties": {
								"id": {
									"type": "string"
								},
								"kind": {
									"type": "string"
								},
								"since": {
									"type": "string"
								},
								"until": {
									"type": "string"
								},
								"process": {
									"type": "string"
								},
								"reason": {
									"type": "string"
								}
							},
							"required": ["id", "kind", "since", "until", "process"],
							"additionalProperties": {}
						},
						"expires": {
							"type": "string"
						}
					},
					"required": ["board", "holder", "expires"],
					"additionalProperties": {}
				},
				{
					"type": "null"
				}
			]
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
	"required": ["success", "board", "released", "claim"],
	"additionalProperties": {}
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
		"enabled": {
			"type": "boolean"
		},
		"armed": {
			"type": "boolean"
		},
		"loud": {
			"type": "boolean"
		},
		"refusal": {
			"anyOf": [
				{
					"type": "string"
				},
				{
					"type": "null"
				}
			]
		},
		"host": {
			"anyOf": [
				{
					"type": "string"
				},
				{
					"type": "null"
				}
			]
		},
		"socket": {
			"type": "object",
			"properties": {
				"path": {
					"type": "string"
				},
				"exists": {
					"type": "boolean"
				},
				"isSocket": {
					"type": "boolean"
				},
				"ownedByUs": {
					"type": "boolean"
				},
				"mode": {
					"type": "string"
				},
				"problem": {
					"type": "string"
				}
			},
			"required": ["path", "exists", "isSocket", "ownedByUs"],
			"additionalProperties": {}
		},
		"connected": {
			"type": "boolean"
		},
		"lastError": {
			"anyOf": [
				{
					"type": "string"
				},
				{
					"type": "null"
				}
			]
		},
		"target": {
			"type": "object",
			"properties": {
				"threadId": {
					"anyOf": [
						{
							"type": "string"
						},
						{
							"type": "null"
						}
					]
				},
				"reason": {
					"type": "string",
					"enum": ["pinned", "none"]
				},
				"explanation": {
					"type": "string"
				},
				"activeTurnId": {
					"anyOf": [
						{
							"type": "string"
						},
						{
							"type": "null"
						}
					]
				}
			},
			"required": ["threadId", "reason", "explanation"],
			"additionalProperties": {}
		},
		"threadsSeen": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"pending": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"debounceMs": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"minIntervalMs": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"injected": {
			"type": "object",
			"properties": {
				"quiet": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"loud": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"failed": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				}
			},
			"required": ["quiet", "loud", "failed"],
			"additionalProperties": {}
		},
		"lastInjectionAt": {
			"anyOf": [
				{
					"type": "string"
				},
				{
					"type": "null"
				}
			]
		},
		"lastInjection": {
			"anyOf": [
				{
					"type": "object",
					"properties": {
						"channel": {
							"type": "string",
							"enum": ["quiet", "loud"]
						},
						"threadId": {
							"type": "string"
						},
						"at": {
							"type": "string"
						},
						"text": {
							"type": "string"
						}
					},
					"required": ["channel", "threadId", "at", "text"],
					"additionalProperties": {}
				},
				{
					"type": "null"
				}
			]
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
	"required": [
		"enabled",
		"armed",
		"loud",
		"refusal",
		"host",
		"socket",
		"connected",
		"lastError",
		"target",
		"threadsSeen",
		"pending",
		"debounceMs",
		"minIntervalMs",
		"injected",
		"lastInjectionAt",
		"lastInjection"
	],
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

Prerequisites: server. Effects: server-state-write.

REST relationships:

- POST `/api/injection/test`, one. Send the injection probe

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"channel": {
			"type": "string",
			"enum": ["quiet", "loud"]
		},
		"threadId": {
			"type": "string"
		},
		"text": {
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
	"required": ["channel", "threadId", "text"],
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

## screenshot

Renders one pane in the browser and returns raw SVG or a validated file receipt.

Usage:

```text
archboard screenshot [--out file.png] [--format png|svg] [--no-background] [--pane <spec>]
```

Output: raw (Raw SVG image); file-receipt (Written image receipt).

Prerequisites: server, browser. Effects: browser, local-write.

REST relationships:

- POST `/api/export/image`, one. Render the selected pane

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
				"format": {
					"type": "string",
					"enum": ["png", "svg"]
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
			"required": ["success", "file", "format"],
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

## mermaid

Reads Mermaid text locally before contacting the canvas, then converts it in the board's pane.

Usage:

```text
archboard mermaid [diagram.mmd|-] (or stdin)
```

Output: json (Mermaid conversion receipt).

Prerequisites: server, browser, board, doing. Effects: local-read, browser, write.

REST relationships:

- POST `/api/elements/from-mermaid`, one. Convert and write the diagram

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"success": {
			"type": "boolean"
		},
		"board": {
			"type": "string"
		},
		"pane": {
			"anyOf": [
				{
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
				},
				{
					"type": "null"
				}
			]
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
	"required": ["success", "pane"],
	"additionalProperties": {}
}
```

## snapshot

Routes snapshot lifecycle commands.

Usage:

```text
archboard snapshot save|list|restore [name] [--force]
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

## snapshot save

Captures the named board as an immutable snapshot.

Usage:

```text
archboard snapshot save <name>
```

Output: json (Saved snapshot).

Prerequisites: server, board. Effects: server-state-write.

REST relationships:

- POST `/api/snapshots`, one. Save the snapshot

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
		"name": {
			"type": "string"
		},
		"elements": {
			"type": "integer",
			"minimum": 0,
			"maximum": 9007199254740991
		},
		"createdAt": {
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
	"required": ["success", "name", "elements", "createdAt"],
	"additionalProperties": false
}
```

## snapshot list

Lists snapshots associated with the named board.

Usage:

```text
archboard snapshot list
```

Output: json (Snapshot listing).

Prerequisites: server, board. Effects: read.

REST relationships:

- GET `/api/snapshots`, one. List snapshots

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "array",
	"items": {
		"type": "object",
		"properties": {
			"name": {
				"type": "string"
			},
			"createdAt": {
				"type": "string"
			},
			"elementCount": {
				"type": "integer",
				"minimum": 0,
				"maximum": 9007199254740991
			}
		},
		"required": ["name", "createdAt"],
		"additionalProperties": {}
	}
}
```

## snapshot restore

Reads the snapshot and target before clearing and restoring the board.

Usage:

```text
archboard snapshot restore <name> [--force]
```

Output: json (Restored snapshot).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/snapshots/:name`, one. Read the snapshot
- GET `/api/boards/info`, one. Read the target board
- DELETE `/api/elements/clear`, one. Clear the target
- POST `/api/elements/batch`, one. Restore elements

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
		"name": {
			"type": "string"
		},
		"board": {
			"type": "string"
		},
		"restored": {
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
	"required": ["success", "name", "board", "restored"],
	"additionalProperties": false
}
```

## library

Routes stencil catalogue commands.

Usage:

```text
archboard library list [--text] | library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]
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

## library list

Reads the server-backed stencil catalogue.

Usage:

```text
archboard library list [--text]
```

Output: json (Structured catalogue); text (Human-readable catalogue).

Prerequisites: server. Effects: read.

REST relationships:

- GET `/api/library`, one. Read the catalogue

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"anyOf": [
		{
			"type": "object",
			"properties": {
				"count": {
					"type": "integer",
					"minimum": 0,
					"maximum": 9007199254740991
				},
				"seeded": {
					"type": "array",
					"items": {
						"type": "string"
					}
				},
				"file": {
					"anyOf": [
						{
							"type": "string"
						},
						{
							"type": "null"
						}
					]
				},
				"vaultBacked": {
					"type": "boolean"
				},
				"items": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"id": {
								"type": "string"
							},
							"name": {
								"anyOf": [
									{
										"type": "string"
									},
									{
										"type": "null"
									}
								]
							},
							"source": {
								"anyOf": [
									{
										"type": "string"
									},
									{
										"type": "null"
									}
								]
							},
							"elements": {
								"type": "integer",
								"minimum": 0,
								"maximum": 9007199254740991
							},
							"width": {
								"type": "number",
								"minimum": 0
							},
							"height": {
								"type": "number",
								"minimum": 0
							},
							"text": {
								"anyOf": [
									{
										"type": "string"
									},
									{
										"type": "null"
									}
								]
							}
						},
						"required": ["id", "name", "source", "elements", "width", "height", "text"],
						"additionalProperties": false
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
			"required": ["count", "seeded", "file", "vaultBacked", "items"],
			"additionalProperties": {}
		},
		{
			"type": "string"
		}
	]
}
```

## library insert

Copies one catalogue stencil to a board in one write.

Usage:

```text
archboard library insert <name> --x <x> --y <y> [--source <file>] [--id <libraryItemId>]
```

Output: json (Inserted stencil).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/library`, one. Read the catalogue
- POST `/api/elements/batch`, one. Insert the stencil

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
		"name": {
			"anyOf": [
				{
					"type": "string"
				},
				{
					"type": "null"
				}
			]
		},
		"source": {
			"anyOf": [
				{
					"type": "string"
				},
				{
					"type": "null"
				}
			]
		},
		"id": {
			"type": "string"
		},
		"at": {
			"type": "object",
			"properties": {
				"x": {
					"type": "number"
				},
				"y": {
					"type": "number"
				}
			},
			"required": ["x", "y"],
			"additionalProperties": false
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
	"required": ["success", "name", "source", "id", "at", "count", "elements"],
	"additionalProperties": {}
}
```

## arrange

Routes element arrangement commands.

Usage:

```text
archboard arrange align|distribute|group|ungroup|lock|unlock|duplicate ...
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

## arrange align

Aligns selected elements in one write.

Usage:

```text
archboard arrange align --ids a,b,c --to left|center|right|top|middle|bottom
```

Output: json (Arrangement result).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/elements`, one. Read arrangement targets
- POST `/api/elements/changes`, one. Apply the arrangement in one write

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"aligned": {
			"type": "boolean"
		},
		"elementIds": {
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"alignment": {
			"type": "string",
			"enum": ["left", "center", "right", "top", "middle", "bottom"]
		},
		"successCount": {
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
	"required": ["aligned", "elementIds", "alignment", "successCount"],
	"additionalProperties": {}
}
```

## arrange distribute

Distributes selected elements in one write.

Usage:

```text
archboard arrange distribute --ids a,b,c --to horizontal|vertical
```

Output: json (Arrangement result).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/elements`, one. Read arrangement targets
- POST `/api/elements/changes`, one. Apply the arrangement in one write

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"distributed": {
			"type": "boolean"
		},
		"elementIds": {
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"direction": {
			"type": "string",
			"enum": ["horizontal", "vertical"]
		},
		"count": {
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
	"required": ["distributed", "elementIds", "direction", "count"],
	"additionalProperties": {}
}
```

## arrange group

Groups selected elements in one write.

Usage:

```text
archboard arrange group --ids a,b,c
```

Output: json (Arrangement result).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/elements`, one. Read arrangement targets
- POST `/api/elements/changes`, one. Apply the arrangement in one write

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"groupId": {
			"type": "string"
		},
		"elementIds": {
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"successCount": {
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
	"required": ["groupId", "elementIds", "successCount"],
	"additionalProperties": {}
}
```

## arrange ungroup

Removes one group in one write.

Usage:

```text
archboard arrange ungroup --group <groupId>
```

Output: json (Arrangement result).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/elements`, one. Read arrangement targets
- POST `/api/elements/changes`, one. Apply the arrangement in one write

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"groupId": {
			"type": "string"
		},
		"ungrouped": {
			"type": "boolean"
		},
		"elementIds": {
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"successCount": {
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
	"required": ["groupId", "ungrouped", "elementIds", "successCount"],
	"additionalProperties": {}
}
```

## arrange lock

Locks selected elements in one write.

Usage:

```text
archboard arrange lock --ids a,b,c
```

Output: json (Arrangement result).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/elements`, one. Read arrangement targets
- POST `/api/elements/changes`, one. Apply the arrangement in one write

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"locked": {
			"type": "boolean",
			"const": true
		},
		"elementIds": {
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"successCount": {
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
	"required": ["locked", "elementIds", "successCount"],
	"additionalProperties": {}
}
```

## arrange unlock

Unlocks selected elements in one write.

Usage:

```text
archboard arrange unlock --ids a,b,c
```

Output: json (Arrangement result).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/elements`, one. Read arrangement targets
- POST `/api/elements/changes`, one. Apply the arrangement in one write

Public result JSON Schema:

```json
{
	"$schema": "https://json-schema.org/draft/2020-12/schema",
	"type": "object",
	"properties": {
		"unlocked": {
			"type": "boolean",
			"const": true
		},
		"elementIds": {
			"type": "array",
			"items": {
				"type": "string"
			}
		},
		"successCount": {
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
	"required": ["unlocked", "elementIds", "successCount"],
	"additionalProperties": {}
}
```

## arrange duplicate

Duplicates selected elements in one write.

Usage:

```text
archboard arrange duplicate --ids a,b,c [--offset 20,20]
```

Output: json (Arrangement result).

Prerequisites: server, board, doing. Effects: read, write.

REST relationships:

- GET `/api/elements`, one. Read arrangement targets
- POST `/api/elements/changes`, one. Apply the arrangement in one write

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
		"offsetX": {
			"type": "number"
		},
		"offsetY": {
			"type": "number"
		},
		"elements": {
			"anyOf": [
				{
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"id": {
								"type": "string"
							}
						},
						"required": ["id"],
						"additionalProperties": {}
					}
				},
				{
					"type": "null"
				}
			]
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
	"required": ["success", "count", "offsetX", "offsetY", "elements"],
	"additionalProperties": {}
}
```

## share

Reads only the board elements and uploads an encrypted share payload.

Usage:

```text
archboard share
```

Output: json (Share URL).

Prerequisites: server, board. Effects: read.

REST relationships:

- GET `/api/elements`, one. Read elements for the share payload

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
		"url": {
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
	"required": ["success", "url"],
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
