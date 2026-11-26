import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { LearningMarkdown } from "../components/learn/LearningMarkdown"
import { normalizeMathDelimiters } from "../lib/learning-markdown"

const render = (children: string) => renderToStaticMarkup(createElement(LearningMarkdown, { children }))

test("lesson sequences render as accessible maths and a real comparison table", () => {
  const html = render(String.raw`A sequence starts at \(4\).

\[4,\,7,\,10,\,13,\ldots\]

| Type | Example |
| --- | --- |
| A.P. | \(5,9,13,17,\ldots\) |
| G.P. | \(3,6,12,24,\ldots\) |

\[d=T_2-T_1=T_3-T_2.\]`)
  assert.equal((html.match(/<math /g) || []).length, 5)
  assert.match(html, /class="katex-display"/)
  assert.match(html, /<msub>/)
  assert.match(html, /<table><thead><tr><th>Type<\/th>/)
  assert.match(html, /<td>A.P.<\/td>/)
  assert.match(html, /aria-label="Lesson table" tabindex="0"/)
})

test("existing dollar maths, links, prose and code samples stay intact", () => {
  const input = String.raw`Use $x^2$ and (ordinary parentheses). [Read more](https://example.com).

$$
x+1
$$

` + '`\\(literal\\)`' + '\n\n```tex\n\\[literal\\]\n```\n\n~~~tex\n\\(literal\\)\n~~~\n'
  assert.equal(normalizeMathDelimiters(input), input)
  const html = render(input)
  assert.equal((html.match(/<math /g) || []).length, 2)
  assert.match(html, /href="https:\/\/example.com"/)
  assert.match(html, /ordinary parentheses/)
})

test("lesson HTML and unsafe maths links cannot inject active markup", () => {
  const html = render(String.raw`<script>alert(1)</script>

[bad](javascript:alert%281%29)

\(\href{javascript:alert(1)}{click}\)`)
  assert.doesNotMatch(html, /<script|href="javascript:|onclick=/)
})
