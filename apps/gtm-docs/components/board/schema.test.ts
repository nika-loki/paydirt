/**
 * Offline unit tests for the canonical board payload schema (plan piece 4 /
 * spec D4/D8/D9/D11/D12): positions required and finite, edge data with the
 * credential env-var-name pattern, externalRef null-or-{system,id}, model
 * nodes carrying DataField flags, and the motions field round-tripping.
 *
 * Payload only — the envelope belongs to lib/documents (its suite covers it).
 * No network, no React, no elkjs.
 */

import { describe, expect, it } from 'vitest';

import { boardPayloadSchema, type FlowEdge, type ModelNode } from './schema';

/** The schema's inferred output type. */
type ParsedBoard = ReturnType<typeof boardPayloadSchema.parse>;

/** Narrow to a flow node (model nodes carry a DataEntity payload instead). */
function requireFlowNode(board: ParsedBoard, index = 0) {
  const node = board.nodes[index];
  if (node === undefined || !('archetype' in node)) {
    throw new Error('expected a flow node');
  }
  return node;
}

/**
 * Narrow to a model node. Flow nodes may also carry `profile` (rich profiles),
 * so presence doesn't discriminate — the literal `profile === 'entity'` does.
 */
function requireModelNode(board: ParsedBoard, index = 0): ModelNode {
  const node = board.nodes[index];
  if (node === undefined || node.profile !== 'entity') {
    throw new Error('expected a model node');
  }
  return node;
}

/**
 * Narrow to a flow edge (model relation edges carry cardinality instead).
 * `in` narrows `edge.data`, not `edge` itself, so the guard backs the cast.
 */
function requireFlowEdge(board: ParsedBoard, index = 0): FlowEdge {
  const edge = board.edges[index];
  if (edge === undefined || !('mechanism' in edge.data)) {
    throw new Error('expected a flow edge');
  }
  return edge as FlowEdge;
}

// --- fixtures --------------------------------------------------------------------

const flowNode = {
  id: 'n1',
  archetype: 'source',
  position: { x: 0, y: 0 },
  data: { app: 'snowflake', name: 'Product usage', externalRef: null },
};

const flowBoard = {
  boardType: 'flow',
  motions: ['new-business'],
  nodes: [flowNode],
  edges: [
    {
      id: 'e1',
      source: 'n1',
      target: 'n1',
      data: { mechanism: 'api-pull', credential: 'SNOWFLAKE_RO_KEY' },
    },
  ],
};

const modelBoard = {
  boardType: 'model',
  nodes: [
    {
      id: 'ent1',
      profile: 'entity',
      position: { x: 0, y: 0 },
      data: {
        name: 'HubSpot Contact',
        source: 'HubSpot',
        fields: [
          { name: 'hs_object_id', type: 'id', key: true },
          { name: 'email', type: 'email', unique: true, pii: true },
        ],
      },
    },
    {
      id: 'ent2',
      profile: 'entity',
      position: { x: 420, y: 0 },
      data: {
        name: 'Clay Row',
        fields: [{ name: 'domain', type: 'string' }],
      },
    },
  ],
  // Model-board relation edges are id-based like flow edges; cardinality/label
  // ride in edge data (from/to name-based DataRelations are derived, not stored).
  edges: [
    {
      id: 'rel1',
      source: 'ent1',
      target: 'ent2',
      data: { cardinality: 'one-to-many', label: 'syncs to' },
    },
  ],
};

// --- boardType -------------------------------------------------------------------

describe('boardType', () => {
  it('accepts a flow board', () => {
    expect(() => boardPayloadSchema.parse(flowBoard)).not.toThrow();
  });

  it('accepts a model board', () => {
    expect(() => boardPayloadSchema.parse(modelBoard)).not.toThrow();
  });

  it('rejects an unknown boardType', () => {
    expect(() => boardPayloadSchema.parse({ ...flowBoard, boardType: 'swimlane' })).toThrow();
    expect(() =>
      boardPayloadSchema.parse({ ...flowBoard, boardType: undefined }),
    ).toThrow();
  });
});

// --- motions (D12) ------------------------------------------------------------------

describe('board-level motions', () => {
  it('preserves motions when present — zod strip must not silently drop them', () => {
    const parsed = boardPayloadSchema.parse(flowBoard);
    expect(parsed.motions).toEqual(['new-business']);
  });

  it('keeps motions optional', () => {
    const { motions: _omit, ...withoutMotions } = flowBoard;
    const parsed = boardPayloadSchema.parse(withoutMotions);
    expect(parsed.motions).toBeUndefined();
  });
});

// --- flow nodes ---------------------------------------------------------------------

describe('flow nodes', () => {
  it('accepts all four archetypes', () => {
    for (const archetype of ['source', 'processor', 'destination', 'consumer'] as const) {
      const board = {
        ...flowBoard,
        nodes: [{ ...flowNode, archetype }],
      };
      expect(() => boardPayloadSchema.parse(board)).not.toThrow();
    }
  });

  it('rejects a bad archetype', () => {
    const board = {
      ...flowBoard,
      nodes: [{ ...flowNode, archetype: 'wizard' }],
    };
    expect(() => boardPayloadSchema.parse(board)).toThrow();
  });

  it('requires a position with finite x and y', () => {
    const { position: _p, ...noPosition } = flowNode;
    expect(() =>
      boardPayloadSchema.parse({ ...flowBoard, nodes: [noPosition] }),
    ).toThrow();

    expect(() =>
      boardPayloadSchema.parse({
        ...flowBoard,
        nodes: [{ ...flowNode, position: { x: Number.NaN, y: 0 } }],
      }),
    ).toThrow();

    expect(() =>
      boardPayloadSchema.parse({
        ...flowBoard,
        nodes: [{ ...flowNode, position: { x: 0, y: Number.POSITIVE_INFINITY } }],
      }),
    ).toThrow();
  });

  it('requires data.name', () => {
    const board = {
      ...flowBoard,
      nodes: [{ ...flowNode, data: { app: 'snowflake', externalRef: null } }],
    };
    expect(() => boardPayloadSchema.parse(board)).toThrow();
  });
});

// --- externalRef (D9) -----------------------------------------------------------------

describe('externalRef', () => {
  it('accepts null — the Phase 1 state until a live system claims the node', () => {
    const parsed = boardPayloadSchema.parse(flowBoard);
    expect(requireFlowNode(parsed).data.externalRef).toBeNull();
  });

  it('accepts the fixed { system, id } shape', () => {
    const board = {
      ...flowBoard,
      nodes: [
        {
          ...flowNode,
          data: {
            app: 'clay',
            name: 'ICP signals',
            externalRef: { system: 'clay', id: 'tbl_123' },
          },
        },
      ],
    };
    const parsed = boardPayloadSchema.parse(board);
    expect(requireFlowNode(parsed).data.externalRef).toEqual({
      system: 'clay',
      id: 'tbl_123',
    });
  });

  it('rejects a partial externalRef (shape is fixed so Phase 2 never migrates)', () => {
    for (const externalRef of [{ system: 'clay' }, { id: 'tbl_123' }, { system: 1, id: 'x' }]) {
      const board = {
        ...flowBoard,
        nodes: [{ ...flowNode, data: { name: 'X', externalRef } }],
      };
      expect(() => boardPayloadSchema.parse(board)).toThrow();
    }
  });
});

// --- flow edges (D8) --------------------------------------------------------------------

describe('flow edge data', () => {
  it('requires a mechanism and accepts cadence/payload/credential', () => {
    const board = {
      ...flowBoard,
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n1',
          data: {
            mechanism: 'webhook',
            cadence: 'on new row',
            payload: 'accounts + usage',
            credential: 'CLAY_API_KEY',
          },
        },
      ],
    };
    const parsed = boardPayloadSchema.parse(board);
    expect(requireFlowEdge(parsed).data.credential).toBe('CLAY_API_KEY');
  });

  it('mechanism is schema-free about vocabulary — unknown mechanisms PASS the payload schema (D13)', () => {
    // Vocab is data, not schema; the content-walk test is what flags these.
    const board = {
      ...flowBoard,
      edges: [
        { id: 'e1', source: 'n1', target: 'n1', data: { mechanism: 'quantum-sync' } },
      ],
    };
    expect(() => boardPayloadSchema.parse(board)).not.toThrow();
  });

  it('rejects a missing mechanism', () => {
    const board = {
      ...flowBoard,
      edges: [{ id: 'e1', source: 'n1', target: 'n1', data: {} }],
    };
    expect(() => boardPayloadSchema.parse(board)).toThrow();
  });

  it('validates credential as an env-var NAME (never a value)', () => {
    for (const credential of ['SNOWFLAKE_RO_KEY', 'A', 'X_2_Y']) {
      const board = {
        ...flowBoard,
        edges: [
          { id: 'e1', source: 'n1', target: 'n1', data: { mechanism: 'api-pull', credential } },
        ],
      };
      expect(() => boardPayloadSchema.parse(board)).not.toThrow();
    }

    // Lowercase, hyphens, spaces, and values-looking strings are rejected.
    for (const credential of [
      'snowflake_ro_key',
      'SNOWFLAKE-RO-KEY',
      'SNOWFLAKE KEY',
      '',
      'replace-me',
    ]) {
      const board = {
        ...flowBoard,
        edges: [
          { id: 'e1', source: 'n1', target: 'n1', data: { mechanism: 'api-pull', credential } },
        ],
      };
      expect(() => boardPayloadSchema.parse(board)).toThrow();
    }
  });

  it('rejects dangling edges — source/target must reference existing node ids', () => {
    const board = {
      ...flowBoard,
      edges: [
        { id: 'e1', source: 'ghost', target: 'n1', data: { mechanism: 'api-pull' } },
      ],
    };
    expect(() => boardPayloadSchema.parse(board)).toThrow();

    const board2 = {
      ...flowBoard,
      edges: [
        { id: 'e1', source: 'n1', target: 'ghost', data: { mechanism: 'api-pull' } },
      ],
    };
    expect(() => boardPayloadSchema.parse(board2)).toThrow();
  });
});

// --- model boards (D6) -------------------------------------------------------------------

describe('model nodes', () => {
  it('carries the DataField flags (key/unique/pii) through validation untouched', () => {
    const parsed = boardPayloadSchema.parse(modelBoard);
    const node = requireModelNode(parsed);
    const [id, email] = node.data.fields;
    expect(id?.key).toBe(true);
    expect(email?.unique).toBe(true);
    expect(email?.pii).toBe(true);
  });

  it('defaults a missing fields array to [] rather than rejecting (entityDataSchema)', () => {
    const board = {
      ...modelBoard,
      nodes: [
        {
          id: 'ent1',
          profile: 'entity',
          position: { x: 0, y: 0 },
          data: { name: 'Empty' },
        },
      ],
      edges: [],
    };
    const parsed = boardPayloadSchema.parse(board);
    const node = requireModelNode(parsed);
    expect(node.data.fields).toEqual([]);
  });

  it('rejects a flow archetype inside a model board', () => {
    const board = {
      ...modelBoard,
      nodes: [flowNode],
    };
    expect(() => boardPayloadSchema.parse(board)).toThrow();
  });

  it('accepts all three cardinalities on relation edges', () => {
    for (const cardinality of ['one-to-one', 'one-to-many', 'many-to-many'] as const) {
      const board = {
        ...modelBoard,
        edges: [
          { id: 'rel1', source: 'ent1', target: 'ent2', data: { cardinality } },
        ],
      };
      expect(() => boardPayloadSchema.parse(board)).not.toThrow();
    }
  });
});

// --- graph integrity (superRefine) -----------------------------------------------------

describe('graph integrity refinement', () => {
  it('rejects duplicate node ids', () => {
    const board = {
      ...flowBoard,
      nodes: [flowNode, flowNode],
    };
    expect(() => boardPayloadSchema.parse(board)).toThrow(/Duplicate node id/s);
  });

  it('rejects dangling edge endpoints in model boards too', () => {
    const board = {
      ...modelBoard,
      edges: [
        { id: 'rel1', source: 'ghost', target: 'ent2', data: { cardinality: 'one-to-one' } },
      ],
    };
    expect(() => boardPayloadSchema.parse(board)).toThrow(/missing source/s);
  });
});
