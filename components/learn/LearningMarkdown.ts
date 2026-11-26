import { createElement, memo } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import { normalizeMathDelimiters } from "../../lib/learning-markdown"

const remarkPlugins = [remarkGfm, remarkMath]
const rehypePlugins = [rehypeKatex]

const components: Components = {
  table: ({ children }) => createElement("div", {
    className: "overflow-x-auto",
    role: "region",
    "aria-label": "Lesson table",
    tabIndex: 0,
  }, createElement("table", null, children)),
}

/** Shared lesson/note renderer. Raw HTML remains disabled and KaTeX is untrusted. */
export const LearningMarkdown = memo(function LearningMarkdown({ children }: { children: string }) {
  return createElement("div", { className: "learning-markdown min-w-0" },
    createElement(ReactMarkdown, {
      remarkPlugins,
      rehypePlugins,
      components,
    }, normalizeMathDelimiters(children)),
  )
})
