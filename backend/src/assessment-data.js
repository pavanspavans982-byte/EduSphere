export const assessmentCategories = [
  "Mathematics",
  "Science",
  "Computer Science",
  "Programming",
  "English",
  "Digital Literacy",
  "General Knowledge",
  "Skill Development",
];

export const assessmentCatalog = [
  {
    id: "math-foundations-check",
    title: "Mathematics: Number Sense",
    subject: "Mathematics",
    topic: "Arithmetic and fractions",
    description: "A short check of arithmetic, fractions, and proportional reasoning.",
    estimatedMinutes: 8,
    questions: [
      question("math-1", "multiple-choice", "What is 18 + 27?", "addition", "Beginner", ["35", "45", "46", "55"], "45", "Add the tens and ones: 18 + 20 = 38, then 38 + 7 = 45."),
      question("math-2", "true-false", "One quarter is equal to 25%.", "fractions", "Beginner", [], "true", "One quarter is 1 ÷ 4 = 0.25, which is 25%."),
      question("math-3", "fill-blank", "What is 3/4 written as a decimal?", "fractions", "Intermediate", [], "0.75", "Divide 3 by 4 to get 0.75."),
      question("math-4", "short-answer", "A notebook costs 12 units. What is the cost of 5 notebooks?", "multiplication", "Intermediate", [], "60", "Multiply the price by the quantity: 12 × 5 = 60."),
      question("math-5", "short-answer", "A class has 24 students. If 3/8 are absent, how many are present?", "fractions", "Advanced", [], "15", "Three eighths of 24 is 9 absent students. Subtract 9 from 24 to get 15 present."),
    ],
  },
  {
    id: "science-observations-check",
    title: "Science: Matter and Evidence",
    subject: "Science",
    topic: "Matter and scientific reasoning",
    description: "Review states of matter, observations, and evidence-based conclusions.",
    estimatedMinutes: 8,
    questions: [
      question("science-1", "multiple-choice", "Which state of matter has a fixed volume but takes the shape of its container?", "states of matter", "Beginner", ["Solid", "Liquid", "Gas", "Plasma only"], "Liquid", "A liquid keeps a fixed volume while flowing to fit its container."),
      question("science-2", "true-false", "In a fair test, changing one factor at a time can help identify its effect.", "experiments", "Beginner", [], "true", "Controlling other conditions makes it easier to connect a result to the changed factor."),
      question("science-3", "fill-blank", "Water freezes at about ___ degrees Celsius at standard pressure.", "temperature", "Intermediate", [], "0", "At standard pressure, water freezes at approximately 0°C."),
      question("science-4", "short-answer", "Name the process by which liquid water changes into water vapor.", "water cycle", "Intermediate", [], "evaporation", "Evaporation changes liquid water into water vapor."),
      question("science-5", "short-answer", "A plant near a window grows toward the light. Name the stimulus it is responding to.", "observation", "Advanced", [], "light", "The plant is responding to light; growth toward light is called phototropism."),
    ],
  },
  {
    id: "computer-basics-check",
    title: "Computer Science: Computing Basics",
    subject: "Computer Science",
    topic: "Data and algorithms",
    description: "Check foundational ideas about data, instructions, and computer systems.",
    estimatedMinutes: 8,
    questions: [
      question("cs-1", "multiple-choice", "Which part of a computer executes program instructions?", "computer systems", "Beginner", ["CPU", "Keyboard", "Monitor", "Speaker"], "CPU", "The central processing unit (CPU) executes program instructions."),
      question("cs-2", "true-false", "An algorithm is a finite sequence of steps for solving a problem.", "algorithms", "Beginner", [], "true", "An algorithm describes ordered steps that solve a problem and eventually finish."),
      question("cs-3", "fill-blank", "The binary number system uses the digits ___ and 1.", "data representation", "Intermediate", [], "0", "Binary represents values using only 0 and 1."),
      question("cs-4", "short-answer", "What is the name for temporary working memory used by a computer?", "computer systems", "Intermediate", [], "ram", "RAM is temporary working memory; its contents are generally lost when power is removed."),
      question("cs-5", "short-answer", "In an algorithm, what structure repeats instructions while a condition remains true?", "algorithms", "Advanced", [], "loop", "A loop repeats a set of instructions, often while a condition is true."),
    ],
  },
  {
    id: "programming-logic-check",
    title: "Programming: Logic and Code",
    subject: "Programming",
    topic: "Programming fundamentals",
    description: "Practise variables, conditions, and reading small snippets of code.",
    estimatedMinutes: 10,
    questions: [
      question("prog-1", "multiple-choice", "Which value is stored by `count = 4` in a typical programming language?", "variables", "Beginner", ["The number 4", "The text 'count'", "A true/false value", "No value"], "The number 4", "The variable named count is assigned the numeric value 4."),
      question("prog-2", "true-false", "A Boolean value represents either true or false.", "data types", "Beginner", [], "true", "Boolean types represent logical true/false values."),
      question("prog-3", "fill-blank", "In many languages, the equality comparison operator is written as ___ (two equals signs).", "operators", "Intermediate", [], "==", "Many languages use == to compare values, while = assigns a value."),
      question("prog-4", "programming", "What does this code print? `for (let i = 0; i < 3; i++) console.log(i);`", "loops", "Intermediate", [], "0 1 2", "The loop starts at 0 and prints while i is less than 3, so it prints 0, 1, and 2."),
      question("prog-5", "programming", "Write a Python expression that checks whether `score` is at least 50.", "conditions", "Advanced", [], "score >= 50", "The >= operator checks whether the left value is greater than or equal to the right value."),
    ],
  },
  {
    id: "english-reading-check",
    title: "English: Reading and Language",
    subject: "English",
    topic: "Grammar and comprehension",
    description: "A quick practice in sentence structure, vocabulary, and reading meaning.",
    estimatedMinutes: 8,
    questions: [
      question("eng-1", "multiple-choice", "Choose the grammatically correct sentence.", "grammar", "Beginner", ["She walk to class.", "She walks to class.", "She walking to class.", "She walked to class every day tomorrow."], "She walks to class.", "In the present simple, a third-person singular subject takes a verb ending in -s."),
      question("eng-2", "true-false", "A synonym is a word with a similar meaning to another word.", "vocabulary", "Beginner", [], "true", "Synonyms have the same or a similar meaning."),
      question("eng-3", "fill-blank", "The past tense of the regular verb `play` is ___.", "grammar", "Intermediate", [], "played", "Add -ed to the regular verb play to form played."),
      question("eng-4", "short-answer", "In the sentence “Mina packed an umbrella because the sky looked dark,” why did Mina pack an umbrella?", "comprehension", "Intermediate", [], "the sky looked dark", "The sentence gives the reason: the sky looked dark."),
      question("eng-5", "short-answer", "Rewrite “The student finished the assignment” in the passive voice.", "grammar", "Advanced", [], "the assignment was finished by the student", "In passive voice, the object becomes the subject: “The assignment was finished by the student.”"),
    ],
  },
  {
    id: "digital-safety-check",
    title: "Digital Literacy: Online Safety",
    subject: "Digital Literacy",
    topic: "Privacy and information checks",
    description: "Review thoughtful ways to protect accounts and evaluate online claims.",
    estimatedMinutes: 7,
    questions: [
      question("digital-1", "multiple-choice", "Which is the safest password habit?", "account safety", "Beginner", ["Reuse one short password everywhere", "Use a unique, long password for each account", "Share a password with friends", "Write passwords in a public profile"], "Use a unique, long password for each account", "A unique long password limits the impact if another service is compromised."),
      question("digital-2", "true-false", "A message that looks urgent should always be trusted without checking its source.", "information literacy", "Beginner", [], "false", "Urgency can be used to pressure people. Verify the source through a trusted channel."),
      question("digital-3", "fill-blank", "A second verification step in addition to a password is called multi-factor ___.", "account safety", "Intermediate", [], "authentication", "Multi-factor authentication adds another verification factor to a sign-in."),
      question("digital-4", "short-answer", "Name one thing you should check before sharing a surprising online claim.", "information literacy", "Intermediate", [], "source", "Check the source, evidence, and date; compare with another reliable source."),
      question("digital-5", "short-answer", "What should you do if a site asks for personal information that does not seem necessary?", "privacy", "Advanced", [], "do not provide it", "Pause, avoid sharing unnecessary information, and check the service's privacy details or ask a trusted adult."),
    ],
  },
  {
    id: "general-knowledge-check",
    title: "General Knowledge: Our World",
    subject: "General Knowledge",
    topic: "Geography and everyday knowledge",
    description: "A short general knowledge practice across geography and the natural world.",
    estimatedMinutes: 7,
    questions: [
      question("gk-1", "multiple-choice", "Which is the largest ocean on Earth?", "geography", "Beginner", ["Atlantic Ocean", "Indian Ocean", "Pacific Ocean", "Arctic Ocean"], "Pacific Ocean", "The Pacific Ocean is the largest ocean on Earth."),
      question("gk-2", "true-false", "Earth completes one orbit around the Sun in about one year.", "astronomy", "Beginner", [], "true", "Earth's orbit around the Sun takes approximately one year."),
      question("gk-3", "fill-blank", "The capital city of Japan is ___.", "geography", "Intermediate", [], "tokyo", "Tokyo is the capital of Japan."),
      question("gk-4", "short-answer", "Name the gas that plants take in from the air during photosynthesis.", "natural world", "Intermediate", [], "carbon dioxide", "Plants use carbon dioxide, water, and light in photosynthesis."),
      question("gk-5", "short-answer", "Which imaginary line divides Earth into the Northern and Southern Hemispheres?", "geography", "Advanced", [], "equator", "The Equator divides Earth into the Northern and Southern Hemispheres."),
    ],
  },
  {
    id: "skill-development-check",
    title: "Skill Development: Learning Strategies",
    subject: "Skill Development",
    topic: "Planning and problem-solving",
    description: "Practise goal-setting, breaking down a task, and checking your work.",
    estimatedMinutes: 7,
    questions: [
      question("skill-1", "multiple-choice", "Which goal is easiest to track?", "goal setting", "Beginner", ["Study more", "Learn everything soon", "Complete two practice problems today", "Be better at science"], "Complete two practice problems today", "A specific, measurable action with a time frame is easier to track."),
      question("skill-2", "true-false", "Breaking a large task into smaller steps can make it easier to begin.", "planning", "Beginner", [], "true", "Smaller steps make a large task more manageable and help show progress."),
      question("skill-3", "fill-blank", "After completing a task, checking the result against the goal is a form of ___.", "reflection", "Intermediate", [], "reflection", "Reflection compares results to the goal and identifies what to improve."),
      question("skill-4", "short-answer", "Name one useful first step when you do not understand a problem.", "problem solving", "Intermediate", [], "identify what is known", "List known facts, clarify the goal, or identify what information is missing."),
      question("skill-5", "short-answer", "Give one way to make a study plan realistic.", "planning", "Advanced", [], "break it into small steps", "A realistic plan uses specific steps, available time, and materials, with space to review progress."),
    ],
  },
];

function question(id, type, prompt, topic, difficulty, options, correctAnswer, explanation) {
  return {
    id,
    type,
    prompt,
    topic,
    difficulty,
    options,
    correctAnswer,
    acceptedAnswers: [correctAnswer],
    explanation,
  };
}

export function getAssessment(assessmentId) {
  return assessmentCatalog.find((assessment) => assessment.id === assessmentId) ?? null;
}

export function normalizeAnswer(answer) {
  return typeof answer === "string"
    ? answer.trim().toLocaleLowerCase().replace(/[`"'.,!?;:]/g, "").replace(/\s+/g, " ")
    : "";
}

export function answerIsCorrect(questionRecord, answer) {
  const normalized = normalizeAnswer(answer);
  return normalized.length > 0 && questionRecord.acceptedAnswers.some((accepted) => normalizeAnswer(accepted) === normalized);
}

export function gradeAssessment(assessment, answers) {
  const answersByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.answer]));
  const graded = answers.map((answer) => {
    const item = assessment.questions.find((questionRecord) => questionRecord.id === answer.questionId);
    if (!item) return null;
    return {
      questionId: item.id,
      prompt: item.prompt,
      topic: item.topic,
      difficulty: item.difficulty,
      type: item.type,
      answer: answer.answer,
      correctAnswer: item.correctAnswer,
      correct: answerIsCorrect(item, answer.answer),
      explanation: item.explanation,
    };
  }).filter(Boolean);

  const topics = new Map();
  for (const result of graded) {
    const current = topics.get(result.topic) ?? { topic: result.topic, correct: 0, total: 0 };
    current.total += 1;
    if (result.correct) current.correct += 1;
    topics.set(result.topic, current);
  }
  const correctCount = graded.filter((item) => item.correct).length;
  return {
    score: correctCount,
    total: graded.length,
    accuracy: graded.length ? Math.round(correctCount / graded.length * 100) : 0,
    correctCount,
    incorrectCount: graded.length - correctCount,
    questions: graded,
    topicResults: [...topics.values()].map((item) => ({
      ...item,
      accuracy: Math.round(item.correct / item.total * 100),
    })),
    weakTopics: [...topics.values()].filter((item) => item.correct / item.total < 0.6).map((item) => item.topic),
  };
}

export function sanitizeAssessment(assessment) {
  return {
    id: assessment.id,
    title: assessment.title,
    subject: assessment.subject,
    topic: assessment.topic,
    description: assessment.description,
    estimatedMinutes: assessment.estimatedMinutes,
    isDemo: true,
    questions: assessment.questions.map(({ acceptedAnswers: _acceptedAnswers, ...item }) => item),
  };
}
