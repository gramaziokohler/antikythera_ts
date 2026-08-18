import type { TaskAssignmentMessage } from "../models/tasks";

/**
 * A task as an agent sees it.
 *
 * A thin view over the domain message: decoding happened in the conversions plugin, so
 * `inputs`, `params` and `context` are already plain JavaScript values, and geometry
 * arrives as the wrapper classes compas_pb_ts registers rather than as raw protobuf.
 */
export class Task {
  constructor(private readonly message: TaskAssignmentMessage) {}

  get id(): string {
    return this.message.id;
  }

  get type(): string {
    return this.message.type;
  }

  get inputs(): Record<string, unknown> {
    return this.message.inputs;
  }

  get params(): Record<string, unknown> {
    return this.message.params;
  }

  get context(): Record<string, unknown> {
    return this.message.context;
  }

  /**
   * Names of the outputs this task declares in its blueprint. Empty for a task that
   * declares none, which is not the same as a task whose outputs have no value yet -- a
   * distinction the simulation stand-in depends on.
   */
  get outputKeys(): string[] {
    return this.message.outputKeys;
  }

  /** The params exactly as they arrived, for forwarding a value without re-encoding it. */
  getRawParams(): Record<string, unknown> {
    return this.message.rawParams;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      inputs: this.inputs,
      params: this.params,
      context: this.context,
    };
  }
}
