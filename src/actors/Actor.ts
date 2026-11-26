import type { Task } from "./Task";
import type { ExecutionContext } from "./ExecutionContext";

export type ToolFunction = (
  task: Task,
  context?: ExecutionContext,
) => Promise<any>;

export interface Actor {
  /**
   * The type of the actor.
   * Used for matching task types: "{actor.type}.{tool_name}"
   */
  type: string;

  /**
   * Optional predicate: does this actor handle the given tool name (the part of the task
   * type after "{actor.type}."). Defaults to `typeof actor[toolName] === 'function'` when
   * omitted. Implement this instead for an actor that claims every tool under its prefix
   * rather than one method per tool (e.g. a stand-in actor).
   */
  canHandleTool?(toolName: string): boolean;

  /**
   * Optional generic tool invocation, used in place of calling `actor[toolName](task, context)`
   * when no method named after the tool exists on the actor. Required if `canHandleTool` is
   * implemented and no per-tool methods exist.
   */
  invokeTool?(
    toolName: string,
    task: Task,
    context?: ExecutionContext,
  ): Promise<any>;

  /**
   * Index signature to allow dynamic access to tool methods.
   * Tool methods should accept a Task instance and return a Promise that resolves to the output of the task.
   */
  [key: string]: any;
}
