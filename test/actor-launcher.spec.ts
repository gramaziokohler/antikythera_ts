import { pbDump, pbLoadBytes } from "@gramaziokohler/compas-pb-ts";
import { beforeEach, describe, expect, it } from "vitest";

import {
  TaskAllocationMessage,
  TaskAssignmentMessage,
  TaskClaimRequest,
  TaskCompletionMessage,
  TaskState,
  registerAntikytheraTypes,
} from "../src";
import { ActorLauncher, type Actor } from "../src/actors";
import type { Task } from "../src/actors";

/** Captures what the launcher publishes, and lets a test push messages at it. */
class FakeMqttService {
  readonly published: Array<{ topic: string; payload: Uint8Array }> = [];
  readonly subscribed: string[] = [];
  private handlers = new Set<(topic: string, message: Buffer) => void>();

  async subscribe(topic: string) {
    this.subscribed.push(topic);
  }

  publish(topic: string, payload: Uint8Array) {
    this.published.push({ topic, payload });
  }

  onMessage(handler: (topic: string, message: Buffer) => void) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  deliver(topic: string, payload: Uint8Array) {
    for (const handler of this.handlers) {
      handler(topic, payload as unknown as Buffer);
    }
  }

  /** The domain message published on a topic, decoded. */
  sentOn(topic: string) {
    const entry = this.published.find((item) => item.topic === topic);
    return entry ? pbLoadBytes(entry.payload) : undefined;
  }
}

// getInstance is a singleton, so each test drives its own instance directly.
function newLauncher(mqtt: FakeMqttService, actorId: string) {
  return new (
    ActorLauncher as unknown as new (
      mqtt: unknown,
      actorId: string,
    ) => ActorLauncher
  )(mqtt, actorId);
}

describe("ActorLauncher", () => {
  let mqtt: FakeMqttService;
  let launcher: ActorLauncher;

  beforeEach(() => {
    registerAntikytheraTypes();
    mqtt = new FakeMqttService();
    launcher = newLauncher(mqtt, "actor-under-test");
  });

  const assignment = (id: string, type: string, params = {}) =>
    pbDump(
      new TaskAssignmentMessage({ id, type, params, outputKeys: ["result"] }),
    );

  it("claims a task whose type matches a registered actor", () => {
    launcher.registerActor({
      type: "demo",
      async tool() {
        return {};
      },
    } as unknown as Actor);

    mqtt.deliver("antikythera/task/start", assignment("task-1", "demo.tool"));

    const claim = mqtt.sentOn("antikythera/task/claim");
    expect(claim).toBeInstanceOf(TaskClaimRequest);
    expect(claim.taskId).toBe("task-1");
    expect(claim.actorId).toBe("actor-under-test");
  });

  it("ignores a task no registered actor handles", () => {
    mqtt.deliver("antikythera/task/start", assignment("task-1", "nobody.tool"));
    expect(mqtt.published).toHaveLength(0);
  });

  it("executes on allocation and publishes the tool's outputs", async () => {
    launcher.registerActor({
      type: "demo",
      async tool(task: Task) {
        return { result: `ran ${task.id}`, count: 2 };
      },
    } as unknown as Actor);

    mqtt.deliver("antikythera/task/start", assignment("task-2", "demo.tool"));
    mqtt.deliver(
      "antikythera/task/allocation",
      pbDump(
        new TaskAllocationMessage({
          taskId: "task-2",
          assignedActorId: "actor-under-test",
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const completion = mqtt.sentOn("antikythera/task/completed");
    expect(completion).toBeInstanceOf(TaskCompletionMessage);
    expect(completion.state).toBe(TaskState.SUCCEEDED);
    expect(completion.outputs).toEqual({ result: "ran task-2", count: 2 });
  });

  it("reports a failed state when the tool throws", async () => {
    launcher.registerActor({
      type: "demo",
      async tool() {
        throw new Error("boom");
      },
    } as unknown as Actor);

    mqtt.deliver("antikythera/task/start", assignment("task-3", "demo.tool"));
    mqtt.deliver(
      "antikythera/task/allocation",
      pbDump(
        new TaskAllocationMessage({
          taskId: "task-3",
          assignedActorId: "actor-under-test",
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mqtt.sentOn("antikythera/task/completed").state).toBe(
      TaskState.FAILED,
    );
  });

  it("does not execute a task allocated to a different actor", async () => {
    launcher.registerActor({
      type: "demo",
      async tool() {
        return {};
      },
    } as unknown as Actor);

    mqtt.deliver("antikythera/task/start", assignment("task-4", "demo.tool"));
    mqtt.deliver(
      "antikythera/task/allocation",
      pbDump(
        new TaskAllocationMessage({
          taskId: "task-4",
          assignedActorId: "someone-else",
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mqtt.sentOn("antikythera/task/completed")).toBeUndefined();
  });
});

describe("actor ids", () => {
  it("are readable, in the shape the Python launcher produces", () => {
    // e.g. "brave-red-panda-of-japan", matching coolname.generate_slug(4). Actors are
    // identified by this in logs and in the UI, so a random string is not good enough.
    const ids = Array.from({ length: 20 }, () =>
      newLauncher(
        new FakeMqttService(),
        undefined as unknown as string,
      ).getActorId(),
    );

    for (const id of ids) {
      expect(id).toMatch(/^[a-z]+-[a-z]+-[a-z]+-of-[a-z-]+$/);
    }
    // and not all the same
    expect(new Set(ids).size).toBeGreaterThan(1);
  });

  it("accepts an explicit id", () => {
    expect(newLauncher(new FakeMqttService(), "given-name").getActorId()).toBe(
      "given-name",
    );
  });
});
