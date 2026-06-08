function validateAiRequestBody(body, options = {}) {
  const errors = [];
  const requireSelectedText = Boolean(options.requireSelectedText);

  if (!body || typeof body !== "object") {
    return ["Request body is required"];
  }

  if (!body.chapterId || typeof body.chapterId !== "string" || body.chapterId.trim().length === 0) {
    errors.push("chapterId is required");
  }

  if (body.instructions !== undefined) {
    if (typeof body.instructions !== "string") {
      errors.push("instructions must be a string");
    } else if (body.instructions.length > 4000) {
      errors.push("instructions must be 4000 characters or less");
    }
  }

  if (body.chapterTitle !== undefined) {
    if (typeof body.chapterTitle !== "string") {
      errors.push("chapterTitle must be a string");
    } else if (body.chapterTitle.trim().length === 0) {
      errors.push("chapterTitle cannot be blank");
    }
  }

  if (body.chapterContent !== undefined && typeof body.chapterContent !== "string") {
    errors.push("chapterContent must be a string");
  }

  if (body.selectedText !== undefined && typeof body.selectedText !== "string") {
    errors.push("selectedText must be a string");
  }

  if (requireSelectedText) {
    if (!body.selectedText || typeof body.selectedText !== "string" || body.selectedText.trim().length === 0) {
      errors.push("selectedText is required for this AI action");
    }
  }

  if (body.chapterNumber !== undefined) {
    const chapterNumber = Number(body.chapterNumber);
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      errors.push("chapterNumber must be a positive integer");
    }
  }

  ["selectionStart", "selectionEnd", "cursorPosition"].forEach((field) => {
    if (body[field] !== undefined) {
      const value = Number(body[field]);
      if (!Number.isInteger(value) || value < 0) {
        errors.push(`${field} must be a non-negative integer`);
      }
    }
  });

  ["bookTitle", "genre", "previousChapterSummary", "textBeforeCursor", "textAfterCursor"].forEach((field) => {
    if (body[field] !== undefined && typeof body[field] !== "string") {
      errors.push(`${field} must be a string`);
    }
  });

  return errors;
}

module.exports = {
  validateAiRequestBody,
};
