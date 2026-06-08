const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const TOOL_DEFINITIONS = {
  "story-idea": {
    label: "Generate Story Idea",
    maxOutputTokens: 500,
  },
  "generate-chapter": {
    label: "Generate Chapter",
    maxOutputTokens: 1400,
  },
  "rewrite-scene": {
    label: "Rewrite Scene",
    maxOutputTokens: 1000,
  },
  "improve-dialogue": {
    label: "Improve Dialogue",
    maxOutputTokens: 800,
  },
  "continue-writing": {
    label: "Continue Writing",
    maxOutputTokens: 900,
  },
  "expand-scene": {
    label: "Expand Scene",
    maxOutputTokens: 1000,
  },
  "create-chapter-title": {
    label: "Create Chapter Title",
    maxOutputTokens: 120,
  },
};

function trimText(value, maxLength = 24000) {
  return String(value || "").slice(0, maxLength);
}

function summarizeText(value, maxWords = 90) {
  const words = trimText(value, 18000).trim().split(/\s+/).filter(Boolean);
  if (!words.length) {
    return "";
  }
  return words.slice(0, maxWords).join(" ");
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getToolDefinition(tool) {
  return TOOL_DEFINITIONS[tool] || null;
}

function buildSystemPrompt(tool) {
  const toolLabel = getToolDefinition(tool)?.label || "Writer Assistant";
  return [
    "You are Novara's premium writer copilot.",
    "Write like an experienced developmental editor and fiction collaborator.",
    "Respect the provided story context, preserve continuity, and keep outputs usable inside a live chapter editor.",
    `Current task: ${toolLabel}.`,
    "Return plain text only with no markdown fences, no labels, and no commentary about what you changed.",
  ].join(" ");
}

function buildUserPrompt(tool, context) {
  const selectedText = normalizeWhitespace(context.selectedText);
  const instructions = normalizeWhitespace(context.instructions);
  const chapterContent = trimText(context.chapterContent || "", 18000);
  const textBeforeCursor = trimText(context.textBeforeCursor || "", 6000);
  const textAfterCursor = trimText(context.textAfterCursor || "", 3000);

  const parts = [
    `Book title: ${context.bookTitle || "Untitled story"}`,
    `Genre: ${context.genre || "General fiction"}`,
    `Chapter number: ${context.chapterNumber || ""}`,
    `Chapter title: ${context.chapterTitle || "Untitled chapter"}`,
    `Writer pen name: ${context.writerPenName || "Novara writer"}`,
  ];

  if (context.previousChapterSummary) {
    parts.push(`Previous chapter summary: ${trimText(context.previousChapterSummary, 3000)}`);
  }

  if (instructions) {
    parts.push(`Writer instructions: ${instructions}`);
  }

  if (tool === "rewrite-scene" || tool === "improve-dialogue" || tool === "expand-scene") {
    parts.push(`Selected text to transform:\n${trimText(selectedText, 8000)}`);
  }

  if (tool === "continue-writing") {
    parts.push(`Text before cursor:\n${textBeforeCursor}`);
    if (textAfterCursor) {
      parts.push(`Text after cursor:\n${textAfterCursor}`);
    }
  } else if (chapterContent) {
    parts.push(`Current chapter content:\n${chapterContent}`);
  }

  switch (tool) {
    case "story-idea":
      parts.push("Create one strong story idea that fits the book and chapter direction. Make it vivid and commercially appealing.");
      break;
    case "generate-chapter":
      parts.push("Generate polished chapter prose that fits the current story context. Preserve line breaks and write in complete scene-ready text.");
      break;
    case "rewrite-scene":
      parts.push("Rewrite the selected scene with stronger flow, imagery, and emotional clarity while preserving the core beat.");
      break;
    case "improve-dialogue":
      parts.push("Improve only the dialogue passage. Make it sharper, more natural, and more character-specific.");
      break;
    case "continue-writing":
      parts.push("Continue the chapter smoothly from the cursor position without repeating prior sentences.");
      break;
    case "expand-scene":
      parts.push("Expand the selected moment with more atmosphere, interiority, and narrative movement.");
      break;
    case "create-chapter-title":
      parts.push("Create one premium, memorable chapter title that matches the chapter tone and plot movement.");
      break;
    default:
      parts.push("Provide strong fiction writing support.");
      break;
  }

  return parts.join("\n\n");
}

async function callOpenAI(tool, context) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const toolDefinition = getToolDefinition(tool);
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
              text: buildSystemPrompt(tool),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildUserPrompt(tool, context),
            },
          ],
        },
      ],
      max_output_tokens: toolDefinition?.maxOutputTokens || 900,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || "AI request failed";
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
    throw new Error("AI returned an empty response");
  }

  return {
    text: outputText.trim(),
    provider: "openai",
    model: payload.model || DEFAULT_MODEL,
  };
}

function buildFallbackOutput(tool, context) {
  const bookTitle = context.bookTitle || "Untitled story";
  const genre = context.genre || "fiction";
  const chapterTitle = context.chapterTitle || `Chapter ${context.chapterNumber || ""}`.trim();
  const selected = normalizeWhitespace(context.selectedText);
  const instructionLine = context.instructions ? ` ${normalizeWhitespace(context.instructions)}` : "";
  const previousSummary = context.previousChapterSummary
    ? ` Previous momentum: ${normalizeWhitespace(context.previousChapterSummary)}.`
    : "";

  switch (tool) {
    case "story-idea":
      return `A new complication takes shape in ${bookTitle}: the protagonist discovers that the promise anchoring this ${genre} story was built on a half-truth, forcing them to choose between protecting the person they love and exposing the secret that could redefine the entire book. Chapter ${context.chapterNumber || ""} can pivot around a private revelation, a dangerous emotional test, and a closing image that makes the next chapter feel inevitable.${instructionLine}`;
    case "generate-chapter":
      return `${chapterTitle}\n\nThe evening settled over the story with the uneasy stillness that comes right before a decision becomes irreversible. ${bookTitle} had already taught its characters that silence could wound as sharply as any confession, and this chapter begins in that charged pause.${previousSummary}\n\n${context.chapterTitle || "This chapter"} should move with emotional pressure and visible consequence. Let the scene open on a concrete sensory detail, let the conflict tighten through character reaction and subtext, and let the final beat leave the reader with a compelling reason to continue.${instructionLine}\n\nBy the close of the chapter, the emotional cost should feel clearer, the stakes should feel heavier, and the next move should feel unavoidable.`;
    case "rewrite-scene":
      return `The moment sharpened around them before either of them fully understood what had changed. ${selected || "The scene"} carried a pressure that could no longer remain hidden, so every glance, hesitation, and unfinished sentence began to matter. The emotional beat lands harder when the setting mirrors the tension and when the character's private fear is visible beneath the action.${instructionLine}\n\nWhat had felt manageable only moments ago now carried consequence. The scene should keep its original purpose, but the language can lean into sharper pacing, more precise imagery, and a stronger shift by the final line.`;
    case "improve-dialogue":
      return `"Then tell me the truth," one voice said quietly, the restraint making the demand more dangerous.\n\n"I would, if the truth only belonged to me."\n\n"That's not an answer."\n\n"It's the only one I can survive giving."${instructionLine ? `\n\n${instructionLine}` : ""}`;
    case "continue-writing":
      return `The next beat arrives without breaking the rhythm of the chapter. The character notices what they missed a moment ago, the meaning of that detail turns the scene, and the conversation or action deepens instead of repeating what has already been said.${instructionLine}\n\nFrom there, the chapter can push into a stronger emotional choice, letting the narration stay close to the character while the stakes quietly become impossible to ignore.`;
    case "expand-scene":
      return `${selected || "The moment"} deserves more space to breathe. Slow the scene just enough to let the setting press against the character's thoughts, let body language reveal what the dialogue avoids, and add one concrete sensory detail that turns mood into atmosphere.${instructionLine}\n\nAs the scene expands, make the emotional shift unmistakable: begin with restraint, let tension gather through observation and reaction, and end on a line that changes the temperature of the chapter.`;
    case "create-chapter-title":
      return `${context.chapterTitle && context.chapterTitle.trim() ? `${context.chapterTitle.trim()}: ` : ""}The Promise Beneath Midnight`;
    default:
      return "The AI assistant is ready, but this action is not configured yet.";
  }
}

async function generateWriterAiOutput(tool, context) {
  const liveResult = await callOpenAI(tool, context).catch(() => null);
  if (liveResult) {
    return liveResult;
  }

  return {
    text: buildFallbackOutput(tool, context).trim(),
    provider: "fallback",
    model: "novara-dev-fallback",
  };
}

module.exports = {
  getToolDefinition,
  generateWriterAiOutput,
  summarizeText,
};
