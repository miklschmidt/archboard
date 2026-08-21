import type { Tool } from '@modelcontextprotocol/server';
import { EXCALIDRAW_ELEMENT_TYPES } from '../types.js';
import { KINDS } from './promote.js';

/**
 * Which pane an operation addressed to the browser happens in.
 *
 * Written once because the whole point is that the three of them agree: a
 * picture, a camera move and a pane closing all name a pane the same way, and
 * `left` had better mean the same half of the wall in each. Optional
 * everywhere it appears — display defaults where it cannot be wrong (ADR
 * 0009), and with one pane on screen there is only one answer.
 */
/**
 * Ask a write for the whole board back, and the reason not to.
 *
 * Written once because the four writes have to say the same thing. A write
 * already answers with every element it touched in its resulting form — the
 * ids the server minted, the text element it expanded from a label, the arrows
 * it re-routed — plus a fingerprint of the board, which is one comparison for
 * "has anything else moved". This is for the caller that genuinely wants all
 * 300 elements, and it is spelled out in the description because the cost is
 * invisible until a loop is running.
 */
const DOCUMENT_PARAM = {
  type: 'boolean',
  description:
    'Return the whole board alongside the result. OFF BY DEFAULT AND USUALLY WRONG: a ' +
    '300-element board is about 60,000 tokens, so calling this in a loop pulls the board ' +
    'through your context once per element. The default answer already carries every element ' +
    'the write touched, in the form the board now holds it, plus a fingerprint (element count ' +
    'and the sha-256 of the note) that tells you in one comparison whether anything you did ' +
    'not do has changed. Use describe_scene for a summary, or query_elements for a part.'
} as const;

const PANE_PARAM = {
  type: 'string',
  description:
    "Which pane: 'left', 'right', a 1-based position, 'primary', 'focused', or a pane id. " +
    'Call get_panes for what is on screen. Leave it out and the pane that answers for the ' +
    'browser is used, which with a single pane is that pane.'
} as const;

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
        startArrowhead: { type: 'string', description: 'Arrowhead style at start: arrow, bar, dot, triangle, or null' },
        document: DOCUMENT_PARAM
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
        fontFamily: { type: ['string', 'number'], description: 'Font family: virgil/hand/handwritten (1), helvetica/sans/sans-serif (2), cascadia/mono/monospace (3), excalifont (5), nunito (6), lilita/lilita one (7), comic shanns/comic (8), or numeric ID' },
        document: DOCUMENT_PARAM
      },
      required: ['id']
    }
  },
  {
    name: 'delete_element',
    description: "Delete an Excalidraw element. A label goes with the shape it names, and anything bound to what has gone is unbound, so the answer says what else the board lost and what else changed.",
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        document: DOCUMENT_PARAM
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
          description: 'Bounding box filter — only return elements that overlap the given region. An element is measured by its extent, so an arrow is judged by the board its path covers rather than by where it starts',
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
    description:
      'Convert a Mermaid diagram to Excalidraw elements and render them on the canvas. ' +
      'Conversion runs in the browser, in the pane holding the board you name, so a browser ' +
      'tab is required and the board has to be on screen. There is no pane argument: the board ' +
      'settles which pane. Refused, converting nothing, when no pane is holding that board.',
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
        },
        document: DOCUMENT_PARAM
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
    description: 'Export one pane of the canvas to a PNG or SVG image. Requires the canvas frontend to be open in a browser.',
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
        },
        pane: { ...PANE_PARAM }
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
    description: "Every board in the vault, plus which ones are open in this session and which pane is showing what. A board is a named, persisted diagram; a pane shows exactly one at a time. Call this before opening a board to see what exists. Pass repo to ask the other question instead: WHICH BOARDS DESCRIBE A REPOSITORY. That answers from the bindings on the boards themselves, so it finds a system board covering five repositories that is named after none of them, and each matching board comes back with the nodes bound to that repo.",
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository identity (host/owner/name). Narrows the listing to boards with at least one node bound to that repository. An identity, never a path: this server has no working directory it could resolve one against (ADR 0011).' }
      }
    }
  },
  {
    name: 'open_board',
    description: "Show a board from the vault in a pane, replacing whatever that pane was showing. With one pane on screen it goes there; with two, name one with 'pane' (left, right, 1, 2) or the call is refused rather than putting it on the half nobody asked for. With no browser open the board is loaded but nothing shows it. Address it as 'payments' or 'payments@proposed' — the variant 'current' is the architecture that exists and owns the bare name, every other variant is a proposal. A board already open keeps its unsaved work and is simply switched back to; pass reload to discard that and re-read the file.",
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: "Board address: 'payments' or 'payments@proposed'." },
        variant: { type: 'string', description: "Variant, if not given as part of the address. Defaults to 'current'." },
        level: { type: 'string', description: 'Abstraction tier: system, service, or module. Overrides what the note declares.' },
        reload: { type: 'boolean', description: 'Discard the in-memory copy and re-read the vault file.' },
        pane: { type: 'string', description: "Which pane to show it in: 'left', 'right', 'top', 'bottom', a 1-based position, or a pane id. Required when more than one pane is open." }
      },
      required: ['board']
    }
  },
  {
    name: 'new_board',
    description: "Start a new, empty board and show it in a pane (name one with 'pane' when more than one is open). It lives in memory only until save_board writes it to the vault. Refuses a name the vault already has — open that one instead. Use a new variant of an existing name (e.g. payments@option-a) to author a proposal alongside the current architecture.",
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: "Board address: 'payments' or 'payments@option-a'." },
        variant: { type: 'string', description: "Variant, if not given as part of the address. Defaults to 'current'." },
        level: { type: 'string', description: 'Abstraction tier: system, service, or module.' },
        pane: { type: 'string', description: "Which pane to show it in. Required when more than one pane is open." }
      },
      required: ['board']
    }
  },
  {
    name: 'save_board',
    description: "Write the named board back to its .excalidraw.md note in the vault, preserving the note's frontmatter and prose. Pass name or variant to branch it, which writes a second board and is how a proposal starts; the source board's level comes across unless you pass a different level. BRANCHING MOVES NOTHING ON SCREEN: the panes holding the source keep holding it, and the branch is not showing anywhere until you open_board it, which is what lets current and proposal sit side by side. The answer says which panes moved (panes.moved) and which were left on the source (panes.kept). The one save that does move a pane is giving the scratch board a name. THE SAVE CAN BE REFUSED: archboard hashes a note when it reads it and verifies that hash before writing, so if the file changed underneath (Obsidian, a sync client, another editor) or archboard has never read what is at that address, nothing is written and the refusal comes back with three ways out — reload the note (open_board with reload, discarding the canvas), overwrite it (force, discarding the note), or save under another name. Relay the refusal and those three choices to the human and let them pick; never choose for them.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Branch to this board instead of saving in place. Accepts name or name@variant.' },
        variant: { type: 'string', description: 'Branch to this variant of the same board.' },
        level: { type: 'string', description: 'Set the board\'s abstraction tier: system, service, or module. Omit on a branch and the source board\'s level carries across.' },
        force: { type: 'boolean', description: 'Overwrite a note archboard has not seen, destroying whatever it holds. Only ever pass this after a refused save when the human has said to overwrite.' }
      }
    }
  },
  {
    name: 'compare_boards',
    description:
      "Structured semantic diff between two variants of a board — 'payments' against 'payments@option-a'. " +
      'Joined on NODE IDENTITY (the stable id promotion assigns), not on element ids or geometry, so two ' +
      'variants drawn independently still compare. Returns nodes and edges added, removed, changed (with ' +
      'the before and after of every field that changed) and unchanged, plus layout as relative structure: ' +
      'which nodes sit together, what contains what, what is grouped, whereabouts on the board, relative ' +
      'direction between related nodes, and relative size. Never coordinate deltas — and the result names, ' +
      'under layout.cannotExpress, the layout changes this model deliberately cannot see, which you must ' +
      'not claim it can. THE OUTPUT IS DELIBERATELY COMPLETE AND UNSUMMARISED: it is data for you to ' +
      'narrate, so read all of it and compose the explanation yourself. Neither board is opened and the ' +
      'canvas is not disturbed; a board already open is read from memory (unsaved work included) and any ' +
      'other from its note, which each side reports as source. Give one address and the other side is ' +
      "found among that board's variants.",
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: "The board to diff FROM, usually the architecture that exists: 'payments'." },
        to: { type: 'string', description: "The board to diff TO, usually the proposal: 'payments@option-a'. Omit to find the other variant automatically." }
      },
      required: ['from']
    }
  },
  {
    name: 'list_library_items',
    description:
      "The stencil palette: ready-made shapes — cloud icons, servers, databases, queues, browsers, people — that " +
      'a human drags onto a board and you can place by name. Kept on the canvas server, so this is the same ' +
      'palette the browser shows. Each entry carries what it takes to pick one WITHOUT seeing it drawn: name, ' +
      'the library it came from as source, its size, how many elements it is made of, and any words drawn inside ' +
      'it, which is often what really tells one icon from another. Names are unique only within a source — several ' +
      'libraries ship a "Database" — so pass source to insert_library_item alongside a name that appears twice ' +
      'here. Call this before insert_library_item: nothing else lists what exists.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'insert_library_item',
    description:
      'Place a stencil from the palette onto the canvas at (x, y), which is its TOP-LEFT corner — the stencil ' +
      'keeps its own size, so read width and height from list_library_items and leave room. The copy is ordinary ' +
      'elements you can then move, restyle, label, bind arrows to, or promote; nothing about it stays special. ' +
      'Identify it by name from list_library_items, adding source when more than one library uses that name, or ' +
      'by itemId to be exact. An ambiguous name is REFUSED with every candidate named rather than guessed at.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Stencil name, as listed by list_library_items. Case-insensitive.' },
        source: { type: 'string', description: 'Which library the name belongs to, when more than one uses it.' },
        itemId: { type: 'string', description: 'The catalogue id, instead of a name. Unambiguous by construction.' },
        x: { type: 'number', description: 'Canvas x for the stencil\'s left edge.' },
        y: { type: 'number', description: 'Canvas y for the stencil\'s top edge.' }
      },
      required: ['x', 'y']
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
    name: 'get_panes',
    description: "What the human is currently looking at. One entry per pane on screen, in reading order: where it sits (left, right, top, bottom), which board and variant it holds, how much of that board is in view, and what is selected in it. Call this to resolve spatial deixis — \"the left one\", \"this pane\", \"move that box over there\" — before acting on anything the human pointed at rather than named. Returns VIEW STATE ONLY, never the elements, so it is cheap enough to call every turn; use get_canvas_description for what is actually on a board. No pane at all means no browser is open, which is normal, not an error.",
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'claim_board',
    description: "Take a board for a stretch of work, so that everything you are about to do to it is one uninterrupted act. FOR WORK YOU ALREADY KNOW IS SUBSTANTIAL — redrawing a board, restructuring a subsystem, working through twenty elements — AND FOR NOTHING SMALLER: an ordinary write already holds the board for as long as it takes to write, so there is nothing to claim for moving one box. What a claim buys is the gaps: taking the board twenty times leaves nineteen moments for somebody else to write into, and a board that is never once in the state you meant. Carry nothing between this and the writes that follow — every write naming this board goes under the claim automatically. Call it again to extend, with the reason brought up to date; a write does not extend it. THE PERSON AT THE CANVAS CAN TAKE IT BACK AT ANY MOMENT and their pane shows your reason while you hold it; your next call is then refused once and tells you so. NOTHING IS ROLLED BACK when that happens — every write you made is already saved — so leave the board sensible after each write, or work on a variant and swap when it is done, and stop when you are told rather than claiming it again.",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string',
          description: "Which board to claim: 'payments', or 'payments@option-a' for a variant."
        },
        reason: {
          type: 'string',
          description: 'What you are about to do, in the words the person at the canvas would use — it is shown on their pane for as long as you hold the board, and it is the only reason they have for why the wall stopped responding. "Redrawing the payment path", not "batch write".'
        },
        forMs: {
          type: 'number',
          description: 'How long you expect to need it, in milliseconds. Ten minutes by default, an hour at most, and a claim that runs out simply ends — anything longer means claiming again, which you can only do if you are still alive.'
        }
      },
      required: ['board', 'reason']
    }
  },
  {
    name: 'release_board',
    description: 'Give back a board you claimed. The board goes back to being taken one write at a time and everything you wrote stays where it is. Call it as soon as the work is done: a claim you forget about is a board nobody else can write until it expires. Releasing a claim that has already expired, or that the person at the canvas took back, is not an error.',
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string',
          description: 'Which board to release. The same board you claimed.'
        }
      },
      required: ['board']
    }
  },
  {
    name: 'open_pane',
    description: "Split the canvas into a second pane and, when a board is named, open that board into the new pane. This is the whole side-by-side move: the architecture that exists stays where it is, and the proposal goes beside it. It cannot be aimed at an existing pane, so it can never overwrite what somebody is reading — use open_board with its `pane` argument to change what an existing pane holds. Two panes is the most the canvas lays out. Needs the canvas open in a browser: a pane exists only while a tab is rendering it.",
    inputSchema: {
      type: 'object',
      properties: {
        board: {
          type: 'string',
          description: "Which board to open into the new pane: 'payments', or 'payments@option-a' for a variant. Leave it out and the new pane shows whatever is already on screen."
        }
      }
    }
  },
  {
    name: 'close_pane',
    description: "Close one pane. Its board comes off the screen and is otherwise untouched — still open on the canvas, with everything drawn on it. Name the pane the way open_board does: 'left', 'right', a 1-based position, 'primary', 'focused', or a pane id. Always name it; the last remaining pane cannot be closed, because an empty canvas has no way back except reloading the browser.",
    inputSchema: {
      type: 'object',
      properties: {
        pane: {
          type: 'string',
          description:
            "Which pane goes: 'left', 'right', a 1-based position, 'primary', 'focused', or a pane id. " +
            'Call get_panes for what is on screen. Required, unlike everywhere else a pane is named: ' +
            'which board comes off the screen is not something to guess at.'
        }
      },
      required: ['pane']
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
        path: { type: 'string', description: 'Bind the node to code: an ABSOLUTE path, or a path relative to the repo named in `repo`. A bare relative path is refused here, because this server has no working directory you can set, so resolving one would land on whatever directory the client happened to start it in (ADR 0011). Branch and commit come from git.' },
        repo: { type: 'string', description: 'Repository identity (host/owner/name). With a relative `path`, this is what the path is resolved against, through the registry of checkouts on the machine running archboard, which is how one board can bind nodes in several repositories. Also usable with an absolute path to record an identity git would not give.' },
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
    description: 'Take a screenshot of one pane of the canvas and return it as an image. Requires the canvas frontend to be open in a browser. Use this to visually verify what the diagram looks like — and name the pane once two are open, or you will keep photographing the first one while the board you just drew sits in the second.',
    inputSchema: {
      type: 'object',
      properties: {
        background: {
          type: 'boolean',
          description: 'Include background in screenshot (default: true)'
        },
        pane: { ...PANE_PARAM }
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
        },
        pane: { ...PANE_PARAM }
      }
    }
  }
];

// ─── Every tool that touches a board says which one ───────────
//
// There is no default board and no "the board on the canvas" to fall back to:
// two panes hold two boards, so a call that names none has no answer and is
// refused by the canvas (ADR 0009). The parameter is therefore REQUIRED, not
// optional — a client that leaves it out should be told by its own schema
// validation rather than by a round trip.
//
// Applied here rather than typed into thirty schemas by hand, so the list of
// board-scoped tools is legible in one place and a tool cannot be the one that
// forgot.
const BOARD_SCOPED = [
  'create_element', 'update_element', 'delete_element', 'get_element',
  'query_elements', 'batch_create_elements', 'clear_canvas',
  'describe_scene', 'export_scene', 'import_scene', 'export_to_excalidraw_url',
  'create_from_mermaid', 'insert_library_item',
  'group_elements', 'ungroup_elements', 'align_elements', 'distribute_elements',
  'lock_elements', 'unlock_elements', 'duplicate_elements',
  'snapshot_scene', 'restore_snapshot', 'save_board',
  'promote_selection', 'demote_selection'
];

// `get_resource` reads the board for `scene` and `elements` but not for
// `library` or `theme`, so naming one is allowed rather than demanded.
const BOARD_OPTIONAL = ['get_resource'];

const BOARD_PARAM = {
  type: 'string',
  description:
    "Which board to act on: 'payments', or 'payments@option-a' for a variant. " +
    'There is no default — a pane holds its own board, so nothing on this canvas ' +
    'means "the board". Call list_boards for what is open and get_panes for what is on screen.'
} as const;

for (const tool of tools) {
  const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
  if (BOARD_SCOPED.includes(tool.name)) {
    schema.properties = { board: { ...BOARD_PARAM }, ...(schema.properties ?? {}) };
    schema.required = [...new Set([...(schema.required ?? []), 'board'])];
  } else if (BOARD_OPTIONAL.includes(tool.name)) {
    schema.properties = { board: { ...BOARD_PARAM }, ...(schema.properties ?? {}) };
  }
}
