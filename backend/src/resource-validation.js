import { resourceCategories, resourceLevels, resourceTypes } from "./resource-data.js";

const resourceFields = {
  title: { maximumLength: 140 },
  description: { maximumLength: 600 },
  preview: { maximumLength: 5000 },
  language: { maximumLength: 40 },
  classLevel: { maximumLength: 60 },
  sourceName: { maximumLength: 100 },
  licenseInfo: { maximumLength: 500 },
};
const trustedSourceHosts = [
  "epathshala.nic.in",
  "ncert.nic.in",
  "diksha.gov.in",
  "swayam.gov.in",
  "nptel.ac.in",
  "iitkgp.ac.in",
  "openstax.org",
];

export function validateResource(input = {}, { partial = false } = {}) {
  const errors = {};
  const value = {};

  for (const [field, { maximumLength }] of Object.entries(resourceFields)) {
    if (partial && input[field] === undefined) continue;
    const text = field === "classLevel" && input[field] === undefined
      ? "Not specified"
      : typeof input[field] === "string" ? input[field].trim() : "";
    const minimumLength = field === "language" || field === "sourceName" ? 2 : 4;
    if (text.length < minimumLength || text.length > maximumLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
      errors[field] = `Enter between ${minimumLength} and ${maximumLength} characters.`;
    }
    value[field] = text;
  }

  for (const field of ["language", "sourceName", "licenseInfo"]) {
    if (!partial && input[field] === undefined) {
      errors[field] = "This resource detail is required.";
      value[field] = "";
    }
  }

  if (!partial || input.subject !== undefined) {
    if (typeof input.subject !== "string" || !resourceCategories.includes(input.subject)) {
      errors.subject = "Choose a supported resource category.";
    } else {
      value.subject = input.subject;
    }
  }

  if (!partial || input.level !== undefined) {
    if (typeof input.level !== "string" || !resourceLevels.includes(input.level)) {
      errors.level = "Choose a supported learning level.";
    } else {
      value.level = input.level;
    }
  }

  if (!partial || input.type !== undefined) {
    if (typeof input.type !== "string" || !resourceTypes.includes(input.type)) {
      errors.type = "Choose a supported resource type.";
    } else {
      value.type = input.type;
    }
  }

  if (!partial || input.estimatedMinutes !== undefined) {
    const minutes = Number(input.estimatedMinutes);
    const minimumMinutes = input.type === "link" ? 0 : 1;
    if (!Number.isInteger(minutes) || minutes < minimumMinutes || minutes > 600) {
      errors.estimatedMinutes = `Estimated time must be between ${minimumMinutes} and 600 minutes.`;
    } else {
      value.estimatedMinutes = minutes;
    }
  }

  if (!partial || input.sourceUrl !== undefined) {
    const sourceUrl = typeof input.sourceUrl === "string" ? input.sourceUrl.trim() : "";
    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl);
        const trustedHost = trustedSourceHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
        if (parsed.protocol !== "https:" || !trustedHost || parsed.username || parsed.password) {
          errors.sourceUrl = "Use an HTTPS URL from a trusted educational source.";
        } else {
          value.sourceUrl = parsed.toString();
        }
      } catch {
        errors.sourceUrl = "Enter a valid HTTPS URL from a trusted educational source.";
      }
    } else {
      value.sourceUrl = "";
      if (input.type === "link" || (!partial && !input.type)) {
        errors.sourceUrl = "A trusted external resource link is required for link resources.";
      }
    }
  }

  if (input.downloadAllowed !== undefined && typeof input.downloadAllowed !== "boolean") {
    errors.downloadAllowed = "Download permission must be confirmed explicitly.";
  }
  if (input.externalUrl !== undefined || input.fileUrl !== undefined) {
    errors.sourceUrl = "Use the validated sourceUrl field instead.";
  }

  return { errors, value };
}
