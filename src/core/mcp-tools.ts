import type { Tool } from '@modelcontextprotocol/server';
import { EXCALIDRAW_ELEMENT_TYPES } from '../types.js';
import { KINDS } from './promote.js';

// Tool definitions
export const tools: Tool[] = [
  {
    name: 'create_element',
    description: 'Create a new Excalidraw element. For arrows, use startElementId/endElementId to bind to shapes (auto-routes to edges).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Custom element ID (optional, auto-generated if omitted). Use with startElementId/endElementId in batch_create_elements.' },
        type: {
          type: 'string',
          enum: Object.values(EXCALIDRAW_ELEMENT_TYPES)
        },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        backgroundColor: { type: 'string' },
        strokeColor: { type: 'string' },
        strokeWidth: { type: 'number' },
        strokeStyle: { type: 'string', description: 'Stroke style: solid, dashed, dotted' },
        roughness: { type: 'number' },
        opacity: { type: 'number' },
        text: { type: 'string' },
        fontSize: { type: 'number' },
        fontFamily: { type: ['string', 'number'], description: 'Font family: virgil/hand/handwritten (1), helvetica/sans/sans-serif (2), cascadia/mono/monospace (3), excalifont (5), nunito (6), lilita/lilita one (7), comic shanns/comic (8), or numeric ID' },
        startElementId: { type: 'string', description: 'For arrows: ID of the element to bind the arrow start to. Arrow auto-routes to element edge.' },
        endElementId: { type: 'string', description: 'For arrows: ID of the element to bind the arrow end to. Arrow auto-routes to element edge.' },
        endArrowhead: { type: 'string', description: 'Arrowhead style at end: arrow, bar, dot, triangle, or null' },
        startArrowhead: { type: 'string', description: 'Arrowhead style at start: arrow, bar, dot, triangle, or null' }
      },
      required: ['type', 'x', 'y']
    }
  },
  {
    name: 'update_element',
    description: 'Update an existing Excalidraw element',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: {
          type: 'string',
          enum: Object.values(EXCALIDRAW_ELEMENT_TYPES)
        },
        x: { type: 'number' },
        y: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        backgroundColor: { type: 'string' },
        strokeColor: { type: 'string' },
        strokeWidth: { type: 'number' },
        strokeStyle: { type: 'string' },
        roughness: { type: 'number' },
        opacity: { type: 'number' },
        text: { type: 'string' },
        fontSize: { type: 'number' },
        fontFamily: { type: ['string', 'number'], description: 'Font family: virgil/hand/handwritten (1), helvetica/sans/sans-serif (2), cascadia/mono/monospace (3), excalifont (5), nunito (6), lilita/lilita one (7), comic shanns/comic (8), or numeric ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_element',
    description: 'Delete an Excalidraw element',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'query_elements',
    description: 'Query Excalidraw elements with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: Object.values(EXCALIDRAW_ELEMENT_TYPES)
        },
        filter: {
          type: 'object',
          additionalProperties: true
        },
        bbox: {
          type: 'object',
          description: 'Bounding box filter — only return elements whose origin (x, y) falls within the given coordinate range',
          properties: {
            x_min: { type: 'number' },
            x_max: { type: 'number' },
            y_min: { type: 'number' },
            y_max: { type: 'number' }
          }
        }
      }
    }
  },
  {
    name: 'get_resource',
    description: 'Get an Excalidraw resource',
    inputSchema: {
      type: 'object',
      properties: {
        resource: { 
          type: 'string', 
          enum: ['scene', 'library', 'theme', 'elements'] 
        }
      },
      required: ['resource']
    }
  },
  {
    name: 'group_elements',
    description: 'Group multiple elements together',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: { 
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['elementIds']
    }
  },
  {
    name: 'ungroup_elements',
    description: 'Ungroup a group of elements',
    inputSchema: {
      type: 'object',
      properties: {
        groupId: { type: 'string' }
      },
      required: ['groupId']
    }
  },
  {
    name: 'align_elements',
    description: 'Align elements to a specific position',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: { 
          type: 'array',
          items: { type: 'string' }
        },
        alignment: { 
          type: 'string', 
          enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'] 
        }
      },
      required: ['elementIds', 'alignment']
    }
  },
  {
    name: 'distribute_elements',
    description: 'Distribute elements evenly',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: { 
          type: 'array',
          items: { type: 'string' }
        },
        direction: { 
          type: 'string', 
          enum: ['horizontal', 'vertical'] 
        }
      },
      required: ['elementIds', 'direction']
    }
  },
  {
    name: 'lock_elements',
    description: 'Lock elements to prevent modification',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: { 
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['elementIds']
    }
  },
  {
    name: 'unlock_elements',
    description: 'Unlock elements to allow modification',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: { 
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['elementIds']
    }
  },
  {
    name: 'create_from_mermaid',
    description: 'Convert a Mermaid diagram to Excalidraw elements and render them on the canvas',
    inputSchema: {
      type: 'object',
      properties: {
        mermaidDiagram: {
          type: 'string',
          description: 'The Mermaid diagram definition (e.g., "graph TD; A-->B; B-->C;")'
        },
        config: {
          type: 'object',
          description: 'Optional Mermaid configuration',
          properties: {
            startOnLoad: { type: 'boolean' },
            flowchart: {
              type: 'object',
              properties: {
                curve: { type: 'string', enum: ['linear', 'basis'] }
              }
            },
            themeVariables: {
              type: 'object',
              properties: {
                fontSize: { type: 'string' }
              }
            },
            maxEdges: { type: 'number' },
            maxTextSize: { type: 'number' }
          }
        }
      },
      required: ['mermaidDiagram']
    }
  },
  {
    name: 'batch_create_elements',
    description: 'Create multiple Excalidraw elements at once. For arrows, use startElementId/endElementId to bind arrows to shapes — Excalidraw auto-routes to element edges. Assign custom id to shapes so arrows can reference them.',
    inputSchema: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Custom element ID. Arrows can reference this via startElementId/endElementId.' },
              type: {
                type: 'string',
                enum: Object.values(EXCALIDRAW_ELEMENT_TYPES)
              },
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
              backgroundColor: { type: 'string' },
              strokeColor: { type: 'string' },
              strokeWidth: { type: 'number' },
              strokeStyle: { type: 'string', description: 'Stroke style: solid, dashed, dotted' },
              roughness: { type: 'number' },
              opacity: { type: 'number' },
              text: { type: 'string' },
              fontSize: { type: 'number' },
              fontFamily: { type: ['string', 'number'], description: 'Font family: virgil/hand/handwritten (1), helvetica/sans/sans-serif (2), cascadia/mono/monospace (3), excalifont (5), nunito (6), lilita/lilita one (7), comic shanns/comic (8), or numeric ID' },
              startElementId: { type: 'string', description: 'For arrows: ID of element to bind arrow start to' },
              endElementId: { type: 'string', description: 'For arrows: ID of element to bind arrow end to' },
              endArrowhead: { type: 'string', description: 'Arrowhead style at end: arrow, bar, dot, triangle, or null' },
              startArrowhead: { type: 'string', description: 'Arrowhead style at start: arrow, bar, dot, triangle, or null' }
            },
            required: ['type', 'x', 'y']
          }
        }
      },
      required: ['elements']
    }
  },
  {
    name: 'get_element',
    description: 'Get a single Excalidraw element by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The element ID' }
      },
      required: ['id']
    }
  },
  {
    name: 'clear_canvas',
    description: 'Clear all elements from the canvas',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'export_scene',
    description: 'Export the current canvas to .excalidraw JSON format. Optionally write to a file; a path ending in .md is written in the Obsidian Excalidraw plugin format (.excalidraw.md).',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Optional file path to write the scene to (.excalidraw for raw JSON, .excalidraw.md for the Obsidian Excalidraw plugin format)'
        }
      }
    }
  },
  {
    name: 'import_scene',
    description: 'Import elements from a .excalidraw JSON file, an Obsidian .excalidraw.md file, or raw JSON data',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to a .excalidraw JSON or Obsidian .excalidraw.md file'
        },
        data: {
          type: 'string',
          description: 'Raw .excalidraw JSON string (alternative to filePath)'
        },
        mode: {
          type: 'string',
          enum: ['replace', 'merge'],
          description: '"replace" clears canvas first, "merge" appends to existing elements'
        }
      },
      required: ['mode']
    }
  },
  {
    name: 'export_to_image',
    description: 'Export the current canvas to PNG or SVG image. Requires the canvas frontend to be open in a browser.',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['png', 'svg'],
          description: 'Image format'
        },
        filePath: {
          type: 'string',
          description: 'Optional file path to save the image'
        },
        background: {
          type: 'boolean',
          description: 'Include background in export (default: true)'
        }
      },
      required: ['format']
    }
  },
  {
    name: 'duplicate_elements',
    description: 'Duplicate elements with a configurable offset',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of elements to duplicate'
        },
        offsetX: { type: 'number', description: 'Horizontal offset (default: 20)' },
        offsetY: { type: 'number', description: 'Vertical offset (default: 20)' }
      },
      required: ['elementIds']
    }
  },
  {
    name: 'snapshot_scene',
    description: 'Save a named snapshot of the current canvas state for later restoration',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name for this snapshot'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'restore_snapshot',
    description: 'Restore the canvas from a previously saved named snapshot',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the snapshot to restore'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'list_boards',
    description: "Every board in the vault, plus which ones are open in this session and which one the canvas is currently holding. A board is a named, persisted diagram; the canvas shows exactly one at a time. Call this before opening a board to see what exists.",
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'open_board',
    description: "Load a board from the vault onto the canvas, replacing whatever board was there. Address it as 'payments' or 'payments@proposed' — the variant 'current' is the architecture that exists and owns the bare name, every other variant is a proposal. A board already open keeps its unsaved work and is simply switched back to; pass reload to discard that and re-read the file.",
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: "Board address: 'payments' or 'payments@proposed'." },
        variant: { type: 'string', description: "Variant, if not given as part of the address. Defaults to 'current'." },
        level: { type: 'string', description: 'Abstraction tier: system, service, or module. Overrides what the note declares.' },
        reload: { type: 'boolean', description: 'Discard the in-memory copy and re-read the vault file.' }
      },
      required: ['board']
    }
  },
  {
    name: 'new_board',
    description: "Start a new, empty board and put it on the canvas. It lives in memory only until save_board writes it to the vault. Refuses a name the vault already has — open that one instead. Use a new variant of an existing name (e.g. payments@option-a) to author a proposal alongside the current architecture.",
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: "Board address: 'payments' or 'payments@option-a'." },
        variant: { type: 'string', description: "Variant, if not given as part of the address. Defaults to 'current'." },
        level: { type: 'string', description: 'Abstraction tier: system, service, or module.' }
      },
      required: ['board']
    }
  },
  {
    name: 'save_board',
    description: "Write the board the canvas is holding back to its .excalidraw.md note in the vault, preserving the note's frontmatter and prose. Pass name to save it as a different board (which is how the unnamed scratch board gets a name). THE SAVE CAN BE REFUSED: archboard hashes a note when it reads it and verifies that hash before writing, so if the file changed underneath (Obsidian, a sync client, another editor) or archboard has never read what is at that address, nothing is written and the refusal comes back with three ways out — reload the note (open_board with reload, discarding the canvas), overwrite it (force, discarding the note), or save under another name. Relay the refusal and those three choices to the human and let them pick; never choose for them.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Save as this board instead of the current one. Accepts name or name@variant.' },
        variant: { type: 'string', description: 'Save as this variant of the same board.' },
        level: { type: 'string', description: 'Set the board\'s abstraction tier: system, service, or module.' },
        force: { type: 'boolean', description: 'Overwrite a note archboard has not seen, destroying whatever it holds. Only ever pass this after a refused save when the human has said to overwrite.' }
      }
    }
  },
  {
    name: 'describe_scene',
    description: 'Get an AI-readable description of the current canvas: element types, positions, connections, labels, spatial layout, and bounding box. Use this to understand what is on the canvas before making changes.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_selection',
    description: "What the human currently has selected on the canvas — the elements they mean when they say \"this\" or \"these\". Returns element ids plus labels, whether each is an archboard node, its kind and binding. Call this when an instruction refers to selected elements instead of naming them. Cheap: it reads pushed state, not the whole scene.",
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'promote_selection',
    description: "Promotion: declare what the human has selected to be an architecture node — give it a kind, a stable node identity, and usually a binding to code, in one act. Call this for \"map this to the payments service\", \"these are the queues\", \"this box is the auth gateway\". Operates on the current selection by default, so no element ids need to be spoken; pass elementIds only when acting on something you just drew. One call makes ONE node out of everything selected (one kind, one name, one binding = one node's worth of meaning); set each=true to make one node per selected shape instead, which only accepts a kind.",
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: [...KINDS],
          description: 'What sort of architectural unit this node stands for. A controlled vocabulary — anything else is rejected.'
        },
        name: { type: 'string', description: "What to call the node. Defaults to the label on the largest selected shape." },
        node: { type: 'string', description: 'Explicit node id (slugified). Omit to derive one from the name; pass an existing id to re-promote or to join an identity used on another board.' },
        path: { type: 'string', description: 'Bind the node to code: a path, absolute or relative to the working directory. Repo identity, branch and commit are resolved from git.' },
        repo: { type: 'string', description: 'Repository identity (host/owner/name) when it cannot be resolved from git.' },
        branch: { type: 'string', description: 'Branch at which the binding is confirmed. Defaults to the checked-out branch.' },
        commit: { type: 'string', description: 'Commit at which the binding is confirmed. Defaults to HEAD.' },
        variant: { type: 'string', description: "Which variant of the board this node belongs to. Defaults to 'current' — the architecture that exists." },
        level: { type: 'string', description: 'Abstraction tier: system, service, or module.' },
        each: { type: 'boolean', description: 'Promote every selected shape into its own node, named from its own label. Rejects name, node and path, which belong to a single node.' },
        elementIds: { type: 'array', items: { type: 'string' }, description: 'Override the selection with explicit element ids.' }
      },
      required: ['kind']
    }
  },
  {
    name: 'demote_selection',
    description: 'Reverse a promotion: strip archboard metadata from the selected nodes so they become plain elements again. A node may be several elements, so touching any one of them demotes the whole node. Other tools\' customData is left alone.',
    inputSchema: {
      type: 'object',
      properties: {
        elementIds: { type: 'array', items: { type: 'string' }, description: 'Override the selection with explicit element ids.' }
      }
    }
  },
  {
    name: 'get_canvas_screenshot',
    description: 'Take a screenshot of the current canvas and return it as an image. Requires the canvas frontend to be open in a browser. Use this to visually verify what the diagram looks like.',
    inputSchema: {
      type: 'object',
      properties: {
        background: {
          type: 'boolean',
          description: 'Include background in screenshot (default: true)'
        }
      }
    }
  },
  {
    name: 'read_diagram_guide',
    description: 'Returns a comprehensive design guide for creating beautiful Excalidraw diagrams: color palette, sizing rules, layout patterns, arrow binding best practices, diagram templates, and anti-patterns. Call this before creating diagrams to produce professional results.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'export_to_excalidraw_url',
    description: 'Export the current canvas to a shareable excalidraw.com URL. The diagram is encrypted and uploaded; anyone with the URL can view it. Returns the shareable link.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'set_viewport',
    description: 'Control the canvas viewport (camera). Auto-fit all elements, zoom-to-fit a subset of elements, center on a specific element, or set zoom/scroll directly. Requires the canvas frontend open in a browser.',
    inputSchema: {
      type: 'object',
      properties: {
        scrollToContent: {
          type: 'boolean',
          description: 'Auto-fit all elements in view (zoom-to-fit)'
        },
        scrollToElementIds: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'Zoom-to-fit the bounding box of one or more elements by ID; every ID must exist'
        },
        viewportZoomFactor: {
          type: 'number',
          exclusiveMinimum: 0,
          maximum: 1,
          description: 'Optional fit-to-viewport zoom factor in the range (0, 1] for scrollToContent or scrollToElementIds; lower values leave more padding'
        },
        scrollToElementId: {
          type: 'string',
          description: 'Center the view on a specific element by ID'
        },
        zoom: {
          type: 'number',
          description: 'Zoom level (0.1–10, where 1 = 100%)'
        },
        offsetX: {
          type: 'number',
          description: 'Horizontal scroll offset'
        },
        offsetY: {
          type: 'number',
          description: 'Vertical scroll offset'
        }
      }
    }
  }
];
