const fs = require('fs');

const classLevels = ["JSS 1", "JSS 2", "JSS 3", "SS 1", "SS 2", "SS 3"];
const terms = ["Beginner", "Intermediate", "Advanced"];

const curriculum = {
  "Mathematics": {
    "JSS 1": ["Number Bases", "Fractions and Decimals", "Basic Algebra"],
    "JSS 2": ["Geometry", "Simple Equations", "Statistics"],
    "JSS 3": ["Trigonometry Basics", "Simultaneous Equations", "Probability"],
    "SS 1": ["Quadratic Equations", "Set Theory", "Indices and Logarithms"],
    "SS 2": ["Sequence and Series", "Calculus Basics", "Circle Geometry"],
    "SS 3": ["Matrices and Determinants", "Advanced Calculus", "Vectors"]
  },
  "English Language": {
    "JSS 1": ["Parts of Speech", "Basic Punctuation", "Reading Comprehension"],
    "JSS 2": ["Tenses", "Direct and Indirect Speech", "Essay Writing"],
    "JSS 3": ["Figures of Speech", "Summary Writing", "Oral English"],
    "SS 1": ["Advanced Comprehension", "Phrases and Clauses", "Letter Writing"],
    "SS 2": ["Lexis and Structure", "Phonetics", "Argumentative Essays"],
    "SS 3": ["WAEC/JAMB Prep", "Complex Sentences", "Report Writing"]
  },
  "Physics": {
    "SS 1": ["Measurement and Units", "Motion", "Work, Energy, and Power"],
    "SS 2": ["Heat Energy", "Waves and Optics", "Electric Fields"],
    "SS 3": ["Electromagnetic Induction", "Atomic Physics", "Radioactivity"]
  },
  "Chemistry": {
    "SS 1": ["Particulate Nature of Matter", "Chemical Equations", "Acids, Bases, and Salts"],
    "SS 2": ["Periodic Table", "Chemical Kinetics", "Electrolysis"],
    "SS 3": ["Organic Chemistry", "Metals and their Compounds", "Nuclear Chemistry"]
  },
  "Biology": {
    "SS 1": ["Living Organisms", "Cell Structure", "Nutrition in Animals"],
    "SS 2": ["Transport System", "Respiratory System", "Reproductive System"],
    "SS 3": ["Genetics", "Evolution", "Ecology"]
  }
};

const lessons = [];

for (const [subject, classes] of Object.entries(curriculum)) {
  for (const [classLevel, topics] of Object.entries(classes)) {
    topics.forEach((topic, idx) => {
      const term = terms[idx]; // Map 3 topics to 3 terms
      
      lessons.push({
        subject,
        classLevel,
        term,
        topicTitle: topic,
        content: `## ${topic}\n\nThis is a comprehensive overview of ${topic} for ${classLevel} students. In this term, we will cover the foundational principles, formulas, and real-world applications of this subject.\n\n### Key Concepts\n* Understanding the core definitions.\n* Applying concepts to solve standard problems.\n* Reviewing past WAEC and JAMB questions related to ${topic}.`,
        examples: [
          {
            title: `Basic Application of ${topic}`,
            content: `**Question:** Explain the primary concept of ${topic}.\n\n**Solution:** The primary concept involves understanding the basic rules and applying them systematically.`
          }
        ],
        homework: [
          {
            exam: "Practice",
            year: 2026,
            subject,
            question: `Which of the following best describes the core principle of ${topic}?`,
            options: {
              A: "It is a fundamental concept in this subject.",
              B: "It is rarely used in real life.",
              C: "It only applies to advanced studies.",
              D: "None of the above."
            },
            correctAnswer: "A",
            explanation: `The core principle of ${topic} is fundamental to mastering ${subject}.`
          }
        ]
      });
    });
  }
}

fs.writeFileSync('all_subjects_curriculum.json', JSON.stringify(lessons, null, 2));
console.log(`Successfully generated ${lessons.length} lessons into all_subjects_curriculum.json`);
