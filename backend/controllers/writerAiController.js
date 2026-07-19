const prisma = require("../prisma/client");
const { validateAiRequestBody } = require("../validators/writerAiValidator");
const { generateWriterAiOutput, getToolDefinition, summarizeText } = require("../services/writerAiService");

async function findOwnedChapterForUser(chapterId, sessionUser) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: {
      book: true,
    },
  });

  if (!chapter) {
    return null;
  }

  if (sessionUser.role !== "ADMIN" && chapter.book.createdBy !== String(sessionUser.id)) {
    return "forbidden";
  }

  return chapter;
}

async function buildAiContext(chapter, body, sessionUser) {
  const requestedChapterNumber = body.chapterNumber === undefined
    ? chapter.chapterNumber
    : Number(body.chapterNumber);

  const previousChapter = requestedChapterNumber > 1
    ? await prisma.chapter.findFirst({
      where: {
        bookId: chapter.bookId,
        chapterNumber: requestedChapterNumber - 1,
      },
      select: {
        title: true,
        content: true,
      },
    })
    : null;

  const chapterContent = body.chapterContent === undefined
    ? chapter.content
    : String(body.chapterContent);
  const previousChapterSummary = body.previousChapterSummary && String(body.previousChapterSummary).trim()
    ? String(body.previousChapterSummary).trim()
    : previousChapter
      ? summarizeText(previousChapter.content, 100)
      : "";

  const cursorPosition = body.cursorPosition === undefined
    ? chapterContent.length
    : Math.min(Number(body.cursorPosition), chapterContent.length);

  const textBeforeCursor = body.textBeforeCursor === undefined
    ? chapterContent.slice(Math.max(0, cursorPosition - 3200), cursorPosition)
    : String(body.textBeforeCursor);
  const textAfterCursor = body.textAfterCursor === undefined
    ? chapterContent.slice(cursorPosition, Math.min(chapterContent.length, cursorPosition + 1600))
    : String(body.textAfterCursor);

  return {
    chapterId: chapter.id,
    bookId: chapter.bookId,
    bookTitle: body.bookTitle && String(body.bookTitle).trim()
      ? String(body.bookTitle).trim()
      : chapter.book.title,
    genre: body.genre && String(body.genre).trim()
      ? String(body.genre).trim()
      : (chapter.book.genre || ""),
    chapterNumber: requestedChapterNumber,
    chapterTitle: body.chapterTitle && String(body.chapterTitle).trim()
      ? String(body.chapterTitle).trim()
      : chapter.title,
    chapterContent,
    previousChapterSummary,
    selectedText: body.selectedText === undefined ? "" : String(body.selectedText),
    selectionStart: body.selectionStart === undefined ? null : Number(body.selectionStart),
    selectionEnd: body.selectionEnd === undefined ? null : Number(body.selectionEnd),
    cursorPosition,
    textBeforeCursor,
    textAfterCursor,
    instructions: body.instructions === undefined ? "" : String(body.instructions),
    writerPenName: sessionUser.writerProfile?.penName || sessionUser.penName || sessionUser.name,
    preferredGenres: Array.isArray(sessionUser.writerProfile?.preferredGenres)
      ? sessionUser.writerProfile.preferredGenres
      : Array.isArray(sessionUser.preferredGenres)
      ? sessionUser.preferredGenres
      : [],
  };
}

function createAiHandler(tool, options = {}) {
  return async function handleWriterAiRequest(req, res) {
    try {
      const bodyErrors = validateAiRequestBody(req.body, options);
      if (bodyErrors.length > 0) {
        return res.status(400).json({
          success: false,
          error: bodyErrors.join(". "),
        });
      }

      const chapter = await findOwnedChapterForUser(req.body.chapterId, req.session.user);
      if (!chapter) {
        return res.status(404).json({
          success: false,
          error: "Chapter not found",
        });
      }

      if (chapter === "forbidden") {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const aiContext = await buildAiContext(chapter, req.body, req.session.user);
      const result = await generateWriterAiOutput(tool, aiContext);

      return res.json({
        success: true,
        data: {
          tool,
          label: getToolDefinition(tool)?.label || "Writer AI",
          outputText: result.text,
          provider: result.provider,
          model: result.model,
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message || "Failed to generate AI output",
      });
    }
  };
}

module.exports = {
  storyIdea: createAiHandler("story-idea"),
  generateChapter: createAiHandler("generate-chapter"),
  rewriteScene: createAiHandler("rewrite-scene", { requireSelectedText: true }),
  improveDialogue: createAiHandler("improve-dialogue", { requireSelectedText: true }),
  continueWriting: createAiHandler("continue-writing"),
  expandScene: createAiHandler("expand-scene", { requireSelectedText: true }),
  createChapterTitle: createAiHandler("create-chapter-title"),
};
