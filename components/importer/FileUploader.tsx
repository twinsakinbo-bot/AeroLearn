/**
 * FileUploader — the drop zone for a question file.
 *
 * Fixed here: it accepted a second file while the first was still being parsed,
 * so two parses raced and whichever finished last won; the whole component was
 * hardcoded `border-gray-300` / `bg-blue-50` / `text-gray-400`, which renders as
 * a white panel on the dark admin background; and `acceptedTypes` was a prop that
 * did nothing — the `accept` attribute was a fixed string regardless.
 */
"use client"

import { useCallback, useId, useState } from "react"
import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react"

import { cn } from "@/lib/utils"

export type SupportedFileType = "csv" | "xlsx" | "json" | "docx" | "pdf"

const EXTENSIONS: Record<SupportedFileType, string> = {
  csv: ".csv",
  xlsx: ".xlsx,.xls,.xlsb",
  json: ".json",
  docx: ".docx,.doc",
  pdf: ".pdf",
}

const ALL: SupportedFileType[] = ["csv", "xlsx", "json", "docx", "pdf"]

export interface FileUploaderProps {
  onFileSelected: (file: File) => void
  acceptedTypes?: SupportedFileType[]
  /** Blocks a second drop while the first file is still being read. */
  disabled?: boolean
  /** Refused above this, before anything is read. */
  maxBytes?: number
}

export function FileUploader({
  onFileSelected,
  acceptedTypes,
  disabled = false,
  maxBytes = 10 * 1024 * 1024,
}: FileUploaderProps) {
  const inputId = useId()
  const [dragging, setDragging] = useState(false)
  const [refused, setRefused] = useState("")

  const types = acceptedTypes?.length ? acceptedTypes : ALL
  const accept = types.map((type) => EXTENSIONS[type]).join(",")

  const take = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (file.size > maxBytes) {
        setRefused(
          `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Split it into files under ${Math.round(maxBytes / 1024 / 1024)}MB.`,
        )
        return
      }
      setRefused("")
      onFileSelected(file)
    },
    [maxBytes, onFileSelected],
  )

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!disabled) take(event.dataTransfer.files[0])
        }}
        className={cn(
          "flex flex-col items-center rounded-2xl border-2 border-dashed p-8 text-center transition sm:p-12",
          disabled
            ? "cursor-not-allowed border-hairline opacity-60"
            : "cursor-pointer border-hairline hover:border-accent/50",
          dragging && "border-accent bg-accent/[0.06]",
        )}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
          {disabled ? (
            <Loader2 size={24} className="animate-spin" aria-hidden="true" />
          ) : dragging ? (
            <FileSpreadsheet size={24} aria-hidden="true" />
          ) : (
            <UploadCloud size={24} aria-hidden="true" />
          )}
        </span>

        <span className="mt-4 text-h4 font-semibold text-foreground">
          {disabled ? "Reading the file…" : dragging ? "Drop it" : "Drag a file here"}
        </span>
        <span className="mt-2 text-body-sm text-muted">
          or <span className="font-semibold text-accent underline">choose one</span>
        </span>
        <span className="mt-3 text-caption text-subtle">
          {types.map((type) => type.toUpperCase()).join(" · ")} — up to{" "}
          {Math.round(maxBytes / 1024 / 1024)}MB
        </span>

        <input
          id={inputId}
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0]
            /* Cleared so choosing the same file twice fires a change event. */
            event.target.value = ""
            take(file)
          }}
          className="sr-only"
        />
      </label>

      {refused && (
        <p role="alert" className="field-error mt-3">
          {refused}
        </p>
      )}
    </div>
  )
}
