import { useId } from 'react'

import { classNames } from '../utils/format.js'

/** Contrôle de formulaire étiqueté, avec aide et message d'erreur. */
export function Field({ label, hint, error, required = false, children, className, htmlFor }) {
  return (
    <div className={classNames('flex flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
        >
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : (
        hint && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>
      )}
    </div>
  )
}

const CONTROL =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100 dark:placeholder:text-slate-500'

export function Input({ label, hint, error, required, className, id, ...props }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={className}>
      <input id={inputId} className={CONTROL} {...props} />
    </Field>
  )
}

export function Select({ label, hint, error, required, className, id, children, ...props }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={className}>
      <select id={inputId} className={classNames(CONTROL, 'cursor-pointer')} {...props}>
        {children}
      </select>
    </Field>
  )
}

export function Textarea({ label, hint, error, required, className, id, ...props }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={className}>
      <textarea id={inputId} className={classNames(CONTROL, 'resize-y')} {...props} />
    </Field>
  )
}
