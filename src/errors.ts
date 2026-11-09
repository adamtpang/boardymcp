export type BoardyErrorCode =
  | "unsupported"
  | "not_found"
  | "validation"
  | "not_configured"
  | "approval_required"
  | "upstream";

export class BoardyError extends Error {
  readonly code: BoardyErrorCode;
  readonly status: number;

  constructor(message: string, code: BoardyErrorCode, status = 400) {
    super(message);
    this.name = "BoardyError";
    this.code = code;
    this.status = status;
  }
}

export function isBoardyError(error: unknown): error is BoardyError {
  return error instanceof BoardyError;
}
