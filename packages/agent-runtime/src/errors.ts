export class RuntimeError extends Error {
  readonly code: string;
  readonly context: Readonly<Record<string, string | number | boolean | null>>;

  constructor(code: string, message: string, context: Readonly<Record<string, string | number | boolean | null>> = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.context = context;
  }
}

export class ConfigurationError extends RuntimeError {
  constructor(message: string, context: Readonly<Record<string, string | number | boolean | null>> = {}) {
    super("configuration_invalid", message, context);
  }
}

export class KeyFileError extends RuntimeError {
  constructor(message: string, keyFilePath: string) {
    super("key_file_invalid", message, { keyFilePath });
  }
}

export class ModelProviderError extends RuntimeError {
  constructor(message: string, context: Readonly<Record<string, string | number | boolean | null>> = {}) {
    super("model_provider_failed", message, context);
  }
}

export class AgentStateError extends RuntimeError {
  constructor(message: string, context: Readonly<Record<string, string | number | boolean | null>> = {}) {
    super("agent_state_invalid", message, context);
  }
}
