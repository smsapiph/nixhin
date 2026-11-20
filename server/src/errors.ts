import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode } from '../../shared/api.js';

/** An error that is safe to show to API clients as-is. */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: ApiErrorCode;

  constructor(status: ContentfulStatusCode, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export type UpstreamFailure = 'not_found' | 'bad_request' | 'unavailable' | 'bad_response';

/** A failure talking to Jikan. Mapped to a generic client-facing error; details stay in logs. */
export class UpstreamError extends Error {
  readonly kind: UpstreamFailure;

  constructor(kind: UpstreamFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UpstreamError';
    this.kind = kind;
  }
}
