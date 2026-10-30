import { resourceCategories } from "./resource-data.js";

const QUESTION_LIMIT = 2000;
const CONTEXT_LIMIT = 8;
const REQUEST_TIMEOUT_MS = 90_000;

export function createAiService({ environment = process.env, fetchImpl = fetch } = {}) {
  const localModel = environment.LOCAL_AI_MODEL ?? "qwen2.5:3b";
  const localBaseUrl = parseLocalAiUrl(environment.LOCAL_AI_BASE_URL ?? "http://127.0.0.1:11434");
  const onlineUrl = parseOnlineAiUrl(environment.ONLINE_AI_CHAT_COMPLETIONS_URL);
  const onlineModel = environment.ONLINE_AI_MODEL ?? "";
  const onlineApiKey = environment.ONLINE_AI_API_KEY ?? "";

  async function getStatus() {
    let localAvailable = false;
    if (localBaseUrl) {
      try {
        const response = await fetchImpl(`${localBaseUrl}/api/tags`, {
          signal: AbortSignal.timeout(2500),
        });
        if (response.ok) {
          const result = await response.json();
          localAvailable = Array.isArray(result.models)
            && result.models.some((model) => model.name === localModel || model.name?.startsWith(`${localModel}:`));
        }
      } catch {
        localAvailable = false;
      }
    }

    return {
      local: {
        available: localAvailable,
        model: localModel,
        runtime: "Ollama",
        location: "EduSphere server host",
      },
      online: {
        configured: Boolean(onlineUrl && onlineModel && onlineApiKey),
        model: onlineModel || null,
      },
    };
  }

  async function askLocal({ question, subject, mode, context }) {
    if (!localBaseUrl) {
      throw serviceError(503, "Local AI is unavailable because its Ollama URL is invalid. Configure a loopback Ollama URL on the EduSphere host.");
    }

    const endpoint = `${localBaseUrl}/api/chat`;
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model: localModel,
          stream: false,
          messages: [
            { role: "system", content: createSystemPrompt(subject, mode) },
            ...context.map(({ role, content }) => ({ role, content })),
            { role: "user", content: question },
          ],
          options: { temperature: 0.3 },
        }),
      });
    } catch (error) {
      if (error?.name === "TimeoutError") {
        throw serviceError(504, "The local AI model took too long to respond. Try again or send the question for online help.");
      }
      throw serviceError(503, "The local AI model is not reachable on the EduSphere host. Start Ollama and make sure the configured model is installed.");
    }

    if (response.status === 404) {
      throw serviceError(503, `The local AI model "${localModel}" is not installed in Ollama yet.`);
    }
    if (!response.ok) {
      throw serviceError(503, "The local AI model could not answer right now. Check Ollama and try again.");
    }

    const result = await response.json().catch(() => null);
    const answer = typeof result?.message?.content === "string" ? result.message.content.trim() : "";
    if (!answer) {
      throw serviceError(502, "The local AI model returned an empty answer. Your question is still available to try again.");
    }
    return { answer, provider: "local", model: localModel };
  }

  async function askOnline({ question, subject, mode, context }) {
    if (!onlineUrl || !onlineModel || !onlineApiKey) {
      throw serviceError(503, "Online AI is not configured by the administrator. Your question remains saved on this device.");
    }

    let response;
    try {
      response = await fetchImpl(onlineUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${onlineApiKey}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model: onlineModel,
          temperature: 0.3,
          max_tokens: 1200,
          messages: [
            { role: "system", content: createSystemPrompt(subject, mode) },
            ...context.map(({ role, content }) => ({ role, content })),
            { role: "user", content: question },
          ],
        }),
      });
    } catch (error) {
      if (error?.name === "TimeoutError") {
        throw serviceError(504, "Online AI took too long to respond. Your question remains saved for another try.");
      }
      throw serviceError(503, "Online AI could not be reached. Your question remains saved for another try.");
    }

    if (response.status === 401 || response.status === 403) {
      throw serviceError(503, "Online AI credentials were rejected. Ask the administrator to check the server configuration.");
    }
    if (!response.ok) {
      throw serviceError(503, "Online AI is temporarily unavailable. Your question remains saved for another try.");
    }

    const result = await response.json().catch(() => null);
    const answer = result?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      throw serviceError(502, "Online AI returned an empty answer. Your question remains saved for another try.");
    }
    return { answer: answer.trim(), provider: "online", model: onlineModel };
  }

  return { getStatus, askLocal, askOnline };
}

export function validateAiQuestion(body = {}) {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const subject = typeof body.subject === "string" && resourceCategories.includes(body.subject)
    ? body.subject
    : "General";
  const mode = body.mode === "simple" ? "simple" : "step-by-step";
  const context = body.context;

  if (!question || question.length > QUESTION_LIMIT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(question)) {
    return { error: "Write a question between 1 and 2,000 characters." };
  }
  if (context !== undefined && (!Array.isArray(context) || context.length > CONTEXT_LIMIT)) {
    return { error: "Chat context must contain no more than 8 recent messages." };
  }

  const validContext = [];
  for (const message of context ?? []) {
    if (
      !message || !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" || message.content.length > QUESTION_LIMIT
    ) {
      return { error: "Chat context contains an invalid message." };
    }
    validContext.push({ role: message.role, content: message.content });
  }

  return { value: { question, subject, mode, context: validContext } };
}

export function createSystemPrompt(subject, mode) {
  return [
    "You are EduSphere's student learning tutor.",
    "Explain concepts accurately, kindly, and in age-appropriate plain language.",
    `The learner selected the subject: ${subject}.`,
    mode === "simple"
      ? "Use simple explanation mode: start with a short, plain-language explanation and one clear example. Avoid jargon."
      : "Use step-by-step explanation mode: explain the reasoning in short numbered steps and end with a brief recap.",
    "If you are uncertain, say so plainly instead of making up facts.",
    "Do not claim access to the student's account, files, course materials, or current events.",
  ].join(" ");
}

function parseLocalAiUrl(value) {
  try {
    const url = new URL(value);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (!isLoopback || url.protocol !== "http:" || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function parseOnlineAiUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) || url.username || url.password || url.hash) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function serviceError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
