export type Subject =
  | "Mathematics"
  | "English"
  | "Physics"
  | "Chemistry"
  | "Biology"
  | "Literature"
  | "Government"
  | "Economics"

export type Lesson = {
  id: string
  subject: Subject
  title: string
  description: string
  duration: string
  color: SubjectColor
  topics: string[]
  reading: string
}

export type SubjectColor = "violet" | "orange" | "blue" | "green" | "rose" | "amber" | "cyan" | "teal"

export type Question = {
  id: string
  subject: Subject
  topic: string
  prompt: string
  options: string[]
  answerIndex: number
  explanation: string
}

export type StoreItem = {
  id: string
  name: string
  description: string
  cost: number
  kind: "avatar-frame" | "theme" | "sticker" | "boost"
  swatch: string
}

export type Classmate = {
  id: string
  name: string
  classLevel: string
  points: number
  badge: string
}

export type ChallengeSeed = {
  id: string
  title: string
  description: string
  reward: number
  cadence: "daily" | "weekly" | "one-time"
  action: string
}

export type CommunityThreadSeed = {
  id: string
  title: string
  author: string
  subject: Subject
  excerpt: string
  replies: { author: string; body: string }[]
}

export type MessageThreadSeed = {
  id: string
  with: string
  role: string
  color: SubjectColor
  messages: { from: "them" | "you"; text: string }[]
}

export const subjectColor: Record<Subject, SubjectColor> = {
  Mathematics: "violet",
  English: "orange",
  Physics: "blue",
  Chemistry: "rose",
  Biology: "green",
  Literature: "amber",
  Government: "teal",
  Economics: "cyan",
}

export const lessons: Lesson[] = [
  {
    id: "math-algebra",
    subject: "Mathematics",
    title: "Algebra foundations",
    description: "Expressions, equations and the patterns behind them.",
    duration: "18 min",
    color: "violet",
    topics: ["Variables", "Linear equations", "Word problems"],
    reading:
      "Algebra is the language of relationships. A variable is a placeholder for an unknown, and equations describe balance. When you solve for x, you are asking: what value makes both sides agree? Start by isolating the variable — move everything else to the opposite side, and remember that whatever you do to one side you must do to the other.",
  },
  {
    id: "math-quadratics",
    subject: "Mathematics",
    title: "Quadratic equations",
    description: "Factor, complete the square, and use the quadratic formula.",
    duration: "24 min",
    color: "violet",
    topics: ["Factoring", "Completing the square", "The formula"],
    reading:
      "A quadratic equation has the form ax² + bx + c = 0. There are three main tools: factor it into two brackets, complete the square by rewriting it as (x + p)² = q, or reach for the quadratic formula when nothing else fits. The discriminant b² − 4ac tells you how many real solutions to expect.",
  },
  {
    id: "english-reading",
    subject: "English",
    title: "Reading for meaning",
    description: "Find the main idea and make stronger inferences.",
    duration: "15 min",
    color: "orange",
    topics: ["Main idea", "Inference", "Tone"],
    reading:
      "Strong reading is active reading. As you move through a passage, mark the sentences that carry the most weight — usually the first or last of each paragraph. Ask yourself: what is the author really claiming? Inference is what the text implies without saying. Tone is the mood — is the writer amused, urgent, cautious?",
  },
  {
    id: "english-essay",
    subject: "English",
    title: "Writing a clear essay",
    description: "Structure a five-paragraph essay that argues something.",
    duration: "20 min",
    color: "orange",
    topics: ["Thesis", "Body paragraphs", "Conclusion"],
    reading:
      "Every essay is an argument. Open with a thesis — a single sentence that states your claim. Give each body paragraph one supporting idea, backed by evidence and a short explanation of why the evidence matters. Close by restating your claim in fresher language and pointing forward to a larger implication.",
  },
  {
    id: "physics-motion",
    subject: "Physics",
    title: "Motion and speed",
    description: "Understand how objects move and how we measure it.",
    duration: "22 min",
    color: "blue",
    topics: ["Distance", "Speed", "Acceleration"],
    reading:
      "Motion is a change in position over time. Speed is distance divided by time; velocity adds direction. Acceleration is the rate at which velocity changes. Draw a distance–time graph and the slope is speed. Draw a velocity–time graph and the slope is acceleration; the area underneath is distance travelled.",
  },
  {
    id: "physics-forces",
    subject: "Physics",
    title: "Forces and Newton's laws",
    description: "The three laws that quietly govern everything.",
    duration: "25 min",
    color: "blue",
    topics: ["Inertia", "F = ma", "Action and reaction"],
    reading:
      "Newton's first law: things keep doing what they are doing until a force disturbs them. Second: force equals mass times acceleration. Third: every action has an equal and opposite reaction. Together, these three sentences describe everything from a rolling ball to a rocket launch.",
  },
  {
    id: "chem-atoms",
    subject: "Chemistry",
    title: "Atoms and elements",
    description: "The building blocks of matter and the periodic table.",
    duration: "19 min",
    color: "rose",
    topics: ["Protons", "Electrons", "Groups"],
    reading:
      "An atom is a tiny piece of matter with a nucleus of protons and neutrons, and electrons orbiting in shells. The number of protons is what makes an element what it is. The periodic table groups elements by shared behaviour: alkali metals, halogens, noble gases. Reactivity often follows electron structure.",
  },
  {
    id: "chem-reactions",
    subject: "Chemistry",
    title: "Chemical reactions",
    description: "Balance equations and predict what happens.",
    duration: "21 min",
    color: "rose",
    topics: ["Reactants", "Products", "Balancing"],
    reading:
      "A chemical reaction rearranges atoms; nothing is created or destroyed. That is why we balance equations — the same number of each atom must appear on both sides. Reactions come in families: combination, decomposition, displacement, combustion. Recognising the family helps you predict the product.",
  },
  {
    id: "bio-cells",
    subject: "Biology",
    title: "The living cell",
    description: "Explore the building block of every living thing.",
    duration: "20 min",
    color: "green",
    topics: ["Membrane", "Nucleus", "Organelles"],
    reading:
      "Cells are tiny factories. The membrane decides what gets in and out. The nucleus stores the instructions. Mitochondria release energy. Ribosomes build proteins. Plant cells add a rigid wall and chloroplasts for photosynthesis. Understanding the parts is the first step to understanding how life works.",
  },
  {
    id: "bio-ecosystems",
    subject: "Biology",
    title: "Ecosystems and food webs",
    description: "How energy and nutrients move through nature.",
    duration: "17 min",
    color: "green",
    topics: ["Producers", "Consumers", "Decomposers"],
    reading:
      "An ecosystem is a community of living things and their environment. Producers, usually plants, capture sunlight. Consumers eat producers or other consumers. Decomposers return nutrients to the soil. A food web shows who eats whom — remove one strand and the whole web feels it.",
  },
  {
    id: "lit-poetry",
    subject: "Literature",
    title: "Reading poetry",
    description: "Rhythm, image, and how a short poem does so much.",
    duration: "16 min",
    color: "amber",
    topics: ["Imagery", "Meter", "Voice"],
    reading:
      "A poem is a small machine made of language. Read it out loud first. Notice which words are heavy and which are light — that is meter. Notice which images repeat — those are the poem's centre of gravity. The voice is the personality behind the words; sometimes it is the poet, sometimes a character.",
  },
  {
    id: "gov-democracy",
    subject: "Government",
    title: "Democracy and citizenship",
    description: "How power is shared, and what the citizen owes back.",
    duration: "18 min",
    color: "teal",
    topics: ["Rights", "Duties", "Elections"],
    reading:
      "Democracy is the arrangement where power flows from the people. It is protected by rules — a constitution, an independent court, a free press. Citizens have rights but also duties: to vote, to obey just laws, to speak up. The health of a democracy is measured by how well it protects the people who disagree with it.",
  },
  {
    id: "econ-markets",
    subject: "Economics",
    title: "How markets work",
    description: "Supply, demand, and the price signal.",
    duration: "20 min",
    color: "cyan",
    topics: ["Supply", "Demand", "Equilibrium"],
    reading:
      "A market is where buyers and sellers meet. When many people want a thing and there is little of it, the price rises. When there is a lot of it and few buyers, the price falls. That single number — the price — carries information about scarcity, taste, cost and hope, all at once.",
  },
]

export const questions: Question[] = [
  {
    id: "q-math-1",
    subject: "Mathematics",
    topic: "Linear equations",
    prompt: "Solve for x: 3x + 5 = 20",
    options: ["3", "5", "6", "8"],
    answerIndex: 1,
    explanation: "Subtract 5 from both sides to get 3x = 15, then divide by 3.",
  },
  {
    id: "q-math-2",
    subject: "Mathematics",
    topic: "Quadratics",
    prompt: "What are the roots of x² − 5x + 6 = 0?",
    options: ["1 and 6", "2 and 3", "−2 and −3", "0 and 5"],
    answerIndex: 1,
    explanation: "Factor as (x − 2)(x − 3). The roots are the values that make each bracket zero.",
  },
  {
    id: "q-math-3",
    subject: "Mathematics",
    topic: "Word problems",
    prompt: "A pen costs ₦120 and a book ₦450. What do 2 pens and 3 books cost?",
    options: ["₦1,410", "₦1,590", "₦1,650", "₦1,710"],
    answerIndex: 1,
    explanation: "2 × 120 = 240; 3 × 450 = 1,350; total is 1,590.",
  },
  {
    id: "q-eng-1",
    subject: "English",
    topic: "Main idea",
    prompt: "Which sentence usually carries the main idea of a paragraph?",
    options: ["The last", "The middle", "The first or last", "Any question sentence"],
    answerIndex: 2,
    explanation: "Most paragraphs open or close with the sentence that states the point.",
  },
  {
    id: "q-eng-2",
    subject: "English",
    topic: "Tone",
    prompt: "'The rain fell softly, as if apologising.' The tone is best described as:",
    options: ["Cheerful", "Gentle", "Angry", "Formal"],
    answerIndex: 1,
    explanation: "'Softly' and 'apologising' both signal a gentle, hushed mood.",
  },
  {
    id: "q-phys-1",
    subject: "Physics",
    topic: "Speed",
    prompt: "A car travels 120 km in 2 hours. What is its average speed?",
    options: ["40 km/h", "60 km/h", "80 km/h", "120 km/h"],
    answerIndex: 1,
    explanation: "Average speed is distance divided by time: 120 ÷ 2 = 60 km/h.",
  },
  {
    id: "q-phys-2",
    subject: "Physics",
    topic: "Newton's laws",
    prompt: "Newton's third law is best summarised as:",
    options: [
      "Force equals mass times acceleration",
      "Things stay in motion unless disturbed",
      "For every action there is an equal and opposite reaction",
      "Energy is always conserved",
    ],
    answerIndex: 2,
    explanation: "The third law is the action-reaction pair.",
  },
  {
    id: "q-chem-1",
    subject: "Chemistry",
    topic: "Atoms",
    prompt: "The number of ___ decides which element an atom is.",
    options: ["Neutrons", "Electrons", "Protons", "Isotopes"],
    answerIndex: 2,
    explanation: "The proton count (atomic number) defines the element.",
  },
  {
    id: "q-chem-2",
    subject: "Chemistry",
    topic: "Reactions",
    prompt: "Balancing an equation reflects which law?",
    options: [
      "Conservation of energy",
      "Conservation of mass",
      "Newton's second law",
      "Avogadro's law",
    ],
    answerIndex: 1,
    explanation: "Atoms are neither created nor destroyed, so both sides must match.",
  },
  {
    id: "q-bio-1",
    subject: "Biology",
    topic: "Cells",
    prompt: "Which organelle releases energy from food?",
    options: ["Nucleus", "Mitochondrion", "Ribosome", "Vacuole"],
    answerIndex: 1,
    explanation: "Mitochondria are the site of cellular respiration.",
  },
  {
    id: "q-bio-2",
    subject: "Biology",
    topic: "Ecosystems",
    prompt: "In a food web, plants are:",
    options: ["Producers", "Primary consumers", "Decomposers", "Predators"],
    answerIndex: 0,
    explanation: "Plants make their own food through photosynthesis; they are producers.",
  },
  {
    id: "q-lit-1",
    subject: "Literature",
    topic: "Imagery",
    prompt: "Imagery in poetry mainly appeals to:",
    options: ["The mind's calculator", "The senses", "The dictionary", "The rhyme scheme"],
    answerIndex: 1,
    explanation: "Imagery uses sensory language to build a picture.",
  },
  {
    id: "q-gov-1",
    subject: "Government",
    topic: "Democracy",
    prompt: "A free press mainly helps a democracy by:",
    options: [
      "Choosing who wins elections",
      "Holding power to account",
      "Writing the constitution",
      "Collecting taxes",
    ],
    answerIndex: 1,
    explanation: "A free press investigates and questions those in power.",
  },
  {
    id: "q-econ-1",
    subject: "Economics",
    topic: "Supply and demand",
    prompt: "If supply falls and demand stays the same, price will:",
    options: ["Rise", "Fall", "Stay the same", "Become negative"],
    answerIndex: 0,
    explanation: "Scarcity raises price when buyers are still willing.",
  },
]

export const storeItems: StoreItem[] = [
  { id: "frame-cyan", name: "Aurora frame", description: "A soft cyan halo around your avatar.", cost: 40, kind: "avatar-frame", swatch: "#54dce1" },
  { id: "frame-violet", name: "Nova frame", description: "A violet ring for your best sessions.", cost: 40, kind: "avatar-frame", swatch: "#9e91ff" },
  { id: "frame-amber", name: "Ember frame", description: "A warm amber trace, hard-earned.", cost: 60, kind: "avatar-frame", swatch: "#ffb66e" },
  { id: "frame-emerald", name: "Grove frame", description: "A deep emerald outline for consistency.", cost: 60, kind: "avatar-frame", swatch: "#7fe1b1" },
  { id: "theme-midnight", name: "Midnight theme", description: "The default AeroLearn dark, refined.", cost: 0, kind: "theme", swatch: "#0b1b2d" },
  { id: "theme-nebula", name: "Nebula theme", description: "Warmer violets across the workspace.", cost: 80, kind: "theme", swatch: "#1c1a3a" },
  { id: "theme-forest", name: "Forest theme", description: "Deep greens for a calmer study session.", cost: 80, kind: "theme", swatch: "#0d2020" },
  { id: "sticker-flame", name: "Flame sticker", description: "Pin it to your best streak.", cost: 15, kind: "sticker", swatch: "#ff9a3d" },
  { id: "sticker-star", name: "Star sticker", description: "A little gold for a big lesson.", cost: 15, kind: "sticker", swatch: "#ffd66c" },
  { id: "boost-focus", name: "Focus boost", description: "Doubles your next 3 practice sessions.", cost: 100, kind: "boost", swatch: "#54dce1" },
]

export const classmates: Classmate[] = [
  { id: "c1", name: "Amara O.", classLevel: "SS 2", points: 1420, badge: "Top scholar" },
  { id: "c2", name: "Kunle A.", classLevel: "SS 2", points: 1180, badge: "Streak keeper" },
  { id: "c3", name: "Ifeoma N.", classLevel: "SS 1", points: 980, badge: "Practice pro" },
  { id: "c4", name: "Musa I.", classLevel: "JSS 3", points: 860, badge: "Quiz champ" },
  { id: "c5", name: "Zara B.", classLevel: "SS 3", points: 810, badge: "Note-taker" },
  { id: "c6", name: "Emeka O.", classLevel: "JSS 3", points: 640, badge: "Rising star" },
  { id: "c7", name: "Nkechi E.", classLevel: "SS 1", points: 520, badge: "Consistent" },
  { id: "c8", name: "Tunde L.", classLevel: "JSS 2", points: 410, badge: "Curious" },
]

export const challenges: ChallengeSeed[] = [
  { id: "ch-daily-1", title: "Warm-up round", description: "Answer 5 practice questions today.", reward: 20, cadence: "daily", action: "practice" },
  { id: "ch-daily-2", title: "One lesson", description: "Finish any lesson from your library.", reward: 30, cadence: "daily", action: "learn" },
  { id: "ch-weekly-1", title: "Full mock exam", description: "Sit a full mock exam this week.", reward: 120, cadence: "weekly", action: "mock-exams" },
  { id: "ch-weekly-2", title: "Streak keeper", description: "Study on 5 different days this week.", reward: 100, cadence: "weekly", action: "overview" },
  { id: "ch-one-1", title: "Essay draft", description: "Submit an essay to the grader.", reward: 60, cadence: "one-time", action: "essay-grader" },
  { id: "ch-one-2", title: "First community post", description: "Ask or answer a question in the community.", reward: 40, cadence: "one-time", action: "community" },
]

export const communitySeed: CommunityThreadSeed[] = [
  {
    id: "t1",
    title: "Best way to remember the periodic table?",
    author: "Amara O.",
    subject: "Chemistry",
    excerpt: "I keep mixing up the halogens and the noble gases. What worked for you?",
    replies: [
      { author: "Kunle A.", body: "I made a little song for each group. Silly, but it stuck." },
      { author: "Ifeoma N.", body: "Flashcards every morning for a week. Then only the ones I got wrong." },
    ],
  },
  {
    id: "t2",
    title: "How do you plan your revision week?",
    author: "Zara B.",
    subject: "English",
    excerpt: "Trying to build a proper timetable for the first time. Any templates?",
    replies: [
      { author: "Musa I.", body: "Two subjects a day, one hour each, and one free evening. That's it." },
    ],
  },
  {
    id: "t3",
    title: "Newton's third law — a clean example?",
    author: "Emeka O.",
    subject: "Physics",
    excerpt: "The textbook example is a rocket, but I need something I can point to at home.",
    replies: [
      { author: "Nkechi E.", body: "Push a wall. You don't move, but your arms feel the wall push back." },
      { author: "Amara O.", body: "Or a swimmer pushing water backwards to move forwards." },
    ],
  },
]

export const messageSeed: MessageThreadSeed[] = [
  {
    id: "m-mentor",
    with: "Study mentor",
    role: "AeroLearn coach",
    color: "cyan",
    messages: [
      { from: "them", text: "Welcome. I'll check in on your goals each week." },
      { from: "them", text: "Reply here whenever you want to talk through a topic." },
    ],
  },
  {
    id: "m-amara",
    with: "Amara O.",
    role: "Study group · SS 2",
    color: "violet",
    messages: [
      { from: "them", text: "Are you sitting the mock on Friday?" },
      { from: "you", text: "Yes! Meet after for review?" },
      { from: "them", text: "Deal. I'll bring my notes." },
    ],
  },
  {
    id: "m-kunle",
    with: "Kunle A.",
    role: "Study group · SS 2",
    color: "orange",
    messages: [
      { from: "them", text: "Have you seen the essay grader?" },
      { from: "you", text: "Not yet — is it good?" },
      { from: "them", text: "It caught two things my teacher missed." },
    ],
  },
]

export const timetableSeed: { day: string; start: string; subject: Subject; note: string }[] = [
  { day: "Mon", start: "16:00", subject: "Mathematics", note: "Algebra practice" },
  { day: "Mon", start: "18:00", subject: "English", note: "Reading comprehension" },
  { day: "Tue", start: "16:30", subject: "Physics", note: "Motion review" },
  { day: "Wed", start: "17:00", subject: "Biology", note: "Cell diagrams" },
  { day: "Thu", start: "16:00", subject: "Chemistry", note: "Balance equations" },
  { day: "Fri", start: "17:30", subject: "Literature", note: "Read one poem" },
  { day: "Sat", start: "10:00", subject: "Mathematics", note: "Mock exam" },
]

export const goalOptions = [
  "Build stronger study habits",
  "Prepare for my exams",
  "Explore new subjects",
  "Beat my last leaderboard rank",
]

export const classLevels = ["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"]

export const dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export const subjectAccent: Record<SubjectColor, string> = {
  violet: "#9e91ff",
  orange: "#ffb17f",
  blue: "#7fc8ff",
  green: "#7fe1b1",
  rose: "#ff92b2",
  amber: "#ffd66c",
  cyan: "#5cdee3",
  teal: "#5cd7c1",
}
