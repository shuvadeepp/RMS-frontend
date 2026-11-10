import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface ApiError {
  status: number;
  title: string;
  detail: string | null;
  rootCause: string | null;
  // Gemini busy / unavailable: the screen offers a Retry button.
  retryable: boolean;
}

interface BackendErrorBody {
  error?: string;
  detail?: string;
  root_cause?: string;
  message?: string;
}

// Turns an HTTP error (backend body: error, detail, root_cause) into something to show.
export function toApiError(error: unknown): ApiError {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: -1, title: 'Something went wrong.', detail: null, rootCause: null, retryable: true };
  }
  if (error.status === 0) {
    return {
      status: 0,
      title: 'Cannot reach the server.',
      detail: `Check that the backend is running at ${environment.apiBaseUrl} and that CORS is enabled.`,
      rootCause: null,
      retryable: true
    };
  }

  const body: BackendErrorBody = typeof error.error === 'object' && error.error !== null
    ? (error.error as BackendErrorBody)
    : { detail: typeof error.error === 'string' ? error.error : undefined };

  if (error.status === 503) {
    return {
      status: 503,
      title: 'The AI service is busy right now.',
      detail: body.detail ?? 'Please wait a few seconds and try again.',
      rootCause: body.root_cause ?? null,
      retryable: true
    };
  }

  return {
    status: error.status,
    title: body.error ?? body.message ?? `Request failed (HTTP ${error.status}).`,
    detail: body.detail ?? null,
    rootCause: body.root_cause ?? null,
    retryable: error.status >= 500
  };
}

export function getErrorMessage(error: unknown): string {
  const apiError = toApiError(error);
  return apiError.detail ? `${apiError.title} ${apiError.detail}` : apiError.title;
}
