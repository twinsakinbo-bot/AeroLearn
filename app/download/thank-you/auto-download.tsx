"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Download } from "lucide-react"

import { getRelease } from "../releases"

/**
 * Kicks off the download for the requested version. The version is resolved
 * against the release list rather than read as a URL, so a crafted link cannot
 * make this page serve an arbitrary file.
 */
export function AutoDownload() {
  const params = useSearchParams()
  const release = getRelease(params.get("v"))
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      const link = document.createElement("a")
      link.href = release.url
      // Google Drive interposes a scan page, so this has to be a new tab.
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setStarted(true)
    }, 1200)

    return () => clearTimeout(timer)
  }, [release.url])

  return (
    <>
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl border border-hairline bg-surface-sunken text-accent">
        <Download className="h-7 w-7" aria-hidden="true" />
      </span>

      <h1 className="mt-7 text-h1 text-foreground sm:text-display">
        {started ? "Your download has started" : "Starting your download…"}
      </h1>
      <p className="mt-4 text-body-lg text-muted" role="status">
        AeroLearn {release.version} for Windows · {release.size}. If nothing happens,{" "}
        <a
          href={release.url}
          target="_blank"
          rel="noopener noreferrer"
          className="link-inline"
        >
          download it directly
        </a>
        .
      </p>
    </>
  )
}
