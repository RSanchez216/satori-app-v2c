'use client'

import { useState } from 'react'
import {
  X, Send, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2,
  MessageSquare,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Department } from '@/types/database'

interface Props {
  departments: Department[]
  onClose: () => void
  onAdded: (source: {
    id: string
    name: string
    type: 'telegram' | 'email' | 'phone'
    external_id: string | null
    is_active: boolean
    muted: boolean
    created_at: string
    department_id: string | null
  }) => void
}

type Step = 'form' | 'instructions' | 'done'

export function AddSourceModal({ departments, onClose, onAdded }: Props) {
  const [step,        setStep]        = useState<Step>('form')
  const [name,        setName]        = useState('')
  const [chatId,      setChatId]      = useState('')
  const [deptId,      setDeptId]      = useState<string>('')
  const [botToken,    setBotToken]    = useState('')
  const [showToken,   setShowToken]   = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [savedSource, setSavedSource] = useState<{ id: string; name: string; external_id: string | null } | null>(null)

  const webhookUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/telegram/webhook`
      : '/api/telegram/webhook'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim())   return setError('Display name is required.')
    if (!chatId.trim()) return setError('Chat ID is required.')

    setLoading(true)
    try {
      const supabase = createClient()
      const { data, error: dbErr } = await supabase
        .from('sources')
        .insert({
          name: name.trim(),
          type: 'telegram',
          external_id: chatId.trim(),
          is_active: true,
          muted: false,
          department_id: deptId || null,
        })
        .select()
        .single()

      if (dbErr) throw new Error(dbErr.message)

      setSavedSource(data)
      onAdded(data)
      setStep('instructions')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  async function registerWebhook() {
    if (!botToken.trim()) return setError('Enter your bot token to register the webhook.')
    setError(null)
    setLoading(true)
    try {
      const res  = await fetch(
        `https://api.telegram.org/bot${botToken.trim()}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
      )
      const json = await res.json()
      if (!json.ok) throw new Error(json.description ?? 'Failed to register webhook')
      setStep('done')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Webhook registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
              <MessageSquare size={15} />
            </div>
            <div>
              <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {step === 'done' ? 'Source Connected!' : 'Connect Telegram Source'}
              </p>
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {step === 'form' ? 'Step 1 of 2 — Source details' : step === 'instructions' ? 'Step 2 of 2 — Register webhook' : 'All set'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">

          {/* ── STEP 1: Form ── */}
          {step === 'form' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Display Name" hint="How this source will appear in SATORI" required>
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dispatch Group, Safety Channel" className="satori-input"
                />
              </Field>

              <Field label="Telegram Chat ID" hint={<>The numeric ID of the group or channel. <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>Get it from @userinfobot</a> — forward a message from the group to get its ID.</>} required>
                <input
                  type="text" value={chatId} onChange={(e) => setChatId(e.target.value)}
                  placeholder="e.g. -1001234567890" className="satori-input font-mono"
                />
              </Field>

              <Field label="Department" hint="Assign this source to a department for organized monitoring">
                <select
                  value={deptId}
                  onChange={(e) => setDeptId(e.target.value)}
                  className="satori-input"
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.icon} {d.name}</option>
                  ))}
                </select>
              </Field>

              <div className="p-3 rounded-lg text-[12px] leading-relaxed" style={{ background: 'rgba(62,207,207,0.06)', border: '1px solid rgba(62,207,207,0.12)', color: 'var(--text-secondary)' }}>
                <p className="font-semibold mb-1" style={{ color: 'var(--accent)' }}>Before you connect:</p>
                <ol className="list-decimal list-inside space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <li>Create a Telegram bot via <span className="font-mono" style={{ color: 'var(--text-primary)' }}>@BotFather</span></li>
                  <li>Add the bot as an <strong>admin</strong> to your group/channel</li>
                  <li>Copy the Chat ID from <span className="font-mono" style={{ color: 'var(--text-primary)' }}>@userinfobot</span></li>
                </ol>
              </div>

              {error && <ErrorMsg msg={error} />}

              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancel</button>
                <button type="submit" className="btn-accent flex-1" disabled={loading}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {loading ? 'Saving...' : 'Save & Continue'}
                </button>
              </div>
            </form>
          )}

          {/* ── STEP 2: Webhook ── */}
          {step === 'instructions' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg" style={{ background: 'rgba(86,211,100,0.08)', border: '1px solid rgba(86,211,100,0.15)' }}>
                <p className="text-[12px] font-semibold" style={{ color: 'var(--severity-low)' }}>
                  ✓ Source &ldquo;{savedSource?.name}&rdquo; saved successfully
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Now register the webhook so Telegram sends messages to SATORI.
                </p>
              </div>

              <Field label="Bot Token" hint="From @BotFather — starts with a number followed by a colon">
                <div className="relative">
                  <input
                    type={showToken ? 'text' : 'password'} value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder="110201543:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw"
                    className="satori-input font-mono pr-10"
                  />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowToken(!showToken)} style={{ color: 'var(--text-muted)' }}>
                    {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </Field>

              <Field label="Webhook URL" hint="This is where Telegram will POST all messages">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-[11px] select-all" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', color: 'var(--accent)' }}>
                  {webhookUrl}
                </div>
              </Field>

              <div className="p-3 rounded-lg text-[12px]" style={{ background: 'rgba(227,179,65,0.06)', border: '1px solid rgba(227,179,65,0.15)', color: 'var(--text-secondary)' }}>
                <p className="font-semibold mb-1" style={{ color: 'var(--severity-high)' }}>Manual alternative</p>
                <p className="mb-1">Run this in your browser or terminal:</p>
                <code className="block text-[10px] p-2 rounded overflow-x-auto" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
                  {`https://api.telegram.org/bot<TOKEN>/setWebhook?url=${webhookUrl}`}
                </code>
              </div>

              {error && <ErrorMsg msg={error} />}

              <div className="flex gap-2 pt-1">
                <button className="btn-ghost flex-1" onClick={onClose}>Skip for now</button>
                <button className="btn-accent flex-1" onClick={registerWebhook} disabled={loading}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {loading ? 'Registering...' : 'Register Webhook'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Done ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(86,211,100,0.12)', border: '1px solid rgba(86,211,100,0.25)' }}>
                <CheckCircle2 size={28} style={{ color: 'var(--severity-low)' }} />
              </div>
              <div>
                <p className="text-[16px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Telegram source is live</p>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  SATORI will now receive messages from{' '}
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{savedSource?.name}</span>.
                  Send a message in the group to test — it should appear in the Context Inbox within seconds.
                </p>
              </div>
              <button className="btn-accent w-full" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Helpers ── */

function Field({ label, hint, required, children }: { label: string; hint?: React.ReactNode; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>
        {label}
        {required && <span style={{ color: 'var(--severity-critical)' }}>*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg text-[12px]" style={{ background: 'var(--bell-error-bg)', border: '1px solid var(--bell-error-border)', color: 'var(--bell-error)' }}>
      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
      {msg}
    </div>
  )
}
