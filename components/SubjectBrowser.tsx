"use client"

export function SubjectBrowser() {
  const subjects = [
    { id: "wace", title: "WACE (Western Australia)", exams: ["ATAR", "OP"] },
    { id: "jamb", title: "JAMB (Nigeria)", exams: ["UTME", "Direct Entry"] },
    { id: "neco", title: "NECO (Nigeria)", exams: ["SSCE", "GCE"] },
    { id: "gre", title: "GRE (International)" },
    { id: "sat", title: "SAT (International)" },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
      {subjects.map((subject) => (
        <div
          key={subject.id}
          className="group bg-surface border border-hairline rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer"
        >
          <h3 className="text-xl font-bold mb-2">{subject.title}</h3>
          <p className="text-muted">{subject.exams?.length ?? 0} exam categories</p>
        </div>
      ))}
    </div>
  )
}