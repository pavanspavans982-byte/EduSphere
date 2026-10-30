export const skillCategories = [
  "Programming",
  "Web Development",
  "Computer Skills",
  "Communication Skills",
  "Problem-Solving Skills",
  "Digital Literacy",
  "Basic Mathematics",
  "Science and Technology",
] as const;

export type SkillCategory = (typeof skillCategories)[number];
export type SkillLevel = "Beginner" | "Intermediate" | "Advanced";

type LessonBlueprint = {
  title: string;
  outcome: string;
  steps: [string, string, string];
  exerciseTitle: string;
  exercisePrompt: string;
};

type SkillBlueprint = {
  id: string;
  name: string;
  category: SkillCategory;
  description: string;
  estimatedHours: number;
  interests: string[];
  resourceSubjects: string[];
  lessons: [LessonBlueprint, LessonBlueprint, LessonBlueprint];
};

export type SkillLesson = LessonBlueprint & {
  id: string;
  level: SkillLevel;
  estimatedMinutes: number;
};

export type Skill = Omit<SkillBlueprint, "lessons"> & {
  lessons: SkillLesson[];
};

const blueprints: SkillBlueprint[] = [
  {
    id: "c-programming", name: "C Programming", category: "Programming",
    description: "Learn structured programming, from simple input and output to reusable functions.",
    estimatedHours: 8, interests: ["technology", "digital-skills"], resourceSubjects: ["Programming", "Computer Science"],
    lessons: [
      { title: "Your first C program", outcome: "Understand the shape of a small C program.", steps: ["Find the main function and its braces.", "Use printf to display a message.", "Compile and run the program, then read the output."], exerciseTitle: "Print a welcome message", exercisePrompt: "Write a C program that prints a welcome message on two lines." },
      { title: "Variables and decisions", outcome: "Store values and choose an action with a condition.", steps: ["Choose an integer or decimal variable for the problem.", "Read or assign a sample value.", "Use an if/else condition and check both outcomes."], exerciseTitle: "Classify a score", exercisePrompt: "Use a score variable and an if/else statement to report whether a score is passing." },
      { title: "Functions and arrays", outcome: "Break a task into a function and process a small list.", steps: ["Declare a function with a clear purpose.", "Pass it a value and return a result.", "Loop through a short array and call the function."], exerciseTitle: "Summarize numbers", exercisePrompt: "Create a function that returns the total of a small integer array." },
    ],
  },
  {
    id: "cpp-programming", name: "C++ Programming", category: "Programming",
    description: "Practise C++ basics, reusable functions, and simple object-oriented design.",
    estimatedHours: 9, interests: ["technology", "digital-skills"], resourceSubjects: ["Programming", "Computer Science"],
    lessons: [
      { title: "C++ setup and output", outcome: "Recognize a C++ program and print useful output.", steps: ["Locate the include and main function.", "Use cout to display text.", "Run the program and adjust the output."], exerciseTitle: "Build a greeting", exercisePrompt: "Write a C++ program that prints a greeting and one learning goal." },
      { title: "Types and control flow", outcome: "Use typed values, conditions, and loops.", steps: ["Select a type for each value.", "Compare values with an if/else statement.", "Repeat a small task with a for loop."], exerciseTitle: "Count by steps", exercisePrompt: "Write a loop that prints the first five multiples of a chosen number." },
      { title: "Functions and classes", outcome: "Group related data and behaviour in a simple class.", steps: ["Write a function that solves one small task.", "Create a class with one data member.", "Add a method and create an object to use it."], exerciseTitle: "Model a book", exercisePrompt: "Create a simple Book class with a title and a method that displays the title." },
    ],
  },
  {
    id: "python-programming", name: "Python Programming", category: "Programming",
    description: "Build confidence with Python syntax, data, decisions, and small reusable programs.",
    estimatedHours: 7, interests: ["technology", "digital-skills"], resourceSubjects: ["Programming", "Computer Science"],
    lessons: [
      { title: "Python essentials", outcome: "Run a short Python script and work with basic values.", steps: ["Create a script with a clear filename.", "Use print to show a message.", "Assign a value to a variable and display it."], exerciseTitle: "Personal learning card", exercisePrompt: "Write a script that stores and prints your name, a subject, and one goal." },
      { title: "Conditions and collections", outcome: "Make decisions and work with a short list.", steps: ["Store related values in a list.", "Use an if/elif/else decision.", "Loop over the list and format each item."], exerciseTitle: "Study list helper", exercisePrompt: "Create a list of three subjects and print a different message for one chosen subject." },
      { title: "Functions and files", outcome: "Create reusable functions and read simple text data.", steps: ["Define a function with a meaningful name.", "Return a value from the function.", "Read a small text file using a with block."], exerciseTitle: "Word counter", exercisePrompt: "Write a function that counts the words in a supplied sentence." },
    ],
  },
  {
    id: "java-programming", name: "Java Programming", category: "Programming",
    description: "Explore Java fundamentals, object-oriented concepts, and collections.",
    estimatedHours: 9, interests: ["technology", "digital-skills"], resourceSubjects: ["Programming", "Computer Science"],
    lessons: [
      { title: "A first Java application", outcome: "Identify the main method and display output.", steps: ["Find the class declaration.", "Read the main method signature.", "Use System.out.println and run the class."], exerciseTitle: "Introduce your program", exercisePrompt: "Create a Java class that prints a short introduction and one goal." },
      { title: "Types and branching", outcome: "Use Java types and conditions to respond to data.", steps: ["Declare variables with explicit types.", "Compare values in an if/else statement.", "Test the boundary values of your condition."], exerciseTitle: "Temperature check", exercisePrompt: "Use an integer temperature to print whether it is below, at, or above a chosen threshold." },
      { title: "Classes and collections", outcome: "Model a small object and store several values.", steps: ["Define a class with a field and constructor.", "Create an instance and call a method.", "Store values in an ArrayList and iterate through it."], exerciseTitle: "Track study topics", exercisePrompt: "Create a small list of study topics and print each one with its position." },
    ],
  },
  {
    id: "html", name: "HTML Foundations", category: "Web Development",
    description: "Structure accessible web pages with meaningful HTML elements.",
    estimatedHours: 4, interests: ["technology", "digital-skills"], resourceSubjects: ["Computer Science", "Digital Skills"],
    lessons: [
      { title: "Page structure", outcome: "Build a valid page with headings and sections.", steps: ["Add the document type and html element.", "Create head and body sections.", "Use one main heading and logical subheadings."], exerciseTitle: "Make a study page", exercisePrompt: "Create a page with a title, an introduction, and three clearly named sections." },
      { title: "Links, lists, and images", outcome: "Connect information with useful HTML elements.", steps: ["Choose an ordered or unordered list.", "Add descriptive link text.", "Use helpful alternative text for an image."], exerciseTitle: "Resource index", exercisePrompt: "Create a list of three learning resources with descriptive link labels." },
      { title: "Forms and accessibility", outcome: "Create a labeled form and check its structure.", steps: ["Associate each label with its input.", "Choose suitable input types.", "Navigate the form using the keyboard."], exerciseTitle: "Feedback form", exercisePrompt: "Create a small feedback form with a name, email, and message field." },
    ],
  },
  {
    id: "css", name: "CSS Styling", category: "Web Development",
    description: "Use layout, colour, and responsive styling to make clear web interfaces.",
    estimatedHours: 5, interests: ["technology", "digital-skills", "creative-thinking"], resourceSubjects: ["Computer Science", "Digital Skills"],
    lessons: [
      { title: "Selectors and visual rules", outcome: "Connect CSS rules to page elements.", steps: ["Link a stylesheet to the HTML page.", "Select elements with a class selector.", "Adjust colour, spacing, and readable type."], exerciseTitle: "Style a study card", exercisePrompt: "Give a study card a heading, readable spacing, and a contrasting background." },
      { title: "Flexbox and grid", outcome: "Arrange page content with modern CSS layout.", steps: ["Choose flexbox for one-dimensional alignment.", "Use grid for rows and columns.", "Check how items wrap at a narrower width."], exerciseTitle: "Responsive resource cards", exercisePrompt: "Arrange three cards in a row on wide screens and a single column on narrow screens." },
      { title: "Responsive design", outcome: "Adapt a page layout to different screen sizes.", steps: ["Start with a small-screen layout.", "Add a media query for a wider viewport.", "Test text, navigation, and controls at both sizes."], exerciseTitle: "Improve mobile navigation", exercisePrompt: "Write CSS that changes a horizontal navigation list into a compact vertical layout on small screens." },
    ],
  },
  {
    id: "javascript", name: "JavaScript Basics", category: "Web Development",
    description: "Add interaction to web pages with JavaScript variables, events, and data.",
    estimatedHours: 6, interests: ["technology", "digital-skills"], resourceSubjects: ["Programming", "Computer Science"],
    lessons: [
      { title: "Values and variables", outcome: "Represent simple values and combine them in expressions.", steps: ["Declare values with const or let.", "Choose strings, numbers, and booleans appropriately.", "Use a template string to display a result."], exerciseTitle: "Learning time calculator", exercisePrompt: "Store two study-session lengths and display their combined time." },
      { title: "Conditions and functions", outcome: "Write reusable logic with clear input and output.", steps: ["Create a function with a parameter.", "Return a result instead of repeating code.", "Use a condition to handle two possible cases."], exerciseTitle: "Progress message", exercisePrompt: "Write a function that returns a different message for low, medium, and high progress." },
      { title: "DOM events and arrays", outcome: "Respond to a user action and update a page element.", steps: ["Select a button and an output element.", "Listen for a click event.", "Update the page using textContent."], exerciseTitle: "Interactive checklist", exercisePrompt: "Make a button that adds one item from an array to a visible checklist." },
    ],
  },
  {
    id: "computer-skills", name: "Everyday Computer Skills", category: "Computer Skills",
    description: "Build practical confidence with files, folders, documents, and keyboard shortcuts.",
    estimatedHours: 3, interests: ["digital-skills"], resourceSubjects: ["Digital Skills", "General Knowledge"],
    lessons: [
      { title: "Files and folders", outcome: "Organize and locate files using a simple folder system.", steps: ["Create a folder for one subject.", "Use clear, descriptive filenames.", "Move a file and find it again."], exerciseTitle: "Organize a study folder", exercisePrompt: "Design a folder structure for three subjects and explain where notes and assignments belong." },
      { title: "Documents and formatting", outcome: "Create a readable document with consistent structure.", steps: ["Use heading styles instead of only bold text.", "Keep paragraph spacing and lists consistent.", "Save a copy with a descriptive filename."], exerciseTitle: "Format a one-page note", exercisePrompt: "Create a one-page note with a title, two sections, and a short checklist." },
      { title: "Keyboard and workflow", outcome: "Use shortcuts and simple file workflows efficiently.", steps: ["Practise copy, paste, undo, and save shortcuts.", "Choose a shortcut appropriate to the task.", "Repeat the task and compare the number of steps."], exerciseTitle: "Shortcut practice plan", exercisePrompt: "List five useful keyboard shortcuts for your device and a task where each helps." },
    ],
  },
  {
    id: "communication", name: "Clear Communication", category: "Communication Skills",
    description: "Practise organizing ideas, listening carefully, and giving constructive feedback.",
    estimatedHours: 4, interests: ["languages", "creative-thinking"], resourceSubjects: ["English", "General Knowledge"],
    lessons: [
      { title: "Organize an explanation", outcome: "Present an idea in a clear beginning, middle, and end.", steps: ["State the main point first.", "Support it with one example.", "End with a short summary or next step."], exerciseTitle: "Explain a concept", exercisePrompt: "Write a three-part explanation of a topic you recently learned." },
      { title: "Active listening", outcome: "Use questions and summaries to check understanding.", steps: ["Listen without interrupting.", "Ask one clarifying question.", "Summarize the speaker's main idea in your own words."], exerciseTitle: "Listening reflection", exercisePrompt: "After a conversation or lesson, record the main idea and one follow-up question." },
      { title: "Constructive feedback", outcome: "Give specific feedback that helps someone improve.", steps: ["Describe the work you observed.", "Name one strength with evidence.", "Offer one actionable suggestion respectfully."], exerciseTitle: "Helpful feedback note", exercisePrompt: "Write supportive feedback on a sample presentation using one strength and one next step." },
    ],
  },
  {
    id: "problem-solving", name: "Problem-Solving Practice", category: "Problem-Solving Skills",
    description: "Break unfamiliar problems into smaller steps, test ideas, and learn from results.",
    estimatedHours: 5, interests: ["creative-thinking", "mathematics", "technology"], resourceSubjects: ["Mathematics", "Science", "Digital Skills"],
    lessons: [
      { title: "Define the problem", outcome: "Describe a problem and identify the information needed.", steps: ["Write the problem in one sentence.", "Separate known facts from assumptions.", "Decide what a successful result would look like."], exerciseTitle: "Frame a small challenge", exercisePrompt: "Choose an everyday challenge and write its goal, constraints, and known information." },
      { title: "Plan and test options", outcome: "Compare possible approaches using simple evidence.", steps: ["List at least two possible approaches.", "Choose a small test for each.", "Record what happened and what you learned."], exerciseTitle: "Compare two solutions", exercisePrompt: "For a study-planning challenge, compare two possible solutions against time and materials available." },
      { title: "Reflect and improve", outcome: "Use results to refine a solution rather than guess at success.", steps: ["Compare the result with your success criteria.", "Identify one thing that worked and one gap.", "Make a specific change and test again."], exerciseTitle: "Improve a first attempt", exercisePrompt: "Take a first solution to a small task and document one evidence-based improvement." },
    ],
  },
  {
    id: "digital-literacy", name: "Digital Literacy and Safety", category: "Digital Literacy",
    description: "Evaluate online information and make safer, more thoughtful technology choices.",
    estimatedHours: 4, interests: ["digital-skills", "technology"], resourceSubjects: ["General Knowledge", "Digital Skills"],
    lessons: [
      { title: "Check information sources", outcome: "Use basic questions to assess a claim and its source.", steps: ["Identify who published the information.", "Look for supporting evidence and dates.", "Compare the claim with a second reliable source."], exerciseTitle: "Source-check checklist", exercisePrompt: "Create a short checklist you can use before sharing a surprising online claim." },
      { title: "Privacy and passwords", outcome: "Recognize safer ways to protect accounts and personal data.", steps: ["Identify what personal information a service requests.", "Use a unique, long password with a password manager where available.", "Enable an additional sign-in factor when offered."], exerciseTitle: "Privacy review", exercisePrompt: "Review a fictional app's permissions and decide which requests are necessary." },
      { title: "Responsible digital participation", outcome: "Choose respectful and responsible actions online.", steps: ["Pause before posting or forwarding.", "Consider the audience and possible impact.", "Use reporting or trusted-adult support for unsafe content."], exerciseTitle: "Digital decision scenario", exercisePrompt: "Describe a safe and respectful response to receiving an unverified message about a classmate." },
    ],
  },
  {
    id: "basic-mathematics", name: "Basic Mathematics", category: "Basic Mathematics",
    description: "Strengthen number sense through arithmetic, fractions, and everyday problem solving.",
    estimatedHours: 5, interests: ["mathematics"], resourceSubjects: ["Mathematics"],
    lessons: [
      { title: "Number sense and operations", outcome: "Choose and check an arithmetic operation for a practical task.", steps: ["Identify the quantities and their units.", "Choose addition, subtraction, multiplication, or division.", "Estimate first, then check whether the answer is reasonable."], exerciseTitle: "Plan a small budget", exercisePrompt: "Work out the cost of several items, then estimate and check the total." },
      { title: "Fractions and percentages", outcome: "Connect a fraction, decimal, and percentage representation.", steps: ["Identify the whole and the part.", "Simplify the fraction where possible.", "Convert it to a decimal or percentage and check the scale."], exerciseTitle: "Compare two discounts", exercisePrompt: "Compare two simple percentage discounts on the same price and show your steps." },
      { title: "Ratios and measurement", outcome: "Use ratios and unit conversions in a real-world example.", steps: ["Write the quantities in a consistent order.", "Scale both parts of the ratio equally.", "Convert units before comparing measurements."], exerciseTitle: "Scale a recipe", exercisePrompt: "Adjust a simple two-person recipe for four people using a ratio." },
    ],
  },
  {
    id: "science-technology", name: "Science and Technology", category: "Science and Technology",
    description: "Explore observation, evidence, and the technology behind everyday systems.",
    estimatedHours: 5, interests: ["science", "technology"], resourceSubjects: ["Science", "Digital Skills"],
    lessons: [
      { title: "Observe and ask", outcome: "Turn an observation into a testable science question.", steps: ["Describe what you notice without explaining it yet.", "Ask a focused question about one change.", "Predict an outcome and name what you would measure."], exerciseTitle: "Design a fair observation", exercisePrompt: "Plan a simple safe observation and identify what you will keep the same and measure." },
      { title: "Evidence and patterns", outcome: "Record observations and look for a pattern without overclaiming.", steps: ["Record results in a small table.", "Look for similarities and differences.", "State what the evidence suggests and what it cannot prove."], exerciseTitle: "Read a small data set", exercisePrompt: "Use a small set of made-up measurements to describe one pattern and one limitation." },
      { title: "Technology systems", outcome: "Describe how inputs, processes, and outputs work in a system.", steps: ["Name the system's input.", "Explain the process that changes or uses the input.", "Identify the output and one possible limitation."], exerciseTitle: "Map an everyday device", exercisePrompt: "Map the input, process, and output of a familiar device such as a flashlight." },
    ],
  },
];

const levels: SkillLevel[] = ["Beginner", "Intermediate", "Advanced"];

export const skills: Skill[] = blueprints.map((blueprint) => ({
  ...blueprint,
  lessons: blueprint.lessons.map((lesson, index) => ({
    ...lesson,
    id: `${blueprint.id}-${levels[index].toLowerCase()}`,
    level: levels[index],
    estimatedMinutes: 25 + index * 10,
  })),
}));

export function getSkill(skillId: string) {
  return skills.find((skill) => skill.id === skillId) ?? null;
}

export function recommendationReason(skill: Skill, profile: { course: string; branch: string; interests: string[] }) {
  const interest = profile.interests.find((item) => skill.interests.includes(item));
  if (interest) {
    const labels: Record<string, string> = {
      technology: "technology interest", mathematics: "mathematics interest", science: "science interest",
      "creative-thinking": "creative-thinking interest", "digital-skills": "digital-skills interest",
      languages: "language interest",
    };
    return `Recommended for your ${labels[interest] ?? interest}`;
  }
  const profileText = `${profile.course} ${profile.branch}`.toLowerCase();
  if (profileText && skill.interests.some((item) => profileText.includes(item.replace("-", " ")))) {
    return "Recommended based on your course or branch";
  }
  return null;
}
