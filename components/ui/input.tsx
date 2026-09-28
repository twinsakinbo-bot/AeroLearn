"use client"

import { forwardRef, useId } from "react"
import { AlertCircle } from "lucide-react"

import { cn } from "@/lib/utils"

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string
  hint?: string
  /** When set, the field is marked invalid and this message is announced. */
  error?: string
  /** Legacy alias for `error`. */
  errorMessage?: string
  labelClassName?: string
  containerClassName?: string
  /** Rendered inside the field, before the text. */
  leadingIcon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    hint,
    error,
    errorMessage,
    className,
    labelClassName,
    containerClassName,
    leadingIcon,
    type = "text",
    ...props
  },
  ref,
) {
  // The old implementation hardcoded id="input", so every field on a page
  // shared one id and no label pointed at its own input.
  const autoId = useId()
  const inputId = id ?? autoId
  const message = error ?? errorMessage
  const describedBy = [hint && `${inputId}-hint`, message && `${inputId}-error`]
    .filter(Boolean)
    .join(" ")

  return (
    <div className={cn("w-full", containerClassName)}>
      {label && (
        <label htmlFor={inputId} className={cn("field-label", labelClassName)}>
          {label}
        </label>
      )}

      <div className="relative">
        {leadingIcon && (
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
            aria-hidden="true"
          >
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn("input-premium", leadingIcon && "pl-10", className)}
          {...props}
        />
      </div>

      {hint && !message && (
        <p id={`${inputId}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {message && (
        <p id={`${inputId}-error`} className="field-error" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {message}
        </p>
      )}
    </div>
  )
})
