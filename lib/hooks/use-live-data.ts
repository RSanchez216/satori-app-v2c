'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Reusable Realtime + focus-refetch + last-updated hook.
 *
 * Designed to layer on top of *either* a client-side fetcher (returns data)
 * or a server-data-flow page (fetcher just calls `router.refresh()` and
 * resolves; data flows through props). Generic over T so the caller picks
 * the return type — use `void` / `null` when data is sourced from props.
 *
 * Behaviors:
 * - Initial fetch on mount.
 * - Optional `window.focus` refetch.
 * - Optional Realtime subscription on a single table (filter via
 *   PostgREST-style strings, e.g. `source_id=eq.<uuid>`). Bursts of
 *   incoming events are debounced into a single refetch.
 * - `shouldPause` lets the caller defer refetches while a modal /
 *   accordion is open. A queued refetch is exposed via `pendingUpdate`
 *   so the UI can show a "new data available" hint, and fires
 *   automatically once `shouldPause` returns false again.
 * - Cleans up the channel + debounce timer on unmount.
 */

interface RealtimeFilter {
  table:    string
  schema?:  string
  event?:   'INSERT' | 'UPDATE' | 'DELETE' | '*'
  filter?:  string
  /** Stable channel name. Defaults to `live-data-<table>` if omitted. */
  channel?: string
}

interface UseLiveDataOptions<T> {
  fetcher:           () => Promise<T>
  realtime?:         RealtimeFilter | null
  refetchOnFocus?:   boolean
  debounceMs?:       number
  shouldPause?:      () => boolean
}

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'disabled'

interface UseLiveDataResult<T> {
  data:            T | null
  isLoading:       boolean
  error:           Error | null
  lastUpdated:     Date | null
  refetch:         () => Promise<void>
  realtimeStatus:  RealtimeStatus
  pendingUpdate:   boolean
}

export function useLiveData<T>(opts: UseLiveDataOptions<T>): UseLiveDataResult<T> {
  const { fetcher, realtime, refetchOnFocus = true, debounceMs = 1500, shouldPause } = opts

  const [data, setData]           = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState<Error | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(
    realtime ? 'connecting' : 'disabled'
  )
  const [pendingUpdate, setPendingUpdate] = useState(false)

  // Refs keep stable references for the long-lived channel & focus listener
  // so we can read the latest fetcher / shouldPause without re-subscribing
  // every render.
  const fetcherRef     = useRef(fetcher);     fetcherRef.current     = fetcher
  const shouldPauseRef = useRef(shouldPause); shouldPauseRef.current = shouldPause
  const debounceTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Minimum spinner duration so manual Refresh / focus refetch / Realtime
  // pulse give visible feedback even when the underlying fetcher resolves
  // instantly — common for SSR-prop pages where the "fetcher" is just
  // router.refresh() (fire-and-forget; no Promise tied to the re-render).
  // 500ms is long enough to register as intentional, short enough to feel
  // responsive.
  const SPIN_MIN_MS = 500

  const refetch = useCallback(async () => {
    setIsLoading(true)
    try {
      setError(null)
      const [result] = await Promise.all([
        fetcherRef.current(),
        new Promise<void>(resolve => setTimeout(resolve, SPIN_MIN_MS)),
      ])
      setData(result)
      setLastUpdated(new Date())
      setPendingUpdate(false)
    } catch (err) {
      setError(err as Error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const triggerDebouncedRefetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      if (shouldPauseRef.current?.()) {
        setPendingUpdate(true)
        return
      }
      refetch()
    }, debounceMs)
  }, [debounceMs, refetch])

  // Initial fetch — exactly once on mount.
  useEffect(() => {
    refetch()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Focus refetch.
  useEffect(() => {
    if (!refetchOnFocus) return
    const onFocus = () => {
      if (shouldPauseRef.current?.()) {
        setPendingUpdate(true)
        return
      }
      refetch()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refetchOnFocus, refetch])

  // Realtime subscription. Re-subscribes only when the (table, event,
  // filter, schema, channel) tuple actually changes — JSON-stringified
  // because `realtime` is a fresh object literal each render.
  const realtimeKey = realtime
    ? `${realtime.schema ?? 'public'}|${realtime.table}|${realtime.event ?? 'INSERT'}|${realtime.filter ?? ''}|${realtime.channel ?? ''}`
    : ''
  useEffect(() => {
    if (!realtime) return
    const supabase = createClient()
    const channelName = realtime.channel ?? `live-data-${realtime.table}`
    const channel = supabase
      .channel(channelName)
      .on(
        // Cast: supabase-js types `postgres_changes` as a string-literal but
        // we accept a runtime-typed event via the options object.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event:  realtime.event  ?? 'INSERT',
          schema: realtime.schema ?? 'public',
          table:  realtime.table,
          ...(realtime.filter ? { filter: realtime.filter } : {}),
        },
        () => triggerDebouncedRefetch(),
      )
      .subscribe(status => {
        if      (status === 'SUBSCRIBED')                                 setRealtimeStatus('connected')
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR'
              || status === 'TIMED_OUT')                                  setRealtimeStatus('disconnected')
      })

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeKey, triggerDebouncedRefetch])

  // If a refetch was queued while paused, fire it as soon as shouldPause
  // returns false. We re-evaluate whenever pendingUpdate flips on, and
  // also expose this so the caller can poke us by toggling state that
  // changes shouldPause's return.
  useEffect(() => {
    if (!pendingUpdate) return
    if (shouldPauseRef.current?.()) return
    refetch()
  }, [pendingUpdate, refetch])

  return { data, isLoading, error, lastUpdated, refetch, realtimeStatus, pendingUpdate }
}
