import { SiteFooter } from "./site-footer"
import { SiteHeader } from "./site-header"

/**
 * Chrome for every public page. Wrap page content in this rather than
 * re-declaring a header per page — the old pages each had their own
 * "logo + Back to Home" bar, which is why none of them matched.
 *
 * `id="main"` is the target of the skip link in app/layout.tsx.
 */
export function MarketingShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className={className}>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
