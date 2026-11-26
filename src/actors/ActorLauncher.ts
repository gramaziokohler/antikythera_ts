import { pbDump, pbLoadBytes } from "@gramaziokohler/compas-pb-ts";
import {
  adjectives,
  animals,
  colors,
  countries,
  uniqueNamesGenerator,
} from "unique-names-generator";

import {
  TaskAllocationMessage,
  TaskAssignmentMessage,
  TaskClaimRequest,
  TaskCompletionAckMessage,
  TaskCompletionMessage,
  TaskState,
} from "../models/tasks";
import { registerAntikytheraTypes } from "../models/conversions";
import type { Actor } from "./Actor";
import type { MqttService } from "./MqttService";
import { ExecutionContext } from "./ExecutionContext";
import { Task } from "./Task";

/**
 * A readable actor id, of the same shape as the Python launcher's
 * `coolname.generate_slug(4)`: "brave-red-panda-of-japan". Actors are identified by this
 * in logs and in the UI, so it needs to be recognisable at a glance rather than unique.
 */
function slug(value: string): string {
  // dictionary entries are not all plain words: countries bring dots, accents and
  // apostrophes ("U.S. Outlying Islands", "Cote d'Ivoire", "Aland Islands")
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function memorableActorId(): string {
  const name = uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    length: 3,
    separator: "-",
    style: "lowerCase",
  });
  const place = uniqueNamesGenerator({
    dictionaries: [countries],
    length: 1,
    style: "lowerCase",
  });

  return `${slug(name)}-of-${slug(place)}`;
}

export class ActorLauncher {
  private static instance: ActorLauncher;
  private mqttService: MqttService;
  private actors: Map<string, Actor> = new Map();

  private actorId: string;
  private pendingClaims: Map<string, TaskAssignmentMessage> = new Map();
  private activeTasks: Map<string, TaskAssignmentMessage> = new Map();
  private activeContexts: Map<string, ExecutionContext> = new Map();
  private messageHandlerCleanup: (() => void) | undefined;

  private constructor(mqttService: MqttService, actorId?: string) {
    // Nothing crosses the wire until Antikythera's types are registered with the
    // compas_pb runtime; there is no entry-point discovery in JavaScript.
    registerAntikytheraTypes();

    this.mqttService = mqttService;
    this.actorId = actorId ?? memorableActorId();

    console.log(`Initializing Actor Launcher ${this.actorId}`);

    // Register message handler
    this.messageHandlerCleanup = this.mqttService.onMessage(
      this.onMessage.bind(this),
    );

    // Subscribe to topics
    this.initializeSubscriptions();
  }

  public static getInstance(
    mqttService?: MqttService,
    actorId?: string,
  ): ActorLauncher {
    if (!ActorLauncher.instance) {
      if (!mqttService) {
        throw new Error(
          "ActorLauncher must be initialized with MqttService first",
        );
      }
      ActorLauncher.instance = new ActorLauncher(mqttService, actorId);
    }
    return ActorLauncher.instance;
  }

  public getActorId(): string {
    return this.actorId;
  }

  public registerActor(actor: Actor) {
    if (this.actors.has(actor.type)) {
      console.warn(
        `Actor type ${actor.type} is already registered. Overwriting.`,
      );
    }
    console.log(`Registering actor: ${actor.type}`);
    this.actors.set(actor.type, actor);
  }

  public unregisterActor(actorType: string) {
    this.actors.delete(actorType);
  }

  protected async initializeSubscriptions() {
    await this.mqttService.subscribe("antikythera/task/start");
    await this.mqttService.subscribe("antikythera/task/allocation");
    await this.mqttService.subscribe("antikythera/task/ack");
  }

  protected onMessage(_topic: string, message: Buffer) {
    try {
      // One decode for every topic: the registry resolves the envelope to whichever
      // domain message it carries, so there is nothing to switch on by type URL.
      const decoded = pbLoadBytes(new Uint8Array(message));

      if (decoded instanceof TaskAssignmentMessage) {
        this.handleTaskStart(decoded);
      } else if (decoded instanceof TaskAllocationMessage) {
        void this.handleTaskAllocation(decoded);
      } else if (decoded instanceof TaskCompletionAckMessage) {
        this.handleCompletionAck(decoded);
      }
    } catch (err) {
      console.error("Error processing message:", err);
    }
  }

  protected handleCompletionAck(ack: TaskCompletionAckMessage) {
    if (ack.acceptedActorId === this.actorId) {
      return;
    }
    const context = this.activeContexts.get(ack.id);
    if (context) {
      console.warn(
        `[${ack.id}] received ACK for ${ack.acceptedActorId}, cancelling local execution.`,
      );
      context.cancel();
    }
  }

  protected handleTaskStart(task: TaskAssignmentMessage) {
    if (!task.type || !task.id) return;

    // Parse task type: {actor_type}.{tool_name}
    const { actor, toolName } = this.findActorForTaskType(task.type);

    if (actor && toolName) {
      console.log(
        `Task ${task.id} (${task.type}) matches actor ${actor.type}, tool ${toolName}. Claiming...`,
      );
      this.pendingClaims.set(task.id, task);

      const claim = new TaskClaimRequest({
        taskId: task.id,
        actorId: this.actorId,
      });
      this.mqttService.publish("antikythera/task/claim", pbDump(claim));
    }
  }

  private findActorForTaskType(taskType: string): {
    actor: Actor | null;
    toolName: string | null;
  } {
    // Try to match registered actors
    // We iterate over all registered actors and see if the taskType starts with the actor.type + "."
    for (const actor of this.actors.values()) {
      const prefix = actor.type + ".";
      if (taskType.startsWith(prefix)) {
        const toolName = taskType.substring(prefix.length);
        // Actors that claim every tool under their prefix (e.g. a stand-in) implement
        // canHandleTool instead of one method per tool.
        const handlesTool = actor.canHandleTool
          ? actor.canHandleTool(toolName)
          : typeof actor[toolName] === "function";
        if (handlesTool) {
          return { actor, toolName };
        }
      }
    }
    return { actor: null, toolName: null };
  }

  protected async handleTaskAllocation(allocation: TaskAllocationMessage) {
    if (allocation.assignedActorId === this.actorId) {
      const taskId = allocation.taskId;
      const task = this.pendingClaims.get(taskId);

      if (task) {
        console.log(`Task ${taskId} allocated to me. Executing...`);
        this.pendingClaims.delete(taskId);
        this.activeTasks.set(taskId, task);

        await this.executeTask(task);
      } else {
        console.warn(
          `Task ${taskId} allocated but not found in pending claims.`,
        );
      }
    }
  }

  protected async executeTask(task: TaskAssignmentMessage) {
    const { actor, toolName } = this.findActorForTaskType(task.type);

    if (!actor || !toolName) {
      console.error(
        `Could not find actor/tool for allocated task ${task.type}`,
      );
      this.completeTask(task.id, null, TaskState.FAILED);
      return;
    }

    // Create Execution Context
    const context = new ExecutionContext();
    this.activeContexts.set(task.id, context);

    try {
      // Create Task instance
      const taskInstance = new Task(task);

      // Invoke tool. Actors with no method named after the tool (i.e. those that matched
      // via canHandleTool) are invoked generically through invokeTool instead.
      console.log(`Invoking ${actor.type}.${toolName} for task ${task.id}`);
      const result =
        typeof actor[toolName] === "function"
          ? await actor[toolName](taskInstance, context)
          : await actor.invokeTool!(toolName, taskInstance, context);

      // If cancelled, we might not want to report success
      if (context.isCancelled) {
        console.log(`Task ${task.id} cancelled. Skipping completion message.`);
        return;
      }

      // Complete task
      this.completeTask(task.id, result, TaskState.SUCCEEDED);
    } catch (error: any) {
      if (context.isCancelled) {
        console.log(`Task ${task.id} cancelled during exception handling.`);
        return;
      }
      console.error(`Error executing task ${task.id}:`, error);
      this.completeTask(task.id, null, TaskState.FAILED);
    } finally {
      this.activeContexts.delete(task.id);
    }
  }

  protected completeTask(taskId: string, outputs: any, state: TaskState) {
    console.log(`Completing task ${taskId} with state ${state}`);

    const completion = new TaskCompletionMessage({
      id: taskId,
      state,
      actorId: this.actorId,
      outputs: outputs && typeof outputs === "object" ? outputs : {},
    });

    this.mqttService.publish("antikythera/task/completed", pbDump(completion));
    this.activeTasks.delete(taskId);
  }

  public dispose() {
    console.log(`Disposing Actor Launcher ${this.actorId}`);
    if (this.messageHandlerCleanup) {
      this.messageHandlerCleanup();
    }
  }
}
