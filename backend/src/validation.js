export const learningInterests = [
  "technology",
  "mathematics",
  "science",
  "creative-thinking",
  "digital-skills",
  "languages",
];

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedStudyYears = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "other"]);

export function validateRegistration(body = {}) {
  const errors = {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    errors.name = "Enter a name between 2 and 80 characters.";
  }
  if (!isValidEmail(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (password.length < 8 || password.length > 128) {
    errors.password = "Use a password between 8 and 128 characters.";
  }

  return { errors, value: { name, email, password } };
}

export function validateProfile(body = {}) {
  const errors = {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const college = readOptionalText(body.college, "College", 120, errors);
  const course = readOptionalText(body.course, "Course", 120, errors);
  const branch = readOptionalText(body.branch, "Branch", 120, errors);
  const yearOfStudy = typeof body.yearOfStudy === "string" ? body.yearOfStudy : "";
  const interests = body.interests;

  if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    errors.name = "Enter a name between 2 and 80 characters.";
  }
  if (yearOfStudy && !allowedStudyYears.has(yearOfStudy)) {
    errors.yearOfStudy = "Choose a valid year of study.";
  }
  if (
    !Array.isArray(interests) ||
    interests.length > learningInterests.length ||
    interests.some((interest) => !learningInterests.includes(interest)) ||
    new Set(interests).size !== interests.length
  ) {
    errors.interests = "Choose valid learning interests.";
  }

  return {
    errors,
    value: { name, college, course, branch, yearOfStudy, interests },
  };
}

export function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(email) {
  return email.length <= 254 && emailPattern.test(email);
}

function readOptionalText(value, label, maximumLength, errors) {
  if (value === undefined) {
    return "";
  }

  if (typeof value !== "string" || value.trim().length > maximumLength || /[\u0000-\u001f\u007f]/.test(value)) {
    errors[label.toLowerCase()] = `${label} must be ${maximumLength} characters or fewer.`;
    return "";
  }

  return value.trim();
}
