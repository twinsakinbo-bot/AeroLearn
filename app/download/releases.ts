/**
 * Desktop release list. Shared by /download and /download/thank-you so the
 * thank-you page can resolve a download by version id instead of accepting an
 * arbitrary URL from the query string.
 */
export type Release = {
  version: string
  date: string
  size: string
  notes: string
  url: string
}

export const RELEASES: Release[] = [
  {
    version: "1.0.2",
    date: "August 2026",
    size: "2.2 MB",
    notes: "Latest release. Faster start-up and a batch of bug fixes.",
    url: "https://drive.google.com/file/d/1_JWqNw7MitNHzgTIH1L-8P2nWGYtSDSo/view?usp=sharing",
  },
  {
    version: "1.0.1",
    date: "August 2026",
    size: "101 MB",
    notes: "First stable release.",
    url: "https://drive.google.com/uc?export=download&id=1irSw6-h5XkJBDzGyJelKV7yZwJ2Y20bj",
  },
]

export const LATEST = RELEASES[0]

/**
 * Resolves a `?v=` query value to a known release. Returns the latest release
 * for anything unrecognised — the download page must never follow a URL that
 * came from the query string, or the page becomes an open redirect that serves
 * arbitrary files under the AeroLearn domain.
 */
export function getRelease(version: string | null | undefined): Release {
  if (!version) return LATEST
  return RELEASES.find((release) => release.version === version) ?? LATEST
}
