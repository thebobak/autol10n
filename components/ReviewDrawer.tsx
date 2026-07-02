'use client'

import { useState, useMemo, useEffect, useRef } from 'react'

export type DrawerState = {
  editedEls: Set<Element>
  initialTexts: Map<Element, string>
}
import type { TransUnit } from '@/lib/xliff'
import { setTranslation } from '@/lib/xliff'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInnerXml(el: Element): string {
  const s = new XMLSerializer()
  let out = ''
  el.childNodes.forEach((n) => { out += s.serializeToString(n) })
  return out
}

function stripTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, '').trim()
}

function getTargetText(unit: TransUnit): string {
  const t = unit.element.querySelector('target')
  return t ? stripTags(getInnerXml(t)) : ''
}

/**
 * Find the minimal changed region between two strings using a common
 * prefix/suffix scan. Returns the change as {start, end, replacement}
 * where old[start..end) should be replaced with `replacement`.
 */
function findMinimalChange(
  oldText: string,
  newText: string
): { start: number; end: number; replacement: string } | null {
  if (oldText === newText) return null

  let prefixLen = 0
  while (
    prefixLen < oldText.length &&
    prefixLen < newText.length &&
    oldText[prefixLen] === newText[prefixLen]
  ) prefixLen++

  let suffixLen = 0
  const maxSuffix = Math.min(oldText.length - prefixLen, newText.length - prefixLen)
  while (
    suffixLen < maxSuffix &&
    oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
  ) suffixLen++

  return {
    start: prefixLen,
    end: oldText.length - suffixLen,
    replacement: newText.slice(prefixLen, suffixLen > 0 ? -suffixLen : undefined),
  }
}

/**
 * Apply a plain-text edit to a TransUnit while preserving the XML tag
 * structure of the <target> element.
 *
 * Strategy: collect all text nodes from the <target> in document order,
 * concatenate them into a single string, run findMinimalChange against the
 * user's edited text, then apply the diff surgically — the first affected
 * text node receives the replacement, subsequent affected nodes have their
 * contribution to the changed region removed. Surrounding nodes and all
 * <g> tag structure are completely untouched.
 *
 * Falls back to setTranslation (plain text, no tags) if there are no text
 * nodes or the diff can't be applied.
 */
function applyTextEdit(unit: TransUnit, newText: string): void {
  const targetEl = unit.element.querySelector('target')
  if (!targetEl) {
    setTranslation(unit, newText)
    return
  }

  const ownerDoc = unit.element.ownerDocument!

  // Collect text nodes with their positions in the combined string
  const nodes: Array<{ node: Text; start: number; end: number }> = []
  let pos = 0
  const walker = ownerDoc.createTreeWalker(targetEl, NodeFilter.SHOW_TEXT)
  let n = walker.nextNode()
  while (n) {
    const text = (n as Text).textContent ?? ''
    nodes.push({ node: n as Text, start: pos, end: pos + text.length })
    pos += text.length
    n = walker.nextNode()
  }

  if (nodes.length === 0) {
    setTranslation(unit, newText)
    return
  }

  const oldCombined = nodes.map((t) => t.node.textContent ?? '').join('')
  const change = findMinimalChange(oldCombined, newText)
  if (!change) return

  const { start: cs, end: ce, replacement } = change
  let applied = false

  for (const { node, start, end } of nodes) {
    // Outside the changed region — leave untouched
    if (end <= cs || start >= ce) continue

    const nodeText = node.textContent ?? ''
    const localStart = Math.max(0, cs - start)
    const localEnd = Math.min(nodeText.length, ce - start)
    const before = nodeText.slice(0, localStart)
    const after = nodeText.slice(localEnd)

    if (!applied) {
      // First affected node: insert the replacement here
      node.textContent = before + replacement + after
      applied = true
    } else {
      // Subsequent affected nodes: strip their contribution to the changed region
      node.textContent = before + after
    }
  }

  if (!applied) setTranslation(unit, newText)
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Filter = 'all' | 'errors' | 'edited' | 'mismatches'

interface Props {
  units: TransUnit[]
  errorUnitIds: Set<string>
  // Segments where a glossary term matched the source but wasn't found in
  // the translation — flagged softly, not treated as a hard error.
  glossaryMismatchEls: Set<Element>
  savedState: DrawerState | null
  onClose: () => void
  onEditsChange: (count: number) => void
  onSaveState: (state: DrawerState) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReviewDrawer({ units, errorUnitIds, glossaryMismatchEls, savedState, onClose, onEditsChange, onSaveState }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [editingEl, setEditingEl] = useState<Element | null>(null)
  const [draftText, setDraftText] = useState('')
  // Use Element references as keys — unit.id is not unique across <file> sections
  // (multiple trans-units can legitimately share id="title").
  const [editedEls, setEditedEls] = useState<Set<Element>>(
    () => savedState?.editedEls ?? new Set()
  )

  // Restore from saved state if available; otherwise snapshot current target text.
  const [initialTexts] = useState<Map<Element, string>>(() => {
    if (savedState) return savedState.initialTexts
    const snap = new Map<Element, string>()
    for (const unit of units) snap.set(unit.element, getTargetText(unit))
    return snap
  })

  // Persist state when the drawer unmounts so it can be restored on reopen.
  // Use a ref to always capture the latest values in the cleanup closure.
  const stateRef = useRef<DrawerState>({ editedEls, initialTexts })
  useEffect(() => { stateRef.current = { editedEls, initialTexts } })
  useEffect(() => { return () => onSaveState(stateRef.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (unit: TransUnit) => {
    setDraftText(getTargetText(unit))
    setEditingEl(unit.element)
  }

  const saveEdit = (unit: TransUnit) => {
    applyTextEdit(unit, draftText)
    const next = new Set([...editedEls, unit.element])
    setEditedEls(next)
    setEditingEl(null)
    onEditsChange(next.size)
  }

  const cancelEdit = () => setEditingEl(null)

  const revertUnit = (unit: TransUnit) => {
    applyTextEdit(unit, initialTexts.get(unit.element) ?? '')
    const next = new Set(editedEls)
    next.delete(unit.element)
    setEditedEls(next)
    if (editingEl === unit.element) setEditingEl(null)
    onEditsChange(next.size)
  }

  const revertAll = () => {
    for (const unit of units) {
      if (editedEls.has(unit.element)) applyTextEdit(unit, initialTexts.get(unit.element) ?? '')
    }
    setEditedEls(new Set())
    setEditingEl(null)
    onEditsChange(0)
  }

  const filtered = useMemo(() => {
    let list = units
    if (filter === 'errors') list = list.filter((u) => errorUnitIds.has(u.id))
    if (filter === 'edited') list = list.filter((u) => editedEls.has(u.element))
    if (filter === 'mismatches') list = list.filter((u) => glossaryMismatchEls.has(u.element))
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((u) => {
        const src = stripTags(u.sourceXml).toLowerCase()
        const tgt = getTargetText(u).toLowerCase()
        return src.includes(q) || tgt.includes(q) || u.id.toLowerCase().includes(q)
      })
    }
    return list
  }, [units, filter, search, editedEls, errorUnitIds, glossaryMismatchEls])

  const filterLabel = (f: Filter) => {
    if (f === 'errors') return errorUnitIds.size > 0 ? `Errors (${errorUnitIds.size})` : 'Errors'
    if (f === 'edited') return editedEls.size > 0 ? `Edited (${editedEls.size})` : 'Edited'
    if (f === 'mismatches') return glossaryMismatchEls.size > 0 ? `Mismatches (${glossaryMismatchEls.size})` : 'Mismatches'
    return 'All'
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(43,45,66,0.35)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col"
        style={{
          width: 'min(920px, 93vw)',
          background: 'var(--paper)',
          borderLeft: '2px solid var(--ink)',
          boxShadow: '-6px 0 0 0 var(--ink)',
        }}
      >
        {/* ── Header ── */}
        <div className="shrink-0" style={{ background: 'var(--ink)' }}>
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="retro-btn btn-ghost-dark"
                style={{ padding: '0.35rem' }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--paper)', fontWeight: 700, fontSize: '1rem' }}>
                Translation Review
              </h2>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'rgba(255,253,247,0.45)', fontSize: '0.6rem', letterSpacing: '0.06em' }}>
              {filtered.length} / {units.length} segments
            </span>
          </div>
        </div>

        {/* ── Search + filter ── */}
        <div
          className="shrink-0 flex items-center gap-3 px-5 py-3"
          style={{ borderBottom: '2px solid var(--ink)', background: 'var(--canvas)' }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search segments…"
            className="retro-input flex-1"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.65rem' }}
          />
          {(['all', 'errors', 'edited', 'mismatches'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="retro-btn shrink-0"
              style={{
                fontSize: '0.7rem',
                padding: '0.3rem 0.7rem',
                background: filter === f ? 'var(--primary)' : 'transparent',
                color: filter === f ? 'var(--paper)' : 'var(--muted)',
                borderColor: filter === f ? 'var(--primary)' : 'var(--ink)',
              }}
            >
              {filterLabel(f)}
            </button>
          ))}
        </div>

        {/* ── Column headers ── */}
        <div
          className="shrink-0 grid grid-cols-2"
          style={{ borderBottom: '2px solid var(--ink)', background: 'var(--canvas)' }}
        >
          {['Original', 'Translation'].map((label, i) => (
            <div
              key={label}
              className="px-4 py-2"
              style={i === 0 ? { borderRight: '2px solid var(--ink)' } : {}}
            >
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* ── Segment list ── */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--muted)', fontSize: '0.75rem' }}>
                No segments match.
              </p>
            </div>
          ) : (
            filtered.map((unit, idx) => {
              const targetText = getTargetText(unit)
              const isEditing = editingEl === unit.element
              const isEdited = editedEls.has(unit.element)
              const hasError = errorUnitIds.has(unit.id)
              const hasMismatch = glossaryMismatchEls.has(unit.element)
              const sourcePlain = stripTags(unit.sourceXml)

              return (
                <div
                  key={idx}
                  style={{
                    borderBottom: '1px solid #e5e5e5',
                    background: idx % 2 === 0 ? 'var(--paper)' : 'var(--canvas)',
                  }}
                >
                  {/* Unit ID row */}
                  <div
                    className="flex items-center gap-2 px-4 py-1"
                    style={{ borderBottom: '1px solid #e5e5e5', background: 'rgba(43,45,66,0.04)' }}
                  >
                    <p className="flex-1 truncate" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.58rem', color: 'var(--muted)' }}>
                      {unit.id}
                    </p>
                    {isEdited && (
                      <span
                        title="Manually edited"
                        style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, border: '1.5px solid var(--ink)' }}
                      />
                    )}
                    {hasError && (
                      <span
                        title="Translation error"
                        style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--accent-dark)', flexShrink: 0, border: '1.5px solid var(--ink)' }}
                      />
                    )}
                    {hasMismatch && (
                      <span
                        title="Glossary term not found in translation"
                        style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--primary-light)', flexShrink: 0, border: '1.5px solid var(--ink)' }}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="grid grid-cols-2" style={{ minHeight: '3.25rem' }}>
                    {/* Source */}
                    <div className="px-4 py-3" style={{ borderRight: '2px solid var(--ink)' }}>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--darker)' }}>
                        {sourcePlain || <em style={{ color: 'var(--muted)' }}>empty</em>}
                      </p>
                    </div>

                    {/* Translation */}
                    <div className="px-4 py-3">
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            rows={Math.max(2, Math.ceil(draftText.length / 50))}
                            className="retro-input w-full"
                            style={{ fontSize: '0.8rem', resize: 'vertical', lineHeight: 1.6 }}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(unit)}
                              className="retro-btn btn-primary"
                              style={{ fontSize: '0.72rem', padding: '0.3rem 0.75rem' }}
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="retro-btn btn-ghost"
                              style={{ fontSize: '0.72rem', padding: '0.3rem 0.75rem' }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className="text-sm leading-relaxed flex-1"
                            style={{
                              color: targetText ? 'var(--ink)' : 'var(--muted)',
                              fontStyle: targetText ? 'normal' : 'italic',
                            }}
                          >
                            {targetText || 'Not translated'}
                          </p>
                          <div className="flex gap-1 shrink-0">
                            {targetText && (
                              <button
                                onClick={() => startEdit(unit)}
                                className="retro-btn btn-ghost"
                                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                                title="Edit translation"
                              >
                                ✎
                              </button>
                            )}
                            {isEdited && (
                              <button
                                onClick={() => revertUnit(unit)}
                                className="retro-btn btn-ghost"
                                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: 'var(--muted)' }}
                                title="Revert to original AI translation"
                              >
                                ↩
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── Footer ── */}
        {editedEls.size > 0 && (
          <div
            className="shrink-0 flex items-center justify-between gap-4 px-5 py-3"
            style={{ borderTop: '2px solid var(--ink)', background: 'var(--canvas)' }}
          >
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--ink)' }}>
              <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{editedEls.size}</span>
              {' '}segment{editedEls.size !== 1 ? 's' : ''} manually edited — included in next download.
            </p>
            <button
              onClick={revertAll}
              className="retro-btn btn-ghost shrink-0"
              style={{ fontSize: '0.7rem', padding: '0.3rem 0.7rem' }}
            >
              ↩ Revert All
            </button>
          </div>
        )}
      </div>
    </>
  )
}
