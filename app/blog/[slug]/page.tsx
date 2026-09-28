import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, Calendar } from "lucide-react"

import { MarketingShell } from "@/components/marketing/marketing-shell"
import { Container } from "@/components/ui/container"

import { POSTS, getPost } from "../posts"

type Params = { params: { slug: string } }

export function generateStaticParams() {
  return POSTS.map((post) => ({ slug: post.slug }))
}

export function generateMetadata({ params }: Params): Metadata {
  const post = getPost(params.slug)
  if (!post) return { title: "Post not found" }

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.isoDate,
      url: `/blog/${post.slug}`,
    },
  }
}

export default function BlogPostPage({ params }: Params) {
  const post = getPost(params.slug)
  if (!post) notFound()

  const others = POSTS.filter((item) => item.slug !== post.slug).slice(0, 2)

  return (
    <MarketingShell>
      <article className="section">
        <Container narrow>
          <Link href="/blog" className="link-quiet inline-flex items-center gap-2 text-body-sm">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All posts
          </Link>

          <header className="mt-8">
            <div className="flex flex-wrap items-center gap-3">
              <span className="badge-accent">{post.category}</span>
              <span className="text-caption text-muted">{post.readingTime}</span>
            </div>
            <h1 className="mt-5 text-h1 sm:text-display">{post.title}</h1>
            <p className="mt-4 text-body-lg text-muted">{post.excerpt}</p>
            <p className="mt-6 flex items-center gap-2 border-t border-hairline pt-6 text-caption text-muted">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              <time dateTime={post.isoDate}>{post.date}</time>
            </p>
          </header>

          <div className="prose-legal mt-10">
            {post.body.map((block, i) => {
              if ("h2" in block) return <h2 key={i}>{block.h2}</h2>
              if ("ul" in block)
                return (
                  <ul key={i}>
                    {block.ul.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )
              return <p key={i}>{block.p}</p>
            })}
          </div>

          <div className="card-invert mt-14 p-7 sm:p-8">
            <h2 className="text-h3 text-white">Put this into practice</h2>
            <p className="mt-2.5 max-w-lg text-body-sm text-ink-300">
              AeroLearn has the lessons, the past questions and the timed mocks in one place. Start
              free — no card, no time limit.
            </p>
            <Link
              href="/auth/signup"
              className="btn mt-6 bg-accent-400 text-ink-950 hover:bg-accent-300"
            >
              Start learning free
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {others.length > 0 && (
            <section className="mt-14 border-t border-hairline pt-10">
              <h2 className="text-h3 text-foreground">Read next</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                {others.map((item) => (
                  <Link key={item.slug} href={`/blog/${item.slug}`} className="card-interactive p-6">
                    <span className="badge-neutral">{item.category}</span>
                    <h3 className="mt-3 text-h4 text-foreground">{item.title}</h3>
                    <p className="mt-2 text-body-sm text-muted">{item.excerpt}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </Container>
      </article>
    </MarketingShell>
  )
}
