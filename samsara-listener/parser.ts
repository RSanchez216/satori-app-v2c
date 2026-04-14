/**
 * Samsara alert message parser
 *
 * Parses the 6 alert types sent by the SafetyMonitor bot in the
 * "Manas Express Samsara Alerts" Telegram group.
 */

export type AlertType =
  | 'vehicle_fault'
  | 'engine_idle'
  | 'driver_distraction'
  | 'speeding'
  | 'fuel_low'
  | 'harsh_braking'
  | 'unknown'

export interface ParsedAlert {
  alert_type:    AlertType
  driver_name:   string | null
  vehicle_id:    string | null   // unit / asset ID
  vehicle_name:  string | null   // truck number / name
  speed_mph:     number | null
  speed_limit:   number | null
  idle_minutes:  number | null
  fuel_pct:      number | null
  location:      string | null
  fault_code:    string | null
  fault_desc:    string | null
  timestamp:     string | null   // as it appears in the message
  raw:           string          // original message text
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extract(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern)
  return m ? (m[1] ?? m[0]).trim() : null
}

function extractNum(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern)
  return m ? parseFloat(m[1]) : null
}

// ── Per-type parsers ─────────────────────────────────────────────────────────

function parseSpeedingAlert(text: string): Partial<ParsedAlert> {
  return {
    alert_type:   'speeding',
    driver_name:  extract(text, /driver[:\s]+([A-Za-z\s]+?)(?:\n|,|vehicle|going|speed)/i),
    vehicle_id:   extract(text, /unit[:\s#]+(\w[\w-]*)/i) ?? extract(text, /vehicle[:\s#]+(\w[\w-]*)/i),
    vehicle_name: extract(text, /truck[:\s#]+([^\n,]+)/i),
    speed_mph:    extractNum(text, /(?:going|traveling|speed)[:\s]+(\d+(?:\.\d+)?)\s*mph/i)
               ?? extractNum(text, /(\d+(?:\.\d+)?)\s*mph/i),
    speed_limit:  extractNum(text, /(?:limit|posted)[:\s]+(\d+(?:\.\d+)?)\s*mph/i)
               ?? extractNum(text, /limit[:\s]+(\d+)/i),
    location:     extract(text, /(?:location|at)[:\s]+([^\n]+)/i),
    timestamp:    extract(text, /(?:time|at)[:\s]+([\d/]+ [\d:]+\s*(?:AM|PM)?)/i),
  }
}

function parseEngineIdleAlert(text: string): Partial<ParsedAlert> {
  return {
    alert_type:   'engine_idle',
    driver_name:  extract(text, /driver[:\s]+([A-Za-z\s]+?)(?:\n|,|vehicle|unit|idle)/i),
    vehicle_id:   extract(text, /unit[:\s#]+(\w[\w-]*)/i) ?? extract(text, /vehicle[:\s#]+(\w[\w-]*)/i),
    vehicle_name: extract(text, /truck[:\s#]+([^\n,]+)/i),
    idle_minutes: extractNum(text, /idle(?:d)?\s+(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:min|minute)/i)
               ?? extractNum(text, /(\d+(?:\.\d+)?)\s*(?:min|minute)s?\s+idle/i),
    location:     extract(text, /(?:location|at)[:\s]+([^\n]+)/i),
    timestamp:    extract(text, /(?:time|at)[:\s]+([\d/]+ [\d:]+\s*(?:AM|PM)?)/i),
  }
}

function parseDriverDistractionAlert(text: string): Partial<ParsedAlert> {
  return {
    alert_type:   'driver_distraction',
    driver_name:  extract(text, /driver[:\s]+([A-Za-z\s]+?)(?:\n|,|vehicle|unit|distraction)/i),
    vehicle_id:   extract(text, /unit[:\s#]+(\w[\w-]*)/i) ?? extract(text, /vehicle[:\s#]+(\w[\w-]*)/i),
    vehicle_name: extract(text, /truck[:\s#]+([^\n,]+)/i),
    location:     extract(text, /(?:location|at)[:\s]+([^\n]+)/i),
    timestamp:    extract(text, /(?:time|at)[:\s]+([\d/]+ [\d:]+\s*(?:AM|PM)?)/i),
  }
}

function parseVehicleFaultAlert(text: string): Partial<ParsedAlert> {
  return {
    alert_type:   'vehicle_fault',
    driver_name:  extract(text, /driver[:\s]+([A-Za-z\s]+?)(?:\n|,|vehicle|unit|fault|code)/i),
    vehicle_id:   extract(text, /unit[:\s#]+(\w[\w-]*)/i) ?? extract(text, /vehicle[:\s#]+(\w[\w-]*)/i),
    vehicle_name: extract(text, /truck[:\s#]+([^\n,]+)/i),
    fault_code:   extract(text, /(?:code|dtc|fault code)[:\s]+([A-Z0-9]+(?:[- ][A-Z0-9]+)*)/i),
    fault_desc:   extract(text, /(?:description|desc|issue|fault)[:\s]+([^\n]+)/i),
    location:     extract(text, /(?:location|at)[:\s]+([^\n]+)/i),
    timestamp:    extract(text, /(?:time|at)[:\s]+([\d/]+ [\d:]+\s*(?:AM|PM)?)/i),
  }
}

function parseFuelLowAlert(text: string): Partial<ParsedAlert> {
  return {
    alert_type:   'fuel_low',
    driver_name:  extract(text, /driver[:\s]+([A-Za-z\s]+?)(?:\n|,|vehicle|unit|fuel)/i),
    vehicle_id:   extract(text, /unit[:\s#]+(\w[\w-]*)/i) ?? extract(text, /vehicle[:\s#]+(\w[\w-]*)/i),
    vehicle_name: extract(text, /truck[:\s#]+([^\n,]+)/i),
    fuel_pct:     extractNum(text, /fuel[:\s]+(\d+(?:\.\d+)?)%/i)
               ?? extractNum(text, /(\d+(?:\.\d+)?)%\s+fuel/i),
    location:     extract(text, /(?:location|at)[:\s]+([^\n]+)/i),
    timestamp:    extract(text, /(?:time|at)[:\s]+([\d/]+ [\d:]+\s*(?:AM|PM)?)/i),
  }
}

function parseHarshBrakingAlert(text: string): Partial<ParsedAlert> {
  return {
    alert_type:   'harsh_braking',
    driver_name:  extract(text, /driver[:\s]+([A-Za-z\s]+?)(?:\n|,|vehicle|unit|braking|brake)/i),
    vehicle_id:   extract(text, /unit[:\s#]+(\w[\w-]*)/i) ?? extract(text, /vehicle[:\s#]+(\w[\w-]*)/i),
    vehicle_name: extract(text, /truck[:\s#]+([^\n,]+)/i),
    speed_mph:    extractNum(text, /(?:at|speed)[:\s]+(\d+(?:\.\d+)?)\s*mph/i),
    location:     extract(text, /(?:location|at)[:\s]+([^\n]+)/i),
    timestamp:    extract(text, /(?:time|at)[:\s]+([\d/]+ [\d:]+\s*(?:AM|PM)?)/i),
  }
}

// ── Alert type detection ─────────────────────────────────────────────────────

function detectAlertType(text: string): AlertType {
  const t = text.toLowerCase()
  if (/speed(?:ing)?(?:\s+alert)?|mph/.test(t) && !/harsh/.test(t)) return 'speeding'
  if (/harsh\s+brak(?:ing|e)/.test(t)) return 'harsh_braking'
  if (/engine\s+idle|idling|idle\s+time/.test(t)) return 'engine_idle'
  if (/distraction|phone|drowsy|fatigue/.test(t)) return 'driver_distraction'
  if (/fuel\s+low|low\s+fuel/.test(t)) return 'fuel_low'
  if (/fault|dtc|engine\s+light|check\s+engine|malfunction/.test(t)) return 'vehicle_fault'
  return 'unknown'
}

// ── Null defaults ────────────────────────────────────────────────────────────

const EMPTY: Omit<ParsedAlert, 'alert_type' | 'raw'> = {
  driver_name:  null,
  vehicle_id:   null,
  vehicle_name: null,
  speed_mph:    null,
  speed_limit:  null,
  idle_minutes: null,
  fuel_pct:     null,
  location:     null,
  fault_code:   null,
  fault_desc:   null,
  timestamp:    null,
}

// ── Main export ──────────────────────────────────────────────────────────────

export function parseAlert(text: string): ParsedAlert {
  const alertType = detectAlertType(text)
  let partial: Partial<ParsedAlert> = {}

  switch (alertType) {
    case 'speeding':            partial = parseSpeedingAlert(text);            break
    case 'engine_idle':         partial = parseEngineIdleAlert(text);          break
    case 'driver_distraction':  partial = parseDriverDistractionAlert(text);   break
    case 'vehicle_fault':       partial = parseVehicleFaultAlert(text);        break
    case 'fuel_low':            partial = parseFuelLowAlert(text);             break
    case 'harsh_braking':       partial = parseHarshBrakingAlert(text);        break
    default:
      partial = { alert_type: 'unknown' }
  }

  return { ...EMPTY, ...partial, alert_type: alertType, raw: text }
}

/**
 * Format a ParsedAlert into a human-readable message suitable for SATORI's
 * message pipeline (used as `message_text` in the ingest payload).
 */
export function formatAlertText(alert: ParsedAlert): string {
  const lines: string[] = []

  const typeLabel: Record<AlertType, string> = {
    speeding:            '🚨 SPEEDING ALERT',
    engine_idle:         '⏱ ENGINE IDLE ALERT',
    driver_distraction:  '👁 DRIVER DISTRACTION ALERT',
    vehicle_fault:       '⚠️ VEHICLE FAULT ALERT',
    fuel_low:            '⛽ FUEL LOW ALERT',
    harsh_braking:       '🛑 HARSH BRAKING ALERT',
    unknown:             '📋 SAMSARA ALERT',
  }

  lines.push(typeLabel[alert.alert_type])

  if (alert.driver_name)  lines.push(`Driver: ${alert.driver_name}`)
  if (alert.vehicle_id)   lines.push(`Unit: ${alert.vehicle_id}`)
  if (alert.vehicle_name) lines.push(`Vehicle: ${alert.vehicle_name}`)
  if (alert.speed_mph !== null)   lines.push(`Speed: ${alert.speed_mph} mph`)
  if (alert.speed_limit !== null) lines.push(`Limit: ${alert.speed_limit} mph`)
  if (alert.idle_minutes !== null) lines.push(`Idle time: ${alert.idle_minutes} min`)
  if (alert.fuel_pct !== null)    lines.push(`Fuel level: ${alert.fuel_pct}%`)
  if (alert.fault_code)           lines.push(`Fault code: ${alert.fault_code}`)
  if (alert.fault_desc)           lines.push(`Description: ${alert.fault_desc}`)
  if (alert.location)             lines.push(`Location: ${alert.location}`)
  if (alert.timestamp)            lines.push(`Time: ${alert.timestamp}`)

  // Append original for full context
  lines.push('', '--- Original Message ---', alert.raw)

  return lines.join('\n')
}
