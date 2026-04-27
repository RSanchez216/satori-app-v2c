'use client'

import { useEffect, useState } from 'react'
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, AlertTriangle, Trash2, Loader2, CheckCircle2, ChevronUp, ChevronDown, Search, Plus, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { AssignmentModal } from '@/components/sources/AssignmentModal'

/* ─── Types ──────────────────────────────────────────────────────────────── */

type FieldKey = 'unit_id' | 'driver_id' | 'driver_name' | 'start_date' | 'end_date'

type ColumnMapping = Record<FieldKey, string | null>

type ParsedFile = {
  columns:    string[]
  sampleRows: Record<string, unknown>[]
  allRows:    Record<string, unknown>[]
}

type Assignment = {
  id:           string
  unit_id:      string
  driver_id:    string
  driver_name:  string
  start_date:   string
  end_date:     string | null
}

type Stage = 'idle' | 'mapper' | 'confirm' | 'importing'

/* ─── Auto-detection ─────────────────────────────────────────────────────── */

// Customer-specific exact matches first; generic fallbacks second. The
// customer's TMS export uses "Equipment Name" for the unit (NOT Equipment ID,
// which is an internal DB key — auto-selecting that would silently mis-attribute).
const FIELD_HINTS: Record<FieldKey, string[]> = {
  unit_id:     ['equipment name', 'unit', 'unit #', 'unit number', 'vehicle', 'truck', 'asset id'],
  driver_id:   ['driver id', 'driver code', 'employee #', 'employee number', 'empnum', 'emp #'],
  driver_name: ['driver full name', 'driver name', 'name', 'operator', 'full name'],
  start_date:  ['start date', 'start', 'effective date', 'assigned from', 'from'],
  end_date:    ['end date', 'end', 'released', 'until', 'returned', 'to'],
}

function autoMap(columns: string[]): ColumnMapping {
  const lower = columns.map(c => c.toLowerCase().trim())
  const find = (hints: string[]): string | null => {
    for (const hint of hints) {
      const idx = lower.indexOf(hint)
      if (idx !== -1) return columns[idx]
    }
    return null
  }
  return {
    unit_id:     find(FIELD_HINTS.unit_id),
    driver_id:   find(FIELD_HINTS.driver_id),
    driver_name: find(FIELD_HINTS.driver_name),
    start_date:  find(FIELD_HINTS.start_date),
    end_date:    find(FIELD_HINTS.end_date),
  }
}

/* ─── File parsing ───────────────────────────────────────────────────────── */

async function parseUploadedFile(file: File): Promise<ParsedFile> {
  const ext = file.name.toLowerCase().split('.').pop()

  if (ext === 'xlsx' || ext === 'xls') {
    const buf   = await file.arrayBuffer()
    const wb    = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows  = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
    return {
      columns:    rows.length > 0 ? Object.keys(rows[0]) : [],
      sampleRows: rows.slice(0, 5),
      allRows:    rows,
    }
  }

  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve({
          columns:    results.meta.fields ?? [],
          sampleRows: (results.data ?? []).slice(0, 5),
          allRows:    results.data ?? [],
        })
      },
      error: (err) => reject(err),
    })
  })
}

/* ─── Row normalization ──────────────────────────────────────────────────── */

type NewAssignment = {
  unit_id:     string
  driver_id:   string
  driver_name: string
  start_date:  string
  end_date:    string | null
}

const NA_VALUES = new Set(['n/a', 'na', '', 'null', 'none', '-'])

/**
 * Parse a date from CSV (string) or Excel (serial number).
 *
 * Whole-day fields (no time component) are anchored at NOON UTC so that the
 * Date object falls on the intended calendar day in every local timezone —
 * no zone on Earth is more than 14 hours from UTC, so noon UTC is always
 * "that day" regardless of viewer locale. `new Date('2026-04-26')` would
 * land at midnight UTC, which displays as the previous day in Chicago.
 */
function parseExcelDate(value: unknown): Date | null {
  if (value == null) return null

  // Excel serial: days since 1899-12-30 (Excel's 1900 leap-year bug accounted for).
  // 25569 ≈ 1970-01-01, 73415 ≈ 2100-12-31. Outside the realistic date range,
  // treat as a non-date so a stray Driver ID landing here doesn't get misread.
  if (typeof value === 'number') {
    if (value < 25000 || value > 80000) return null
    // Add 12h so we land at noon UTC of the intended day.
    const excelEpoch = Date.UTC(1899, 11, 30, 12, 0, 0)
    const d = new Date(excelEpoch + Math.trunc(value) * 86_400_000)
    return isNaN(d.getTime()) ? null : d
  }

  const trimmed = String(value).trim()
  if (!trimmed || NA_VALUES.has(trimmed.toLowerCase())) return null

  // ISO YYYY-MM-DD: parse explicitly at noon UTC. `new Date('2026-04-26')`
  // is spec'd as UTC midnight, which off-by-ones in any non-UTC timezone.
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const [, y, mo, d] = iso
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0))
  }

  // Other string formats (MM/DD/YYYY, full RFC, etc.) — fall back to native
  // parsing. These usually carry an explicit time so they're zone-safe.
  const d = new Date(trimmed)
  return isNaN(d.getTime()) ? null : d
}

function normalizeRow(raw: Record<string, unknown>, mapping: ColumnMapping): NewAssignment | null {
  const unitRaw  = mapping.unit_id     ? raw[mapping.unit_id]     : null
  const drvIdRaw = mapping.driver_id   ? raw[mapping.driver_id]   : null
  const drvName  = mapping.driver_name ? raw[mapping.driver_name] : null
  const startRaw = mapping.start_date  ? raw[mapping.start_date]  : null
  const endRaw   = mapping.end_date    ? raw[mapping.end_date]    : null

  // Source may have numbers (Equipment Name '58', Driver ID 1830) — coerce to string
  const unit_id   = unitRaw  != null ? String(unitRaw).trim()  : ''
  const driver_id = drvIdRaw != null ? String(drvIdRaw).trim() : ''
  const name      = drvName  != null ? String(drvName).trim()  : ''

  if (!unit_id || !driver_id || !name) return null

  const start = parseExcelDate(startRaw)
  if (!start) return null

  // end_date is optional; null means "still active". parseExcelDate already
  // returns null for NA-style values, so the result feeds straight through.
  const end = parseExcelDate(endRaw)

  return {
    unit_id,
    driver_id,
    driver_name: name,
    start_date:  start.toISOString(),
    end_date:    end?.toISOString() ?? null,
  }
}

/* ─── Main component ─────────────────────────────────────────────────────── */

export function DriverAssignmentsTab() {
  const supabase = createClient()
  const [stage,    setStage]    = useState<Stage>('idle')
  const [parsed,   setParsed]   = useState<ParsedFile | null>(null)
  const [mapping,  setMapping]  = useState<ColumnMapping | null>(null)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)

  // Summary counts + reload signal (table data lives inside IdleView)
  const [counts, setCounts] = useState<{ drivers: number; units: number; active: number } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)

  async function loadSummary() {
    // Aggregate counts via separate queries (small data; fine to do client-side)
    const [{ data: distinctDrivers }, { data: distinctUnits }, { count: activeCount }] = await Promise.all([
      supabase.from('driver_unit_assignments').select('driver_id'),
      supabase.from('driver_unit_assignments').select('unit_id'),
      supabase
        .from('driver_unit_assignments')
        .select('id', { count: 'exact', head: true })
        .or('end_date.is.null,end_date.gt.' + new Date().toISOString()),
    ])

    const driverSet = new Set<string>()
    for (const r of distinctDrivers ?? []) driverSet.add((r as { driver_id: string }).driver_id)
    const unitSet = new Set<string>()
    for (const r of distinctUnits ?? []) unitSet.add((r as { unit_id: string }).unit_id)

    setCounts({
      drivers: driverSet.size,
      units:   unitSet.size,
      active:  activeCount ?? 0,
    })
    setReloadKey(k => k + 1)
  }

  useEffect(() => { loadSummary() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onFileSelected(file: File) {
    try {
      const result = await parseUploadedFile(file)
      if (result.columns.length === 0) {
        toast.error('No columns found in this file.')
        return
      }
      setParsed(result)
      setMapping(autoMap(result.columns))
      setStage('mapper')
    } catch (err) {
      console.error('[driver-import] parse failed:', err)
      toast.error('Could not parse this file — make sure it\'s a valid CSV or XLSX.')
    }
  }

  function setMappingField(field: FieldKey, value: string | null) {
    if (!mapping) return
    setMapping({ ...mapping, [field]: value })
  }

  function canContinueFromMapper(): boolean {
    if (!mapping) return false
    return !!mapping.unit_id && !!mapping.driver_id && !!mapping.driver_name && !!mapping.start_date
  }

  async function runImport() {
    if (!parsed || !mapping) return
    setStage('importing')

    const normalized: NewAssignment[] = []
    let skipped = 0
    for (const row of parsed.allRows) {
      const n = normalizeRow(row, mapping)
      if (n) normalized.push(n)
      else skipped++
    }

    if (normalized.length === 0) {
      toast.error(`All ${skipped} rows were skipped — check column mapping and data.`)
      setStage('confirm')
      return
    }

    const CHUNK = 500
    setImportProgress({ done: 0, total: normalized.length })

    try {
      for (let i = 0; i < normalized.length; i += CHUNK) {
        const chunk = normalized.slice(i, i + CHUNK)
        const { error } = await supabase.from('driver_unit_assignments').insert(chunk)
        if (error) throw error
        setImportProgress({ done: Math.min(i + CHUNK, normalized.length), total: normalized.length })
      }
      toast.success(
        `Imported ${normalized.length.toLocaleString()} assignments${skipped > 0 ? ` · ${skipped} rows skipped (invalid data)` : ''}.`
      )
      setStage('idle')
      setParsed(null)
      setMapping(null)
      setImportProgress(null)
      await loadSummary()
    } catch (err) {
      console.error('[driver-import] insert failed:', err)
      const msg = err instanceof Error ? err.message : 'unknown error'
      toast.error(`Import failed: ${msg}`, { duration: 8000 })
      setStage('confirm')
      setImportProgress(null)
    }
  }

  async function clearAll() {
    const { error } = await supabase
      .from('driver_unit_assignments')
      .delete()
      .gte('created_at', '1970-01-01')   // delete-all guard required by Supabase
    if (error) {
      toast.error('Failed to clear: ' + error.message)
    } else {
      toast.success('All assignments cleared.')
      await loadSummary()
    }
    setConfirmClear(false)
  }

  function cancelImport() {
    setStage('idle')
    setParsed(null)
    setMapping(null)
  }

  /* ─── Render ─────────────────────────────────────────────────────────── */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Driver-Unit Assignments
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.55, maxWidth: 720 }}>
          Upload a CSV or Excel file from your dispatch / TMS system to map drivers to units over time. The Samsara
          Repeat Offender Report uses this to attribute alerts to real drivers. Re-importing the same data is safe —
          the resolver picks the most recent record for any time range.
        </p>
      </div>

      {stage === 'idle' && (
        <IdleView
          counts={counts}
          reloadKey={reloadKey}
          onFileSelected={onFileSelected}
          confirmClear={confirmClear}
          onRequestClear={() => setConfirmClear(true)}
          onCancelClear={() => setConfirmClear(false)}
          onClearAll={clearAll}
        />
      )}

      {stage === 'mapper' && parsed && mapping && (
        <MapperView
          parsed={parsed}
          mapping={mapping}
          onChangeMapping={setMappingField}
          canContinue={canContinueFromMapper()}
          onCancel={cancelImport}
          onContinue={() => setStage('confirm')}
        />
      )}

      {stage === 'confirm' && parsed && mapping && (
        <ConfirmView
          parsed={parsed}
          mapping={mapping}
          onBack={() => setStage('mapper')}
          onImport={runImport}
        />
      )}

      {stage === 'importing' && importProgress && (
        <div className="flex items-center gap-3" style={{ padding: '20px', borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
          <Loader2 size={16} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
            Importing {importProgress.done.toLocaleString()} of {importProgress.total.toLocaleString()}…
          </span>
        </div>
      )}
    </div>
  )
}

/* ─── Idle / empty state ─────────────────────────────────────────────────── */

type SortCol = 'unit_id' | 'driver_name' | 'driver_id' | 'start_date' | 'end_date'
const PAGE_SIZE = 25

type EditDraft = {
  unit_id:     string
  driver_id:   string
  driver_name: string
  start_date:  string   // YYYY-MM-DD
  end_date:    string   // YYYY-MM-DD or '' for active
}

function isoToYMD(iso: string): string {
  // Use UTC components so a row with start_date stored as 2026-04-26T12:00 UTC
  // round-trips back to '2026-04-26' regardless of viewer timezone.
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const yy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function ymdToNoonUTC(ymd: string): string | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, y, mo, d] = m
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0)).toISOString()
}

function IdleView({
  counts, reloadKey, onFileSelected, confirmClear, onRequestClear, onCancelClear, onClearAll,
}: {
  counts: { drivers: number; units: number; active: number } | null
  reloadKey: number
  onFileSelected: (file: File) => void
  confirmClear: boolean
  onRequestClear: () => void
  onCancelClear: () => void
  onClearAll: () => void
}) {
  const [page,        setPage]        = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search,      setSearch]      = useState('')   // debounced
  const [activeOnly,  setActiveOnly]  = useState(false)
  const [sortCol,     setSortCol]     = useState<SortCol>('start_date')
  const [sortAsc,     setSortAsc]     = useState(false)
  const [rows,        setRows]        = useState<Assignment[]>([])
  const [total,       setTotal]       = useState(0)
  const [loading,     setLoading]     = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [editingId,    setEditingId]    = useState<string | null>(null)
  const [editDraft,    setEditDraft]    = useState<EditDraft | null>(null)
  const [savingEdit,   setSavingEdit]   = useState(false)
  const [deleteId,     setDeleteId]     = useState<string | null>(null)
  // Local nonce to force IdleView to re-fetch after a CRUD mutation
  const [localReloadKey, setLocalReloadKey] = useState(0)

  // Debounce: wait 250ms after typing stops before firing the query
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset to first page whenever a filter changes
  useEffect(() => { setPage(0) }, [search, activeOnly, sortCol, sortAsc])

  // Fetch page
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    setLoading(true)

    let q = supabase
      .from('driver_unit_assignments')
      .select('id, unit_id, driver_id, driver_name, start_date, end_date', { count: 'exact' })

    if (search) {
      // Server-side OR across all three searchable columns
      q = q.or(`unit_id.ilike.%${search}%,driver_name.ilike.%${search}%,driver_id.ilike.%${search}%`)
    }
    if (activeOnly) {
      q = q.or(`end_date.is.null,end_date.gt.${new Date().toISOString()}`)
    }

    q = q
      .order(sortCol, { ascending: sortAsc })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    q.then(({ data, count, error }) => {
      if (cancelled) return
      if (error) {
        console.error('[driver-assignments] fetch failed:', error)
        toast.error('Failed to load assignments: ' + error.message)
      } else {
        setRows((data ?? []) as Assignment[])
        setTotal(count ?? 0)
      }
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [page, search, activeOnly, sortCol, sortAsc, reloadKey, localReloadKey])

  function toggleSort(col: SortCol) {
    if (col === sortCol) setSortAsc((v) => !v)
    else { setSortCol(col); setSortAsc(false) }
  }

  function startEdit(a: Assignment) {
    setEditingId(a.id)
    setEditDraft({
      unit_id:     a.unit_id,
      driver_id:   a.driver_id,
      driver_name: a.driver_name,
      start_date:  isoToYMD(a.start_date),
      end_date:    a.end_date ? isoToYMD(a.end_date) : '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(null)
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return
    const startISO = ymdToNoonUTC(editDraft.start_date)
    if (!editDraft.unit_id.trim() || !editDraft.driver_id.trim() || !editDraft.driver_name.trim() || !startISO) {
      toast.error('Unit, Driver ID, Driver Name, and Start Date are required.')
      return
    }
    setSavingEdit(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('driver_unit_assignments')
      .update({
        unit_id:     editDraft.unit_id.trim(),
        driver_id:   editDraft.driver_id.trim(),
        driver_name: editDraft.driver_name.trim(),
        start_date:  startISO,
        end_date:    editDraft.end_date ? ymdToNoonUTC(editDraft.end_date) : null,
      })
      .eq('id', editingId)
    setSavingEdit(false)
    if (error) {
      toast.error('Update failed: ' + error.message)
      return
    }
    toast.success('Assignment updated')
    cancelEdit()
    setLocalReloadKey((k) => k + 1)
  }

  async function confirmDelete(id: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('driver_unit_assignments')
      .delete()
      .eq('id', id)
    if (error) {
      toast.error('Delete failed: ' + error.message)
      return
    }
    toast.success('Assignment deleted')
    setDeleteId(null)
    setLocalReloadKey((k) => k + 1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const fromIdx    = total === 0 ? 0 : page * PAGE_SIZE + 1
  const toIdx      = Math.min((page + 1) * PAGE_SIZE, total)

  return (
    <>
      {/* Summary + upload */}
      <div
        className="flex items-center gap-4 flex-wrap"
        style={{ padding: 16, borderRadius: 12, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Currently mapped
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 700, marginTop: 4 }}>
            {counts
              ? `${counts.drivers} driver${counts.drivers === 1 ? '' : 's'} · ${counts.units} unit${counts.units === 1 ? '' : 's'} · ${counts.active} active assignment${counts.active === 1 ? '' : 's'}`
              : 'Loading…'}
          </p>
        </div>

        <label
          className="flex items-center gap-2 cursor-pointer"
          style={{
            padding: '8px 14px', borderRadius: 8,
            background: 'var(--accent)', color: '#fff',
            fontSize: 12, fontWeight: 700,
            border: 'none',
          }}
        >
          <Upload size={13} />
          Upload CSV / XLSX
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onFileSelected(f)
              e.target.value = ''
            }}
            style={{ display: 'none' }}
          />
        </label>

        {(counts?.active ?? 0) > 0 && (
          <button
            onClick={onRequestClear}
            className="flex items-center gap-1.5"
            style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'transparent', color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)', cursor: 'pointer',
            }}
          >
            <Trash2 size={12} /> Clear all
          </button>
        )}
      </div>

      {/* Confirm clear modal */}
      {confirmClear && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={onCancelClear}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} style={{ color: 'var(--severity-critical)' }} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Clear all assignments?</h3>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 16 }}>
              This will delete every driver-unit assignment record. The Samsara report will fall back to the
              raw message-text capture until you re-import. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={onCancelClear}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={onClearAll}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'var(--severity-critical)', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignments table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        {/* Toolbar */}
        <div
          className="flex items-center gap-3 flex-wrap"
          style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            All Assignments {total > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({total.toLocaleString()})</span>}
          </span>

          <div style={{ flex: 1, minWidth: 200, position: 'relative', marginLeft: 'auto', maxWidth: 360 }}>
            <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by unit, driver, or ID…"
              style={{
                width: '100%',
                padding: '6px 10px 6px 28px', borderRadius: 7, fontSize: 12,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <label className="flex items-center gap-1.5 cursor-pointer" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            Active only
          </label>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5"
            style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer',
            }}
          >
            <Plus size={12} /> New Assignment
          </button>
        </div>

        {/* Table */}
        {loading && rows.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <Loader2 size={16} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite', margin: '0 auto 6px' }} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <FileSpreadsheet size={20} style={{ color: 'var(--text-muted)', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {search || activeOnly ? 'No assignments match your filters.' : 'No assignments yet — upload a file to get started.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <SortableTh col="unit_id"     label="Unit"       sortCol={sortCol} sortAsc={sortAsc} onClick={toggleSort} />
                  <SortableTh col="driver_name" label="Driver"     sortCol={sortCol} sortAsc={sortAsc} onClick={toggleSort} />
                  <SortableTh col="driver_id"   label="Driver ID"  sortCol={sortCol} sortAsc={sortAsc} onClick={toggleSort} />
                  <SortableTh col="start_date"  label="Start"      sortCol={sortCol} sortAsc={sortAsc} onClick={toggleSort} />
                  <SortableTh col="end_date"    label="End"        sortCol={sortCol} sortAsc={sortAsc} onClick={toggleSort} />
                  <th style={{ ...thStyle, width: 80, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const editing = editingId === a.id && editDraft !== null
                  if (editing && editDraft) {
                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
                        <td style={tdStyle}>
                          <input value={editDraft.unit_id} onChange={(e) => setEditDraft({ ...editDraft, unit_id: e.target.value })} style={editInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <input value={editDraft.driver_name} onChange={(e) => setEditDraft({ ...editDraft, driver_name: e.target.value })} style={editInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <input value={editDraft.driver_id} onChange={(e) => setEditDraft({ ...editDraft, driver_id: e.target.value })} style={editInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <input type="date" value={editDraft.start_date} onChange={(e) => setEditDraft({ ...editDraft, start_date: e.target.value })} style={editInputStyle} />
                        </td>
                        <td style={tdStyle}>
                          <div className="flex items-center gap-2">
                            <input
                              type="date"
                              value={editDraft.end_date}
                              onChange={(e) => setEditDraft({ ...editDraft, end_date: e.target.value })}
                              style={{ ...editInputStyle, flex: 1 }}
                            />
                            <label className="flex items-center gap-1 cursor-pointer" style={{ fontSize: 10, color: 'var(--text-muted)' }} title="Active = no end date">
                              <input
                                type="checkbox"
                                checked={editDraft.end_date === ''}
                                onChange={(e) => setEditDraft({ ...editDraft, end_date: e.target.checked ? '' : isoToYMD(new Date().toISOString()) })}
                                style={{ accentColor: 'var(--severity-low)' }}
                              />
                              active
                            </label>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={saveEdit}
                              disabled={savingEdit}
                              title="Save"
                              style={iconBtnStyle('var(--severity-low)')}
                            >
                              {savingEdit ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={savingEdit}
                              title="Cancel"
                              style={iconBtnStyle('var(--text-muted)')}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>{a.unit_id}</span></td>
                      <td style={tdStyle}>{a.driver_name}</td>
                      <td style={tdStyle}><span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{a.driver_id}</span></td>
                      <td style={tdStyle}>{new Date(a.start_date).toLocaleDateString()}</td>
                      <td style={tdStyle}>{a.end_date ? new Date(a.end_date).toLocaleDateString() : <span style={{ color: 'var(--severity-low)', fontWeight: 600 }}>active</span>}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => startEdit(a)}
                            title="Edit"
                            style={iconBtnStyle('var(--text-muted)')}
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => setDeleteId(a.id)}
                            title="Delete"
                            style={iconBtnStyle('var(--text-muted)')}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 0 && (
          <div
            className="flex items-center gap-3 flex-wrap"
            style={{ padding: '10px 18px', borderTop: '1px solid var(--border-subtle)' }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Showing {fromIdx.toLocaleString()}–{toIdx.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1.5" style={{ marginLeft: 'auto' }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={pagerBtnStyle(page === 0)}
              >
                ‹ Prev
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '0 6px' }}>
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page + 1 >= totalPages}
                style={pagerBtnStyle(page + 1 >= totalPages)}
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>

      <AssignmentModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSaved={() => setLocalReloadKey((k) => k + 1)}
      />

      {deleteId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setDeleteId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.45)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} style={{ color: 'var(--severity-critical)' }} />
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Delete this assignment?</h3>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: 16 }}>
              This removes the row from the assignments table. The Samsara report will fall back to the
              raw message-text capture for any alerts that were resolving against it.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteId && confirmDelete(deleteId)}
                style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: 'var(--severity-critical)', border: 'none', color: '#fff', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SortableTh({
  col, label, sortCol, sortAsc, onClick,
}: {
  col: SortCol; label: string; sortCol: SortCol; sortAsc: boolean; onClick: (c: SortCol) => void
}) {
  const active = col === sortCol
  return (
    <th
      onClick={() => onClick(col)}
      style={{
        ...thStyle,
        cursor: 'pointer',
        userSelect: 'none',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (sortAsc ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : null}
      </span>
    </th>
  )
}

function pagerBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-secondary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }
}

function iconBtnStyle(color: string): React.CSSProperties {
  return {
    width: 24, height: 24,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 5,
    background: 'transparent', border: '1px solid var(--border-subtle)',
    color, cursor: 'pointer',
  }
}

const editInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 8px', borderRadius: 5, fontSize: 12,
  background: 'var(--bg-card)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', outline: 'none',
}

/* ─── Mapper ─────────────────────────────────────────────────────────────── */

const FIELD_LABELS: Record<FieldKey, { label: string; required: boolean; hint: string }> = {
  unit_id:     { label: 'Unit ID',      required: true,  hint: 'Truck/unit number (e.g., M83). Use Equipment Name, NOT Equipment ID.' },
  driver_id:   { label: 'Driver ID',    required: true,  hint: 'Internal driver/employee ID (integer or string).' },
  driver_name: { label: 'Driver Name',  required: true,  hint: 'Display name as it should appear in reports.' },
  start_date:  { label: 'Start Date',   required: true,  hint: 'When the assignment began.' },
  end_date:    { label: 'End Date',     required: false, hint: 'When it ended. N/A or blank means still active.' },
}

function MapperView({
  parsed, mapping, onChangeMapping, canContinue, onCancel, onContinue,
}: {
  parsed: ParsedFile
  mapping: ColumnMapping
  onChangeMapping: (field: FieldKey, value: string | null) => void
  canContinue: boolean
  onCancel: () => void
  onContinue: () => void
}) {
  const fields: FieldKey[] = ['unit_id', 'driver_id', 'driver_name', 'start_date', 'end_date']

  return (
    <>
      <div className="rounded-xl" style={{ padding: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
          Map columns
        </h3>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
          Confirm which spreadsheet columns map to each field. Auto-detected guesses are pre-selected.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
          {fields.map((f) => (
            <div key={f} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', alignItems: 'center', gap: 12 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{FIELD_LABELS[f].label}</span>
                {FIELD_LABELS[f].required && <span style={{ color: 'var(--severity-critical)', marginLeft: 4 }}>*</span>}
                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{FIELD_LABELS[f].hint}</p>
              </div>
              <select
                value={mapping[f] ?? ''}
                onChange={(e) => onChangeMapping(f, e.target.value || null)}
                style={{
                  padding: '6px 10px', borderRadius: 7, fontSize: 12,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">{FIELD_LABELS[f].required ? '— select column —' : '— skip —'}</option>
                {parsed.columns.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            Preview · first {Math.min(5, parsed.sampleRows.length)} of {parsed.allRows.length.toLocaleString()} rows
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                {(['unit_id', 'driver_id', 'driver_name', 'start_date', 'end_date'] as FieldKey[]).map((f) => (
                  <th key={f} style={thStyle}>{FIELD_LABELS[f].label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.sampleRows.map((row, i) => {
                const norm = normalizeRow(row, mapping)
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={tdStyle}>{norm?.unit_id ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={tdStyle}>{norm?.driver_id ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={tdStyle}>{norm?.driver_name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={tdStyle}>{norm ? new Date(norm.start_date).toLocaleDateString() : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                    <td style={tdStyle}>
                      {norm?.end_date
                        ? new Date(norm.end_date).toLocaleDateString()
                        : norm
                        ? <span style={{ color: 'var(--severity-low)', fontWeight: 600 }}>active</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <ArrowLeft size={12} style={{ display: 'inline-block', marginRight: 4 }} /> Cancel
        </button>
        <button
          onClick={onContinue}
          disabled={!canContinue}
          style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: canContinue ? 'var(--accent)' : 'var(--bg-elevated)',
            border: 'none', color: canContinue ? '#fff' : 'var(--text-muted)',
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
        >
          Continue to Import <ArrowRight size={12} style={{ display: 'inline-block', marginLeft: 4 }} />
        </button>
      </div>
    </>
  )
}

/* ─── Confirm ────────────────────────────────────────────────────────────── */

function ConfirmView({
  parsed, mapping, onBack, onImport,
}: {
  parsed: ParsedFile
  mapping: ColumnMapping
  onBack: () => void
  onImport: () => void
}) {
  const allNormalized = parsed.allRows.map((r) => normalizeRow(r, mapping))
  const valid         = allNormalized.filter((r): r is NewAssignment => r !== null)
  const skipped       = allNormalized.length - valid.length
  const distinctUnits   = new Set(valid.map((r) => r.unit_id))
  const distinctDrivers = new Set(valid.map((r) => r.driver_id))
  const dates           = valid.map((r) => r.start_date).sort()
  const earliest        = dates[0]
  const latest          = dates[dates.length - 1]

  return (
    <>
      <div className="rounded-xl" style={{ padding: 16, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          Ready to import
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3" style={{ gap: 12 }}>
          <SummaryStat label="Rows to import" value={valid.length.toLocaleString()} />
          <SummaryStat label="Unique units" value={distinctUnits.size.toLocaleString()} />
          <SummaryStat label="Unique drivers" value={distinctDrivers.size.toLocaleString()} />
          <SummaryStat label="Date range" value={
            earliest && latest
              ? `${new Date(earliest).toLocaleDateString()} – ${new Date(latest).toLocaleDateString()}`
              : '—'
          } />
        </div>
        {skipped > 0 && (
          <p style={{ fontSize: 11, color: 'var(--severity-high)', marginTop: 12 }}>
            <AlertTriangle size={11} style={{ display: 'inline-block', marginRight: 4 }} />
            {skipped} row{skipped === 1 ? '' : 's'} will be skipped (missing required fields or invalid dates).
          </p>
        )}
      </div>

      {/* 10-row sample */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            Sample · first 10 rows as they'll be inserted
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                <th style={thStyle}>Unit</th>
                <th style={thStyle}>Driver</th>
                <th style={thStyle}>Driver ID</th>
                <th style={thStyle}>Start</th>
                <th style={thStyle}>End</th>
              </tr>
            </thead>
            <tbody>
              {valid.slice(0, 10).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.unit_id}</span></td>
                  <td style={tdStyle}>{r.driver_name}</td>
                  <td style={tdStyle}><span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.driver_id}</span></td>
                  <td style={tdStyle}>{new Date(r.start_date).toLocaleDateString()}</td>
                  <td style={tdStyle}>{r.end_date ? new Date(r.end_date).toLocaleDateString() : <span style={{ color: 'var(--severity-low)', fontWeight: 600 }}>active</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          onClick={onBack}
          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <ArrowLeft size={12} style={{ display: 'inline-block', marginRight: 4 }} /> Back
        </button>
        <button
          onClick={onImport}
          disabled={valid.length === 0}
          className="flex items-center gap-2"
          style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: valid.length > 0 ? 'var(--accent)' : 'var(--bg-elevated)',
            border: 'none', color: valid.length > 0 ? '#fff' : 'var(--text-muted)',
            cursor: valid.length > 0 ? 'pointer' : 'not-allowed',
          }}
        >
          <CheckCircle2 size={12} />
          Import {valid.length.toLocaleString()} row{valid.length === 1 ? '' : 's'}
        </button>
      </div>
    </>
  )
}

/* ─── Tiny shared bits ───────────────────────────────────────────────────── */

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
  color: 'var(--text-muted)',
}
const tdStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 12,
  color: 'var(--text-secondary)',
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 800, marginTop: 2 }}>{value}</p>
    </div>
  )
}
