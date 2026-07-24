export type CoveAuthErrorKind =
  | "signed_out"
  | "unauthorized"
  | "configuration"
  | "service_unavailable";

export type CoveAuthErrorOptions = {
  code?: string;
  kind?: CoveAuthErrorKind;
  status?: number;
  retryable?: boolean;
  cause?: unknown;
};

export declare class CoveAuthError extends Error {
  readonly code: string;
  readonly kind: CoveAuthErrorKind;
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, options?: CoveAuthErrorOptions);
  toJSON(): {
    error: "cove_access_error";
    code: string;
    kind: CoveAuthErrorKind;
    message: string;
    retryable: boolean;
  };
}

export declare class CoveSignedOutError extends CoveAuthError {
  constructor(message?: string, options?: CoveAuthErrorOptions);
}

export declare class CoveUnauthorizedError extends CoveAuthError {
  constructor(message?: string, options?: CoveAuthErrorOptions);
}

export declare class CoveConfigurationError extends CoveAuthError {
  constructor(message?: string, options?: CoveAuthErrorOptions);
}

export declare class CoveServiceUnavailableError extends CoveAuthError {
  constructor(message?: string, options?: CoveAuthErrorOptions);
}

export declare function isCoveAuthError(error: unknown): error is CoveAuthError;

export declare function errorFromAccessDenial(denial: {
  code: string;
  message: string;
}): CoveAuthError;
