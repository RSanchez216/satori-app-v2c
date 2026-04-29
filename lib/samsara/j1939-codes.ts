/**
 * J1939 SAE Standard Diagnostic Trouble Codes
 *
 * Each entry maps an SPN+FMI pair to a plain-English description and a
 * severity level based on J1939 lamp conventions:
 *   - critical  : Red Stop Lamp / MIL (immediate action — pull over)
 *   - warning   : Amber Warning Lamp (degraded — service soon)
 *   - degraded  : Protect Lamp / sensor fault (logged, monitor)
 *   - unknown   : Not in lookup — shown as raw SPN/FMI in muted color
 *
 * Severity colors map to the project's CSS variables (theme-aware):
 *   critical  → var(--severity-critical)   #f85149 dark / #dc2626 light
 *   warning   → var(--severity-high)       #e3b341 dark / #d97706 light
 *   degraded  → var(--severity-medium)     #3ecfcf dark / #0891b2 light
 *   unknown   → var(--text-muted)
 *
 * Coverage of real fleet data (last 30 days, 247 fault events / 55 distinct
 * pairs) is documented in docs/samsara-fault-discovery.md. Manufacturer-
 * proprietary SPNs (≥520192) are intentionally not covered — those need
 * OEM-specific tables (Cummins/Detroit/Volvo) keyed by vehicle make.
 */

export type FaultSeverity = 'critical' | 'warning' | 'degraded' | 'unknown'

export interface FaultCode {
  spn: number
  fmi: number
  description: string
  severity: FaultSeverity
  category?:
    | 'engine'
    | 'cooling'
    | 'oil'
    | 'fuel'
    | 'aftertreatment'
    | 'electrical'
    | 'brake'
    | 'transmission'
    | 'tire'
    | 'other'
}

const codeKey = (spn: number, fmi: number) => `${spn}-${fmi}`

const J1939_TABLE: Record<string, FaultCode> = {
  /*
   * Proprietary SPN range (520192–524287) is intentionally NOT covered.
   * These are manufacturer-specific (Cummins / Detroit / PACCAR / Volvo)
   * and the meaning of a given SPN+FMI pair varies by OEM. Decoding them
   * requires capturing vehicle make alongside the message and shipping
   * OEM-specific lookup tables. Until then, proprietary codes render as
   * raw `SPN x/FMI y` in grey, which is honest rather than guess-decoded.
   *
   * Top observed proprietary codes in current data (for future OEM work):
   *   520349-14, 520966-1, 520245-1, 521031-18, 520240-9, 520363-5
   */

  // ── Engine Oil ─────────────────────────────────────────────
  '100-1':  { spn: 100, fmi: 1,  description: 'Low Oil Pressure (Severe)',         severity: 'critical', category: 'oil' },
  '100-18': { spn: 100, fmi: 18, description: 'Low Oil Pressure (Moderate)',       severity: 'critical', category: 'oil' },
  '100-17': { spn: 100, fmi: 17, description: 'Low Oil Pressure (Mild)',           severity: 'warning',  category: 'oil' },
  '175-0':  { spn: 175, fmi: 0,  description: 'High Oil Temp (Severe)',            severity: 'critical', category: 'oil' },
  '175-16': { spn: 175, fmi: 16, description: 'High Oil Temp (Moderate)',          severity: 'warning',  category: 'oil' },

  // ── Cooling ────────────────────────────────────────────────
  '110-0':  { spn: 110, fmi: 0,  description: 'High Coolant Temp (Severe)',        severity: 'critical', category: 'cooling' },
  '110-16': { spn: 110, fmi: 16, description: 'High Coolant Temp (Moderate)',      severity: 'critical', category: 'cooling' },
  '110-15': { spn: 110, fmi: 15, description: 'High Coolant Temp (Mild)',          severity: 'warning',  category: 'cooling' },
  '110-3':  { spn: 110, fmi: 3,  description: 'Coolant Temp Sensor Voltage High',  severity: 'degraded', category: 'cooling' },
  '110-4':  { spn: 110, fmi: 4,  description: 'Coolant Temp Sensor Voltage Low',   severity: 'degraded', category: 'cooling' },
  '111-1':  { spn: 111, fmi: 1,  description: 'Low Coolant Level (Severe)',        severity: 'critical', category: 'cooling' },
  '111-18': { spn: 111, fmi: 18, description: 'Low Coolant Level (Moderate)',      severity: 'warning',  category: 'cooling' },
  '1089-4': { spn: 1089, fmi: 4, description: 'Coolant Pressure Sensor Voltage Low', severity: 'degraded', category: 'cooling' },

  // ── Engine Speed / Performance ─────────────────────────────
  '190-0':  { spn: 190, fmi: 0,  description: 'Engine Overspeed',                  severity: 'critical', category: 'engine' },
  '190-16': { spn: 190, fmi: 16, description: 'Engine Speed High',                 severity: 'warning',  category: 'engine' },
  '102-3':  { spn: 102, fmi: 3,  description: 'Boost Pressure Sensor High',        severity: 'degraded', category: 'engine' },
  '102-4':  { spn: 102, fmi: 4,  description: 'Boost Pressure Sensor Low',         severity: 'degraded', category: 'engine' },
  // ── Misfire / Aux / Wheel speed ────────────────────────────
  '1322-31': { spn: 1322, fmi: 31, description: 'Multiple Cylinder Misfire',         severity: 'critical', category: 'engine' },
  '241-1':   { spn: 241,  fmi: 1,  description: 'Auxiliary Temperature Low (Severe)', severity: 'warning',  category: 'engine' },
  '84-0':    { spn: 84,   fmi: 0,  description: 'Wheel Speed Above Normal',          severity: 'warning',  category: 'engine' },

  // ── EGR (added Phase 1 discovery: top fleet codes) ─────────
  '2659-0':  { spn: 2659, fmi: 0,  description: 'EGR Mass Flow High (Severe)',     severity: 'warning', category: 'aftertreatment' },
  '2659-17': { spn: 2659, fmi: 17, description: 'EGR Mass Flow Low (Mild)',        severity: 'degraded', category: 'aftertreatment' },

  // ── Aftertreatment / DEF / DPF ─────────────────────────────
  '1761-1':  { spn: 1761, fmi: 1,  description: 'DEF Level Critical',              severity: 'critical', category: 'aftertreatment' },
  '1761-17': { spn: 1761, fmi: 17, description: 'DEF Level Low',                   severity: 'warning',  category: 'aftertreatment' },
  '1761-18': { spn: 1761, fmi: 18, description: 'DEF Level Moderately Low',        severity: 'warning',  category: 'aftertreatment' },
  '3216-16': { spn: 3216, fmi: 16, description: 'NOx Inlet High',                  severity: 'warning',  category: 'aftertreatment' },
  '3216-20': { spn: 3216, fmi: 20, description: 'NOx Inlet Sensor Drifted High',   severity: 'warning',  category: 'aftertreatment' },
  // 3216-21 is the most-frequent NOx Inlet code in the fleet (28 events / 30d).
  '3216-21': { spn: 3216, fmi: 21, description: 'NOx Inlet Sensor Drifted Low',    severity: 'warning',  category: 'aftertreatment' },
  // 3226-2 / 3226-13 are the dominant Outlet NOx variants (24 events combined).
  '3226-2':  { spn: 3226, fmi: 2,  description: 'NOx Outlet Sensor Erratic',           severity: 'degraded', category: 'aftertreatment' },
  '3226-13': { spn: 3226, fmi: 13, description: 'NOx Outlet Sensor Out of Calibration', severity: 'degraded', category: 'aftertreatment' },
  '3251-0':  { spn: 3251, fmi: 0,  description: 'DPF Differential Pressure High',  severity: 'warning',  category: 'aftertreatment' },
  '3251-16': { spn: 3251, fmi: 16, description: 'DPF Pressure Moderately High',    severity: 'warning',  category: 'aftertreatment' },
  '3719-0':  { spn: 3719, fmi: 0,  description: 'DPF Soot Load High',              severity: 'warning',  category: 'aftertreatment' },
  '3719-16': { spn: 3719, fmi: 16, description: 'DPF Regen Needed',                severity: 'warning',  category: 'aftertreatment' },
  '4364-1':  { spn: 4364, fmi: 1,  description: 'SCR Efficiency Low',              severity: 'critical', category: 'aftertreatment' },
  '4364-17': { spn: 4364, fmi: 17, description: 'SCR Efficiency Mild',             severity: 'warning',  category: 'aftertreatment' },
  // 4374-x — SCR Reagent Heater family, observed combined ~13 events / 30d.
  '4374-1':  { spn: 4374, fmi: 1,  description: 'SCR Reagent Heater Below Normal',     severity: 'warning',  category: 'aftertreatment' },
  '4374-4':  { spn: 4374, fmi: 4,  description: 'SCR Reagent Heater Voltage Low',      severity: 'degraded', category: 'aftertreatment' },
  '4374-6':  { spn: 4374, fmi: 6,  description: 'SCR Reagent Heater Short to Ground', severity: 'degraded', category: 'aftertreatment' },
  '5246-0':  { spn: 5246, fmi: 0,  description: 'SCR Operator Inducement Active',  severity: 'critical', category: 'aftertreatment' },
  // 5298-14 — SCR Catalyst Service Required (FMI 14 = Special Instructions).
  '5298-14': { spn: 5298, fmi: 14, description: 'SCR Catalyst Service Required',   severity: 'warning',  category: 'aftertreatment' },
  '5394-7':  { spn: 5394, fmi: 7,  description: 'DEF Dosing Valve Stuck',          severity: 'warning',  category: 'aftertreatment' },
  // 5443-0 / 5444-1 — SCR System Inducement, drives derate. Top fleet codes.
  '5443-0':  { spn: 5443, fmi: 0,  description: 'SCR System Inducement Active',    severity: 'critical', category: 'aftertreatment' },
  '5444-1':  { spn: 5444, fmi: 1,  description: 'SCR Inducement Severity Critical', severity: 'critical', category: 'aftertreatment' },
  // 5713-20 (DEF Pump) — 9 events.
  '5713-20': { spn: 5713, fmi: 20, description: 'DEF Pump Pressure Drifted High',  severity: 'warning',  category: 'aftertreatment' },

  // ── Fuel ───────────────────────────────────────────────────
  '94-1':   { spn: 94,   fmi: 1,  description: 'Low Fuel Pressure (Severe)',       severity: 'critical', category: 'fuel' },
  '94-17':  { spn: 94,   fmi: 17, description: 'Low Fuel Pressure (Mild)',         severity: 'warning',  category: 'fuel' },
  '96-1':   { spn: 96,   fmi: 1,  description: 'Low Fuel Level (Empty)',           severity: 'warning',  category: 'fuel' },
  '96-17':  { spn: 96,   fmi: 17, description: 'Low Fuel Level',                   severity: 'warning',  category: 'fuel' },
  '96-19':  { spn: 96,   fmi: 19, description: 'Fuel Level Network Data Error',    severity: 'degraded', category: 'fuel' },
  '97-4':   { spn: 97,   fmi: 4,  description: 'Water-in-Fuel Sensor Voltage Low', severity: 'degraded', category: 'fuel' },

  // ── Electrical / Battery ───────────────────────────────────
  '168-15': { spn: 168, fmi: 15, description: 'Battery Voltage High',              severity: 'warning',  category: 'electrical' },
  '168-17': { spn: 168, fmi: 17, description: 'Battery Voltage Low',               severity: 'warning',  category: 'electrical' },
  '168-3':  { spn: 168, fmi: 3,  description: 'Battery Voltage Sensor High',       severity: 'degraded', category: 'electrical' },
  '168-4':  { spn: 168, fmi: 4,  description: 'Battery Voltage Sensor Low',        severity: 'degraded', category: 'electrical' },
  '677-5':  { spn: 677, fmi: 5,  description: 'Starter Relay Open Circuit',        severity: 'warning',  category: 'electrical' },
  // ── J1939 Network / Sensor Supply ──────────────────────────
  '639-2':  { spn: 639,  fmi: 2,  description: 'J1939 Network Erratic',             severity: 'degraded', category: 'electrical' },
  '639-14': { spn: 639,  fmi: 14, description: 'J1939 Network Special Instructions', severity: 'degraded', category: 'electrical' },
  '3509-3': { spn: 3509, fmi: 3,  description: 'Sensor Supply Voltage 1 High',      severity: 'degraded', category: 'electrical' },

  // ── Brakes ─────────────────────────────────────────────────
  '521-3':  { spn: 521, fmi: 3,  description: 'Brake Pedal Sensor Voltage High',   severity: 'critical', category: 'brake' },
  '521-4':  { spn: 521, fmi: 4,  description: 'Brake Pedal Sensor Voltage Low',    severity: 'critical', category: 'brake' },
  '597-2':  { spn: 597, fmi: 2,  description: 'Brake Switch Erratic',              severity: 'critical', category: 'brake' },
  '792-5':  { spn: 792, fmi: 5,  description: 'Brake Air Pressure Sensor Open',    severity: 'critical', category: 'brake' },

  // ── Transmission ───────────────────────────────────────────
  '177-0':  { spn: 177, fmi: 0,  description: 'High Transmission Oil Temp',        severity: 'warning',  category: 'transmission' },
  '177-16': { spn: 177, fmi: 16, description: 'Transmission Oil Temp Moderate',    severity: 'warning',  category: 'transmission' },
  '191-2':  { spn: 191, fmi: 2,  description: 'Transmission Output Speed Erratic', severity: 'degraded', category: 'transmission' },

  // ── Tire / Wheel ───────────────────────────────────────────
  '929-1':  { spn: 929, fmi: 1,  description: 'Tire Pressure Critically Low',      severity: 'critical', category: 'tire' },
  '929-17': { spn: 929, fmi: 17, description: 'Tire Pressure Low',                 severity: 'warning',  category: 'tire' },
}

/**
 * Look up a fault code. Always returns a FaultCode — unknown codes yield a
 * synthetic entry with severity 'unknown' and a `SPN n/FMI n` description.
 */
export function lookupFault(spn: number | string, fmi: number | string): FaultCode {
  const spnNum = typeof spn === 'string' ? parseInt(spn, 10) : spn
  const fmiNum = typeof fmi === 'string' ? parseInt(fmi, 10) : fmi
  const hit = J1939_TABLE[codeKey(spnNum, fmiNum)]
  if (hit) return hit
  return {
    spn: spnNum,
    fmi: fmiNum,
    description: `SPN ${spnNum}/FMI ${fmiNum}`,
    severity: 'unknown',
  }
}

/**
 * Severity → Tailwind classes for a colored dot. Hardcoded hex matches the
 * dark-mode CSS variables; for theme-aware rendering prefer
 * `severityCssVar()` below.
 */
export const SEVERITY_DOT_CLASS: Record<FaultSeverity, string> = {
  critical: 'bg-[#f85149]',
  warning:  'bg-[#e3b341]',
  degraded: 'bg-[#3ecfcf]',
  unknown:  'bg-[#3a4555]',
}

/**
 * Severity → CSS variable string for inline `background` / `color`. Use
 * this in components that already render via inline style (most of the
 * Samsara report) so light/dark theme switching works correctly.
 */
export function severityCssVar(severity: FaultSeverity): string {
  switch (severity) {
    case 'critical': return 'var(--severity-critical)'
    case 'warning':  return 'var(--severity-high)'
    case 'degraded': return 'var(--severity-medium)'
    case 'unknown':  return 'var(--text-muted)'
  }
}

/**
 * Severity ordering for sorting (most severe first).
 */
export const SEVERITY_ORDER: Record<FaultSeverity, number> = {
  critical: 0,
  warning:  1,
  degraded: 2,
  unknown:  3,
}

/**
 * Extract the first SPN/FMI pair from a Samsara message text, if present.
 * Mirrors the regex used server-side in `get_samsara_unit_offenders`.
 * Returns null when no pair is present.
 */
export function parseFaultPair(message: string): { spn: number; fmi: number } | null {
  const m = message.match(/SPN\s+(\d+)\s+FMI\s+(\d+)/i)
  if (!m) return null
  return { spn: parseInt(m[1], 10), fmi: parseInt(m[2], 10) }
}
