// @ts-nocheck — Deno-style imports
//
// Per-template Zod schemas. Validating before the handler runs catches
// bad scope shapes early — critical for Phase 7 when LLM-generated
// configs flow through this same path.

import { z } from 'https://esm.sh/zod@3.23.8'

export const WatchlistScope = z.object({
  source_type: z.literal('samsara'),
}).strict()

// Phase 6 schema sketch — not enabled for v1.
export const AlertDigestScope = z.object({
  topic_ids:          z.array(z.string().uuid()).optional(),
  source_ids:         z.array(z.string().uuid()).optional(),
  severities:         z.array(z.enum(['critical','high','medium','low'])).optional(),
  departments:        z.array(z.string()).optional(),
  keywords:           z.array(z.string()).optional(),
  exclude_topic_ids:  z.array(z.string().uuid()).optional(),
  exclude_source_ids: z.array(z.string().uuid()).optional(),
}).strict()

// Phase 8 schema sketch — not enabled for v1.
export const DrillInScope = z.object({
  entity_type: z.enum(['driver','broker','dispatcher','unit']),
  entity_name: z.string().min(1),
  alt_names:   z.array(z.string()).optional(),
}).strict()

export const SCOPE_VALIDATORS = {
  watchlist:    WatchlistScope,
  alert_digest: AlertDigestScope,
  drill_in:     DrillInScope,
} as const

export type TemplateName = keyof typeof SCOPE_VALIDATORS
