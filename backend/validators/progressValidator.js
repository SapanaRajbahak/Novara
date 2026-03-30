function validateReadingProgressBody(body) {
  const errors = [];

  if (!body.bookId || typeof body.bookId !== "string" || body.bookId.trim().length === 0) {
    errors.push("bookId is required");
  }

  if (!body.chapterId || typeof body.chapterId !== "string" || body.chapterId.trim().length === 0) {
    errors.push("chapterId is required");
  }

  const percent = Number(body.progressPercent);
  if (Number.isNaN(percent) || percent < 0 || percent > 100) {
    errors.push("progressPercent must be a number between 0 and 100");
  }

  if (body.lastLocation !== undefined && typeof body.lastLocation !== "string") {
    errors.push("lastLocation must be a string when provided");
  }

  return errors;
}

function validateBookId(bookId) {
  if (!bookId || typeof bookId !== "string" || bookId.trim().length === 0) {
    return ["bookId is required"];
  }

  return [];
}

module.exports = {
  validateReadingProgressBody,
  validateBookId,
};
