import { bodyLimit } from 'hono/body-limit';
import { errorCodes } from '../errors.js';

const MAX_JSON_BYTES = 1024 * 1024;

// Streaming limit: counts request bytes as they arrive, so chunked requests
// without a content-length header cannot bypass it.
export const jsonBodyLimit = bodyLimit({
  maxSize: MAX_JSON_BYTES,
  onError: (c) => c.json({ error: { code: errorCodes.VALIDATION, message: 'request body too large (max 1048576 bytes)' } }, 413),
});
