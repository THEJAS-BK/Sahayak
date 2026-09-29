export const Status = {
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  Conflict: 409,
  TooManyRequests: 429,
  ServerError: 500,
  /** The server is missing configuration it needs to serve the request. */
  ServiceUnavailable: 503,
} as const

export type StatusCode = (typeof Status)[keyof typeof Status]

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(code: string, message: string, status: number = Status.ServerError, details?: unknown) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

export const errors = {
  badRequest: (message = 'Invalid input', code = 'INVALID_INPUT', details?: unknown) =>
    new ApiError(code, message, Status.BadRequest, details),
  unauthorized: (message = 'Authentication required') =>
    new ApiError('UNAUTHENTICATED', message, Status.Unauthorized),
  /**
   * A wrong/expired OTP. Deliberately *not* UNAUTHENTICATED: that code means
   * "your access token is no good", and clients react to it by discarding the
   * session and redirecting to sign in again. A mistyped code on the sign-in
   * form must not throw away a valid session or claim the token expired.
   */
  invalidOtp: (message = 'Invalid or expired code') =>
    new ApiError('INVALID_OTP', message, Status.Unauthorized),
  forbidden: (code = 'FORBIDDEN', message = 'Not allowed') =>
    new ApiError(code, message, Status.Forbidden),
  notFound: (message = 'Not found') => new ApiError('NOT_FOUND', message, Status.NotFound),
  conflict: (code = 'CONFLICT', message = 'Conflict') => new ApiError(code, message, Status.Conflict),
  invalidState: (message: string) => new ApiError('INVALID_STATE', message, Status.Conflict),
  tooMany: (message = 'Too many attempts, slow down') =>
    new ApiError('RATE_LIMITED', message, Status.TooManyRequests),
  /**
   * The server cannot serve this request because it is not configured to.
   * Deliberately 5xx and not 400: nothing the client sent is wrong, so a
   * client must not respond by changing its request or retrying immediately.
   */
  serviceUnavailable: (code = 'SERVICE_UNAVAILABLE', message = 'Not available on this server') =>
    new ApiError(code, message, Status.ServiceUnavailable),
  server: (message = 'Internal server error') => new ApiError('INTERNAL', message, Status.ServerError),
} as const