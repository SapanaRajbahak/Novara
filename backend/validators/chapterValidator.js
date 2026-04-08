function validateId(id, fieldName) {
  const errors = [];
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    errors.push(`${fieldName} is required`);
  }
  return errors;
}

function validateCreateChapter(body) {
  const errors = [];

  if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    errors.push("title is required and must be a non-empty string");
  }

  if (
    body.content === undefined ||
    typeof body.content !== "string" ||
    body.content.trim().length === 0
  ) {
    errors.push("content is required and must be a non-empty string");
  }

  const number = Number(body.chapterNumber);
  if (!Number.isInteger(number) || number < 1) {
    errors.push("chapterNumber is required and must be a positive integer");
  }

  if (body.isPublished !== undefined && typeof body.isPublished !== "boolean") {
    errors.push("isPublished must be a boolean");
  }

  return errors;
}

function validateUpdateChapter(body) {
  const errors = [];

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      errors.push("title must be a non-empty string");
    }
  }

  if (body.content !== undefined) {
    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      errors.push("content must be a non-empty string");
    }
  }

  if (body.chapterNumber !== undefined) {
    const number = Number(body.chapterNumber);
    if (!Number.isInteger(number) || number < 1) {
      errors.push("chapterNumber must be a positive integer");
    }
  }

  if (body.isPublished !== undefined && typeof body.isPublished !== "boolean") {
    errors.push("isPublished must be a boolean");
  }

  return errors;
}

module.exports = {
  validateId,
  validateCreateChapter,
  validateUpdateChapter,
};
