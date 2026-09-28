export type Post = {
  slug: string
  title: string
  category: string
  date: string
  /** ISO for <time datetime>. */
  isoDate: string
  readingTime: string
  excerpt: string
  /** Paragraphs and subheadings, rendered in order. `h2` keys become headings. */
  body: ({ h2: string } | { p: string } | { ul: string[] })[]
}

export const POSTS: Post[] = [
  {
    slug: "ace-jamb-mathematics-in-30-days",
    title: "How to cover JAMB Mathematics in 30 days",
    category: "Study tips",
    date: "15 August 2026",
    isoDate: "2026-08-15",
    readingTime: "4 min read",
    excerpt:
      "A month is enough time to cover the JAMB Maths syllabus properly — but only if you stop reading and start answering.",
    body: [
      {
        p: "Thirty days is enough for JAMB Mathematics. It is not enough to read a textbook cover to cover, and that is the mistake most candidates make: they spend three weeks reading and one week panicking. Reverse it.",
      },
      { h2: "Week 1 — find out what you don't know" },
      {
        p: "Sit a full past paper under timed conditions before you revise anything. It will feel bad. It is also the single most useful hour you will spend, because it converts a vague syllabus into a ranked list of your actual weak topics.",
      },
      {
        p: "Mark it honestly. Group every wrong answer by topic, not by question number. Three wrong answers in Indices is one problem, not three.",
      },
      { h2: "Weeks 2 and 3 — one topic at a time, then prove it" },
      {
        p: "Work down your ranked list. For each topic: read the notes once, then answer twenty past questions on that topic alone. Do not move on because you finished reading — move on because you got the questions right.",
      },
      {
        p: "The topics that reward this most in JAMB Maths are consistently:",
      },
      {
        ul: [
          "Indices, logarithms and surds — pure marks, pure technique",
          "Sequences and series — a handful of formulas, asked almost every year",
          "Statistics: mean, median, mode and standard deviation from grouped data",
          "Differentiation and simple integration — rate-of-change and area questions",
          "Geometry: circle theorems and trigonometric ratios",
        ],
      },
      { h2: "Week 4 — full papers only" },
      {
        p: "Stop studying topics. Sit one complete paper a day at the same time of day as your real exam, in the same layout. You are no longer learning mathematics; you are training pace and nerve.",
      },
      {
        p: "After each paper, spend twice as long reviewing it as you spent sitting it. Anything you got right by guessing counts as wrong — go back and learn why the answer is what it is.",
      },
      { h2: "The part everyone skips" },
      {
        p: "Write down the marks you lost to careless slips rather than ignorance — misread signs, wrong units, an answer transferred to the wrong row. In most mock papers that number is between six and twelve marks. It is the cheapest improvement available to you, and no amount of extra reading will find it for you.",
      },
    ],
  },
  {
    slug: "introducing-progress-analytics",
    title: "Introducing weak-topic analytics",
    category: "Product update",
    date: "2 August 2026",
    isoDate: "2026-08-02",
    readingTime: "3 min read",
    excerpt:
      "A score out of forty tells you nothing about what to do next. Here's what we built instead.",
    body: [
      {
        p: "Until now, finishing a practice set in AeroLearn gave you a score. A score is a verdict, not a plan. From this week, every answer you submit also updates a picture of where your marks are actually going.",
      },
      { h2: "What it looks at" },
      {
        p: "Each question in our library is tagged to a syllabus topic and a difficulty band. When you answer, we record the topic, whether you got it right, and how long you took. Three signals come out of that:",
      },
      {
        ul: [
          "Accuracy by topic — where you are losing marks, ranked",
          "Speed by topic — the topics you get right but cannot afford, at exam pace",
          "Decay — topics you had cold two weeks ago and have not touched since",
        ],
      },
      { h2: "Why speed is in there" },
      {
        p: "A topic you answer correctly in three minutes is not a topic you have mastered, because you do not get three minutes. Separating slow-but-right from fast-and-right changes what you should revise, and it is the signal students most often miss when marking their own work.",
      },
      { h2: "What it does not do" },
      {
        p: "It does not predict your grade. Nobody can, and a fake prediction would only teach you to distrust the rest of the app. It tells you which topic to open next, which is the only question a revision tool actually needs to answer.",
      },
      {
        p: "Weak-topic insights are part of Pro. Basic still shows overall progress and streaks.",
      },
    ],
  },
  {
    slug: "cbt-in-nigerian-schools",
    title: "What computer-based testing changed, and what it didn't",
    category: "EdTech",
    date: "28 July 2026",
    isoDate: "2026-07-28",
    readingTime: "4 min read",
    excerpt:
      "JAMB has been fully computer-based for a decade. The lesson for students is smaller and more practical than the headlines suggest.",
    body: [
      {
        p: "The move to computer-based testing was reported as a technology story. For a candidate sitting the exam, almost none of the interesting consequences are technological.",
      },
      { h2: "What genuinely changed" },
      {
        ul: [
          "You cannot flip through the whole paper at a glance, so you cannot triage questions the way you could on paper.",
          "You cannot annotate the question. Working goes on rough paper, and transferring an answer is now a separate step where marks get lost.",
          "The clock is on screen and does not stop, which affects candidates who used to pace themselves by how much paper was left.",
        ],
      },
      { h2: "What did not change" },
      {
        p: "The syllabus. The question styles. The fact that past papers are the most accurate practice material in existence. Every one of those was true in 1998 and is true now.",
      },
      { h2: "The practical lesson" },
      {
        p: "Practise in the format you will sit. Not because the interface is difficult, but because the small mechanical differences — navigating between questions, deciding when to flag one and move on, keeping rough work organised — are skills, and they are cheap to acquire in advance and expensive to acquire on the day.",
      },
      {
        p: "That is the entire reason AeroLearn's practice mode looks like a CBT screen rather than a quiz app. It is not decoration. It is the part of exam preparation that paper past questions cannot give you.",
      },
      { h2: "For schools" },
      {
        p: "The gap we see most often is not hardware, it is exposure. A student who has used a mouse to answer forty timed multiple-choice questions ten times behaves very differently from one doing it for the first time in a hall. Any school with a single functioning computer lab can close most of that gap in a term.",
      },
    ],
  },
]

export function getPost(slug: string) {
  return POSTS.find((post) => post.slug === slug)
}
