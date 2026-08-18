/**
 * The Antikythera domain model in TypeScript.
 *
 * These mirror the Python classes in `antikythera.models.tasks`, which subclass
 * `compas.data.Data`. Both languages present the same model so a message means the same
 * thing on either side of the wire; `conversions.ts` maps them to and from protobuf.
 */

export enum ExecutionMode {
  EXCLUSIVE = "exclusive",
  COMPETITIVE = "competitive",
}

export enum TaskState {
  UNSPECIFIED = "unspecified",
  PENDING = "pending",
  READY = "ready",
  RUNNING = "running",
  SUCCEEDED = "succeeded",
  FAILED = "failed",
}

export class TaskError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;

  constructor(input: { code: string; message: string; details?: unknown }) {
    this.code = input.code;
    this.message = input.message;
    this.details = input.details;
  }
}

export class TaskAssignmentMessage {
  readonly id: string;
  readonly type: string;
  readonly inputs: Record<string, unknown>;
  readonly outputKeys: string[];
  readonly params: Record<string, unknown>;
  readonly context: Record<string, unknown>;
  readonly timestamp: Date;
  readonly executionMode: ExecutionMode;

  /**
   * The params as they arrived on the wire, undecoded.
   *
   * A simulated output forwarded by the stand-in agent must be echoed back byte for byte:
   * a param is not necessarily a container or a primitive by the time it gets here, since
   * compas_pb may have serialized it with a native message type this package has no reason
   * to understand.
   */
  readonly rawParams: Record<string, unknown>;

  constructor(input: {
    id: string;
    type: string;
    inputs?: Record<string, unknown>;
    outputKeys?: string[];
    params?: Record<string, unknown>;
    context?: Record<string, unknown>;
    timestamp?: Date;
    executionMode?: ExecutionMode;
    rawParams?: Record<string, unknown>;
  }) {
    this.id = input.id;
    this.type = input.type;
    this.inputs = input.inputs ?? {};
    this.outputKeys = input.outputKeys ?? [];
    this.params = input.params ?? {};
    this.context = input.context ?? {};
    this.timestamp = input.timestamp ?? new Date();
    this.executionMode = input.executionMode ?? ExecutionMode.EXCLUSIVE;
    this.rawParams = input.rawParams ?? {};
  }
}

export class TaskClaimRequest {
  readonly taskId: string;
  readonly agentId: string;
  readonly timestamp: Date;

  constructor(input: { taskId: string; agentId: string; timestamp?: Date }) {
    this.taskId = input.taskId;
    this.agentId = input.agentId;
    this.timestamp = input.timestamp ?? new Date();
  }
}

export class TaskAllocationMessage {
  readonly taskId: string;
  readonly assignedAgentId: string;
  readonly timestamp: Date;

  constructor(input: {
    taskId: string;
    assignedAgentId: string;
    timestamp?: Date;
  }) {
    this.taskId = input.taskId;
    this.assignedAgentId = input.assignedAgentId;
    this.timestamp = input.timestamp ?? new Date();
  }
}

export class TaskCompletionMessage {
  readonly id: string;
  readonly state: TaskState;
  readonly agentId: string;
  readonly outputs: Record<string, unknown>;
  readonly error?: TaskError;
  readonly timestamp: Date;
  readonly durationMs?: number;

  constructor(input: {
    id: string;
    state: TaskState;
    agentId: string;
    outputs?: Record<string, unknown>;
    error?: TaskError;
    timestamp?: Date;
    durationMs?: number;
  }) {
    this.id = input.id;
    this.state = input.state;
    this.agentId = input.agentId;
    this.outputs = input.outputs ?? {};
    this.error = input.error;
    this.timestamp = input.timestamp ?? new Date();
    this.durationMs = input.durationMs;
  }
}

export class TaskCompletionAckMessage {
  readonly id: string;
  readonly state: TaskState;
  readonly acceptedAgentId: string;
  readonly timestamp: Date;

  constructor(input: {
    id: string;
    state: TaskState;
    acceptedAgentId: string;
    timestamp?: Date;
  }) {
    this.id = input.id;
    this.state = input.state;
    this.acceptedAgentId = input.acceptedAgentId;
    this.timestamp = input.timestamp ?? new Date();
  }
}
