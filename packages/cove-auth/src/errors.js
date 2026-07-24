export class CoveAuthError extends Error {
  constructor(message, { code, kind, status, retryable = false, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = this.constructor.name;
    this.code = code || "configuration_error";
    this.kind = kind || "configuration";
    this.status = status || 500;
    this.retryable = retryable;
  }

  toJSON() {
    return {
      error: "cove_access_error",
      code: this.code,
      kind: this.kind,
      message: this.message,
      retryable: this.retryable,
    };
  }
}

export class CoveSignedOutError extends CoveAuthError {
  constructor(message = "Sign in through Cove to continue.", options = {}) {
    super(message, { ...options, code: "authentication_required", kind: "signed_out", status: 401 });
  }
}

export class CoveUnauthorizedError extends CoveAuthError {
  constructor(message = "You do not have access to this application.", options = {}) {
    super(message, { ...options, code: options.code || "access_denied", kind: "unauthorized", status: 403 });
  }
}

export class CoveConfigurationError extends CoveAuthError {
  constructor(message = "Cove authentication is not configured correctly.", options = {}) {
    super(message, { ...options, code: options.code || "configuration_error", kind: "configuration", status: 500 });
  }
}

export class CoveServiceUnavailableError extends CoveAuthError {
  constructor(message = "Cove access checks are temporarily unavailable.", options = {}) {
    super(message, { ...options, code: "service_unavailable", kind: "service_unavailable", status: 503, retryable: true });
  }
}

export function isCoveAuthError(error) {
  return error instanceof CoveAuthError;
}

export function errorFromAccessDenial(denial) {
  switch (denial.code) {
    case "authentication_required":
      return new CoveSignedOutError(denial.message);
    case "access_denied":
    case "role_required":
      return new CoveUnauthorizedError(denial.message, { code: denial.code });
    case "invalid_request":
    case "configuration_error":
      return new CoveConfigurationError(denial.message, { code: denial.code });
    case "service_unavailable":
      return new CoveServiceUnavailableError(denial.message);
    default:
      return new CoveServiceUnavailableError("Cove returned an unrecognised access decision.");
  }
}
