/**
 * The `board` document: envelope + the canonical board payload owned by the
 * board kit (`components/board/schema.ts`, piece 2). The composition is
 * manual (parse both halves, merge) so the union payload never needs to know
 * the envelope exists — dependency direction is app → kit, never kit → app.
 */

import { boardPayloadSchema, type BoardPayload } from '../../components/board/schema';

import { envelopeSchema, type DocumentEnvelopeOf } from './envelope';

export type BoardDocument = DocumentEnvelopeOf<'board'> & BoardPayload;

const boardEnvelope = envelopeSchema('board');

/**
 * Validate a board document (envelope + payload + graph integrity). Throws
 * the first zod/refinement error — a malformed board fails the build the way
 * a failing test does (spec D5).
 */
export function parseBoardDocument(input: unknown): BoardDocument {
  const envelope = boardEnvelope.parse(input);
  const payload = boardPayloadSchema.parse(input);
  return { ...envelope, ...payload };
}
