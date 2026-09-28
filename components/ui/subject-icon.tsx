import {
  Calculator,
  MessageCircle,
  Dna,
  FlaskConical,
  Atom,
  TrendingUp,
  Landmark,
  Globe,
  BookOpen,
  Scale,
  Monitor,
  FunctionSquare,
  Sprout,
  Receipt,
  Briefcase,
  Book,
} from "lucide-react"

interface SubjectIconProps {
  subject: string
  className?: string
}

export function SubjectIcon({ subject, className = "w-6 h-6" }: SubjectIconProps) {
  switch (subject.toLowerCase()) {
    case "mathematics":
      return <Calculator className={className} />
    case "english language":
      return <MessageCircle className={className} />
    case "biology":
      return <Dna className={className} />
    case "chemistry":
      return <FlaskConical className={className} />
    case "physics":
      return <Atom className={className} />
    case "economics":
      return <TrendingUp className={className} />
    case "government":
      return <Landmark className={className} />
    case "geography":
      return <Globe className={className} />
    case "literature":
      return <BookOpen className={className} />
    case "civic education":
      return <Scale className={className} />
    case "computer science":
      return <Monitor className={className} />
    case "further mathematics":
      return <FunctionSquare className={className} />
    case "agricultural science":
      return <Sprout className={className} />
    case "accounting":
      return <Receipt className={className} />
    case "commerce":
      return <Briefcase className={className} />
    default:
      return <Book className={className} /> // Fallback icon
  }
}
