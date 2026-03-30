function validateListeningProgressBody(body) {
  const errors = [];

  if (!body.bookId || typeof body.bookId !== "string" || body.bookId.trim().length === 0) {
    errors.push("bookId is required");
  }

  if (!body.audioTrackId || typeof body.audioTrackId !== "string" || body.audioTrackId.trim().length === 0) {
    errors.push("audioTrackId is required");
  }

  const seconds = Number(body.currentTimeSeconds);
  if (Number.isNaN(seconds) || seconds < 0) {
    errors.push("currentTimeSeconds must be a non-negative number");
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
  validateListeningProgressBody,
  validateBookId,
};
