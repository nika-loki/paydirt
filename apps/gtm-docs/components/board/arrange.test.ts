/**
 * Offline unit tests for the kit's elkjs auto-arrange helper (spec D4):
 * deterministic (same input → same positions), every node placed with finite
 * coordinates, left-to-right chains laid out left-to-right. Initial studio
 * placement only — read mode never re-arranges authored positions.
 */

import { describe, expect, it } from 'vitest';

import { arrangeBoard } from './arrange';

describe('arrangeBoard (kit)', () => {
  it('is deterministic: same nodes/edges in → same positions out', async () => {
    const nodes = [
      { id: 'n1', width: 224, height: 104 },
      { id: 'n2', width: 224, height: 104 },
      { id: 'n3', width: 224, height: 104 },
    ];
    const edges = [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ];

    const first = await arrangeBoard(nodes, edges);
    const second = await arrangeBoard(nodes, edges);

    expect(second).toEqual(first);
  });

  it('places every node with finite coordinates', async () => {
    const positions = await arrangeBoard(
      [
        { id: 'n1', width: 224, height: 104 },
        { id: 'n2', width: 224, height: 104 },
      ],
      [{ id: 'e1', source: 'n1', target: 'n2' }],
    );

    expect(positions.map((entry) => entry.id).sort()).toEqual(['n1', 'n2']);
    for (const entry of positions) {
      expect(Number.isFinite(entry.position.x), `${entry.id}.x`).toBe(true);
      expect(Number.isFinite(entry.position.y), `${entry.id}.y`).toBe(true);
    }
  });

  it('lays a n1 → n2 → n3 chain out left-to-right', async () => {
    const positions = await arrangeBoard(
      [
        { id: 'n1', width: 224, height: 104 },
        { id: 'n2', width: 224, height: 104 },
        { id: 'n3', width: 224, height: 104 },
      ],
      [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    );

    const byId = new Map(positions.map((entry) => [entry.id, entry.position]));
    const x1 = byId.get('n1')?.x;
    const x2 = byId.get('n2')?.x;
    const x3 = byId.get('n3')?.x;
    if (x1 === undefined || x2 === undefined || x3 === undefined) {
      throw new Error('missing positions');
    }
    expect(x1).toBeLessThan(x2);
    expect(x2).toBeLessThan(x3);
  });
});
