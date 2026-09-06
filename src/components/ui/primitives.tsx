import { useId, type ReactNode } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import type { Provenance } from '../../engine/types'

/** Hairline-separated content block. */
export function Section({ title, note, children, tools, id, level = 2 }: { title?: ReactNode; note?: ReactNode; children: ReactNode; tools?: ReactNode; id?: string; level?: 2 | 3 }) {
  const H = level === 3 ? 'h3' : 'h2'
  return (
    <section className="section" aria-labelledby={id ? `${id}-title` : undefined}>
      {(title || tools) && (
        <header className="section__head">
          <div>
            {title && (
              <H className="section__title" id={id ? `${id}-title` : undefined}>
                {title}
              </H>
            )}
            {note && <div className="section__note">{note}</div>}
          </div>
          {tools}
        </header>
      )}
      {children}
    </section>
  )
}

const PROV_LABEL: Record<Provenance, string> = { sourced: 'sourced', derived: 'design inference', scenario: 'scenario input', synthetic: 'synthetic' }

/** One quiet provenance word per section, never a pill per value. */
export function Mark({ kind, children, title }: { kind: Provenance; children?: ReactNode; title?: string }) {
  const cls = kind === 'sourced' ? 'mark--sourced' : ''
  return (
    <span className={`mark ${cls}`} title={title ?? PROV_LABEL[kind]}>
      {children ?? PROV_LABEL[kind]}
    </span>
  )
}

/** Label over numeral: the instrument grammar. */
export function Cell({ label, value, unit, tone, ghost, title }: { label: string; value: ReactNode; unit?: string; tone?: 'warn' | 'crit'; ghost?: boolean; title?: string }) {
  const cls = tone === 'warn' ? 'risk-warn' : tone === 'crit' ? 'risk-crit' : ''
  return (
    <div className={`cell ${ghost ? 'cell--ghost' : ''}`} title={title}>
      <span className="label">{label}</span>
      <span className={`numeral ${cls}`}>
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  )
}

export function Rows({ items, sans = false }: { items: [ReactNode, ReactNode][]; sans?: boolean }) {
  return (
    <dl className="rows">
      {items.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd className={sans ? 'sans' : undefined}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Check({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Field labels a single input (rendered as <label>) or, with `group`, a set of controls such as
 * a Segmented (rendered as a labelled group so the caption never binds to the first button).
 */
export function Field({ label, hint, children, value, error, group = false }: { label: string; hint?: string; children: ReactNode; value?: ReactNode; error?: string; group?: boolean }) {
  const id = useId()
  const body = (
    <>
      <span className="field__label" id={group ? id : undefined}>
        <span>{label}</span>
        {value !== undefined && <span className="num">{value}</span>}
      </span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </>
  )
  return group ? (
    <div className={`field ${error ? 'field--error' : ''}`} role="group" aria-labelledby={id}>
      {body}
    </div>
  ) : (
    <label className={`field ${error ? 'field--error' : ''}`}>{body}</label>
  )
}

export function Slider({ label, value, min, max, step, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string; hint?: string }) {
  return (
    <Field label={label} value={format ? format(value) : value} hint={hint}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </Field>
  )
}

export function Select<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Working({ value, message }: { value: number; message?: string }) {
  return (
    <div className="working" role="status">
      <div className="working__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label="Progress">
        <div style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      {message && <div className="working__msg">{message}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div className="error" role="alert">
      {children}
    </div>
  )
}

export function Narrative({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div>
      {paragraphs.map((p, i) => (
        <p key={i} className="narrative">
          {p}
        </p>
      ))}
    </div>
  )
}

/** Native disclosure: the progressive-disclosure unit for panels. */
export function Disclosure({ summary, count, children, open, tone }: { summary: ReactNode; count?: ReactNode; children: ReactNode; open?: boolean; tone?: 'warn' | 'crit' }) {
  return (
    <details className="disc" open={open}>
      <summary>
        <span className={tone === 'crit' ? 'risk-crit' : tone === 'warn' ? 'risk-warn' : ''}>{summary}</span>
        {count !== undefined && <span className="disc__count num">{count}</span>}
        <CaretDown className="disc__chev" size={14} aria-hidden="true" />
      </summary>
      <div className="disc__body">{children}</div>
    </details>
  )
}


/** Explains an empty Pareto archive from the engine's violation tally. */
export function NoFeasiblePlan({ tally, evaluations, excluded, onRoutes }: { tally: { reason: string; count: number }[]; evaluations: number; excluded: { name: string; reason: string }[]; onRoutes?: () => void }) {
  const top = tally.slice(0, 3)
  return (
    <div role="alert">
      <p className="narrative" style={{ fontSize: 15 }}>
        No plan satisfies the mission constraints. {evaluations.toLocaleString()} candidates were evaluated and every one breached at least one limit
        {top.length ? ':' : '.'}
      </p>
      {top.length > 0 && (
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
          {top.map((t) => (
            <li key={t.reason} className="small" style={{ display: 'flex', gap: 12, padding: '4px 0' }}>
              <span className="num muted" style={{ minWidth: 48 }}>
                {t.count.toLocaleString()}×
              </span>
              <span>{t.reason}</span>
            </li>
          ))}
        </ul>
      )}
      {excluded.length > 0 && (
        <p className="small muted" style={{ marginTop: 10 }}>
          Excluded before the search: {excluded.map((x) => `${x.name} (${x.reason})`).join('; ')}.
        </p>
      )}
      <p className="small" style={{ marginTop: 12 }}>
        Widen the arrival window, relax the safety profile or allow another hull or fuel in{' '}
        <a href="#/routes" onClick={(e) => { if (onRoutes) { e.preventDefault(); onRoutes() } }}>Routes</a>, then run again.
      </p>
    </div>
  )
}
