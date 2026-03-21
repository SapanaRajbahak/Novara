/**
 * Book validation helpers.
 * No external library needed — plain JS keeps things simple and dependency-free.
 * Each function returns an array of error strings.  An empty array means valid.
 */

// Must match the Prisma schema enums exactly
const VALID_FILE_TYPES = ["EPUB", "PDF", "TXT"];
const VALID_STATUSES = ["DRAFT", "PUBLISHED"];
const VALID_SORT_OPTIONS = ["newest", "oldest", "title_asc", "title_desc"];
const VALID_DISCOVER_SORT_OPTIONS = ["newest", "popular", "title_asc"];
const VALID_DISCOVER_TYPES = ["ebook", "audiobook", "both"];

/**
 * Validate the body of a CREATE book request.
 * - title and authorName are required
 * - all other fields are optional but must be the correct type when present
 */
function validateCreateBook(body) {
  const errors = [];

  if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
    errors.push("title is required and must be a non-empty string");
  }

  if (
    !body.authorName ||
    typeof body.authorName !== "string" ||
    body.authorName.trim().length === 0
  ) {
    errors.push("authorName is required and must be a non-empty string");
  }

  if (body.fileType !== undefined && !VALID_FILE_TYPES.includes(body.fileType)) {
    errors.push(`fileType must be one of: ${VALID_FILE_TYPES.join(", ")}`);
  }

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== "string")) {
      errors.push("tags must be an array of strings");
    }
  }

  if (
    body.isAudiobookAvailable !== undefined &&
    typeof body.isAudiobookAvailable !== "boolean"
  ) {
    errors.push("isAudiobookAvailable must be a boolean");
  }

  if (body.isAiGenerated !== undefined && typeof body.isAiGenerated !== "boolean") {
    errors.push("isAiGenerated must be a boolean");
  }

  return errors;
}

/**
 * Validate the body of an UPDATE book request.
 * All fields are optional — only validates the ones that are actually present.
 */
function validateUpdateBook(body) {
  const errors = [];

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      errors.push("title must be a non-empty string");
    }
  }

  if (body.authorName !== undefined) {
    if (typeof body.authorName !== "string" || body.authorName.trim().length === 0) {
      errors.push("authorName must be a non-empty string");
    }
  }

  if (body.fileType !== undefined && !VALID_FILE_TYPES.includes(body.fileType)) {
    errors.push(`fileType must be one of: ${VALID_FILE_TYPES.join(", ")}`);
  }

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== "string")) {
      errors.push("tags must be an array of strings");
    }
  }

  if (
    body.isAudiobookAvailable !== undefined &&
    typeof body.isAudiobookAvailable !== "boolean"
  ) {
    errors.push("isAudiobookAvailable must be a boolean");
  }

  if (body.isAiGenerated !== undefined && typeof body.isAiGenerated !== "boolean") {
    errors.push("isAiGenerated must be a boolean");
  }

  return errors;
}

/**
 * Validate query parameters for the GET /api/books list endpoint.
 * Query string values arrive as strings, so booleans are checked as "true"/"false".
 */
function validateListQuery(query) {
  const errors = [];

  if (query.page !== undefined) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      errors.push("page must be a positive integer");
    }
  }

  if (query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      errors.push("limit must be an integer between 1 and 100");
    }
  }

  if (query.sort !== undefined && !VALID_SORT_OPTIONS.includes(query.sort)) {
    errors.push(`sort must be one of: ${VALID_SORT_OPTIONS.join(", ")}`);
  }

  if (
    query.isAudiobookAvailable !== undefined &&
    !["true", "false"].includes(query.isAudiobookAvailable)
  ) {
    errors.push("isAudiobookAvailable query param must be 'true' or 'false'");
  }

  if (
    query.isAiGenerated !== undefined &&
    !["true", "false"].includes(query.isAiGenerated)
  ) {
    errors.push("isAiGenerated query param must be 'true' or 'false'");
  }

  return errors;
}

/**
 * Validate query parameters for GET /api/admin/books.
 * Same as public list query, plus optional status filtering.
 */
function validateAdminListQuery(query) {
  const errors = validateListQuery(query);

  if (query.status !== undefined && !VALID_STATUSES.includes(query.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  return errors;
}

function validateDiscoverQuery(query) {
  const errors = [];

  if (query.page !== undefined) {
    const page = Number(query.page);
    if (!Number.isInteger(page) || page < 1) {
      errors.push("page must be a positive integer");
    }
  }

  if (query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      errors.push("limit must be an integer between 1 and 200");
    }
  }

  if (query.sort !== undefined && !VALID_DISCOVER_SORT_OPTIONS.includes(query.sort)) {
    errors.push(`sort must be one of: ${VALID_DISCOVER_SORT_OPTIONS.join(", ")}`);
  }

  if (query.type !== undefined && !VALID_DISCOVER_TYPES.includes(query.type)) {
    errors.push(`type must be one of: ${VALID_DISCOVER_TYPES.join(", ")}`);
  }

  return errors;
}

function validateDiscoverSectionQuery(query) {
  const errors = [];

  if (query.limit !== undefined) {
    const limit = Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 24) {
      errors.push("limit must be an integer between 1 and 24");
    }
  }

  return errors;
}

module.exports = {
  validateCreateBook,
  validateUpdateBook,
  validateListQuery,
  validateAdminListQuery,
  validateDiscoverQuery,
  validateDiscoverSectionQuery,
};
