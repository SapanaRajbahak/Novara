const prisma = require("../prisma/client");

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function normalizeLanguage(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  const aliases = {
    english: "en",
    en: "en",
    spanish: "es",
    es: "es",
    french: "fr",
    fr: "fr",
    german: "de",
    de: "de",
    hindi: "hi",
    hi: "hi",
    japanese: "ja",
    ja: "ja",
    portuguese: "pt",
    pt: "pt",
    italian: "it",
    it: "it",
  };

  return aliases[raw] || raw;
}

function displayLanguage(code) {
  const languageCode = normalizeLanguage(code);
  const labels = {
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    hi: "Hindi",
    ja: "Japanese",
    pt: "Portuguese",
    it: "Italian",
  };
  return labels[languageCode] || languageCode.toUpperCase();
}

async function callOpenAiTranslation({ sourceText, targetLanguageCode }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Translation provider is not configured. Set OPENAI_API_KEY.");
  }

  const targetLabel = displayLanguage(targetLanguageCode);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are a literary translation assistant. Translate accurately while preserving paragraph breaks and tone. Return only translated text with no commentary.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Translate the chapter content below into ${targetLabel}. Preserve structure and line breaks.\n\n${String(sourceText || "")}`,
            },
          ],
        },
      ],
      max_output_tokens: 3000,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || "Translation request failed";
    throw new Error(message);
  }

  const outputText = typeof payload.output_text === "string"
    ? payload.output_text
    : Array.isArray(payload.output)
      ? payload.output
        .flatMap((item) => Array.isArray(item.content) ? item.content : [])
        .map((item) => item.text || item.output_text || "")
        .join("\n")
        .trim()
      : "";

  if (!outputText) {
    throw new Error("Translation provider returned empty output");
  }

  return {
    content: outputText.trim(),
    provider: "openai",
  };
}

async function getOrCreateChapterTranslation({ chapterId, language, sourceText }) {
  const normalizedLanguage = normalizeLanguage(language);
  if (!chapterId || !normalizedLanguage) {
    throw new Error("chapterId and language are required");
  }

  if (normalizedLanguage === "en") {
    return {
      content: String(sourceText || ""),
      language: "en",
      cached: true,
      provider: "source",
    };
  }

  const existing = await prisma.chapterTranslation.findUnique({
    where: {
      chapterId_language: {
        chapterId,
        language: normalizedLanguage,
      },
    },
  });

  if (existing) {
    return {
      content: existing.content,
      language: normalizedLanguage,
      cached: true,
      provider: existing.provider || "cache",
    };
  }

  const translated = await callOpenAiTranslation({
    sourceText,
    targetLanguageCode: normalizedLanguage,
  });

  const saved = await prisma.chapterTranslation.create({
    data: {
      chapterId,
      language: normalizedLanguage,
      content: translated.content,
      provider: translated.provider,
    },
  });

  return {
    content: saved.content,
    language: normalizedLanguage,
    cached: false,
    provider: saved.provider || translated.provider,
  };
}

async function saveUserTranslationPreference({ userId, bookId, language }) {
  const normalizedLanguage = normalizeLanguage(language);
  if (!userId || !bookId || !normalizedLanguage) {
    throw new Error("userId, bookId, and language are required");
  }

  return prisma.userTranslation.upsert({
    where: {
      userId_bookId_language: {
        userId: String(userId),
        bookId: String(bookId),
        language: normalizedLanguage,
      },
    },
    update: {},
    create: {
      userId: String(userId),
      bookId: String(bookId),
      language: normalizedLanguage,
    },
  });
}

module.exports = {
  normalizeLanguage,
  displayLanguage,
  getOrCreateChapterTranslation,
  saveUserTranslationPreference,
};
