function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidAudioUrl(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  if (value.startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function validateCreateAudioSchema(body) {
  const errors = [];

  if (!isNonEmptyString(body.title)) {
    errors.push("title is required and must be a non-empty string");
  }

  if (!isValidAudioUrl(body.audioUrl)) {
    errors.push("audioUrl must be a valid URL or stored file path starting with '/'");
  }

  const order = Number(body.order);
  if (!Number.isInteger(order) || order < 0) {
    errors.push("order is required and must be a non-negative integer");
  }

  if (body.duration !== undefined) {
    const duration = Number(body.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push("duration must be a positive number when provided");
    }
  }

  if (body.chapterId !== undefined && body.chapterId !== null && !isNonEmptyString(body.chapterId)) {
    errors.push("chapterId must be a non-empty string when provided");
  }

  return errors;
}

function validateUpdateAudioSchema(body) {
  const errors = [];

  if (body.title !== undefined && !isNonEmptyString(body.title)) {
    errors.push("title must be a non-empty string");
  }

  if (body.audioUrl !== undefined && !isValidAudioUrl(body.audioUrl)) {
    errors.push("audioUrl must be a valid URL or stored file path starting with '/'");
  }

  if (body.order !== undefined) {
    const order = Number(body.order);
    if (!Number.isInteger(order) || order < 0) {
      errors.push("order must be a non-negative integer");
    }
  }

  if (body.duration !== undefined && body.duration !== null) {
    const duration = Number(body.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push("duration must be a positive number when provided");
    }
  }

  if (body.chapterId !== undefined && body.chapterId !== null && !isNonEmptyString(body.chapterId)) {
    errors.push("chapterId must be a non-empty string when provided");
  }

  return errors;
}

module.exports = {
  createAudioSchema: validateCreateAudioSchema,
  updateAudioSchema: validateUpdateAudioSchema,
};
