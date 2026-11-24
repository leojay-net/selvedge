export class EngineError extends Error {
  readonly code: string;
  readonly context: Readonly<Record<string, string | number>>;

  constructor(code: string, message: string, context: Readonly<Record<string, string | number>> = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.context = context;
  }
}

export class TransactionParseError extends EngineError {
  constructor(message: string, context: Readonly<Record<string, string | number>> = {}) {
    super("transaction_parse_failed", message, context);
  }
}

export class SpecValidationError extends EngineError {
  constructor(message: string, context: Readonly<Record<string, string | number>> = {}) {
    super("spec_invalid", message, context);
  }
}

export class SimulationRpcError extends EngineError {
  constructor(message: string, context: Readonly<Record<string, string | number>> = {}) {
    super("simulation_rpc_failed", message, context);
  }
}

export class SimulationTimeoutError extends EngineError {
  constructor(rpcMethod: string, timeoutMilliseconds: number) {
    super("simulation_timeout", `RPC method ${rpcMethod} exceeded ${timeoutMilliseconds} ms`, {
      rpcMethod,
      timeoutMilliseconds,
    });
  }
}

export class PolicyRejection extends EngineError {
  readonly rejection: string;

  constructor(rejection: string) {
    super("policy_rejected", `Mandate policy rejected the operation: ${rejection}`, { rejection });
    this.rejection = rejection;
  }
}
