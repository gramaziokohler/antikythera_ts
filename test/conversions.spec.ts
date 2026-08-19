import { pbDump, pbLoadBytes } from "@gramaziokohler/compas-pb-ts";
import { beforeAll, describe, expect, it } from "vitest";

import {
  ExecutionMode,
  TaskAllocationMessage,
  TaskAssignmentMessage,
  TaskClaimRequest,
  TaskCompletionAckMessage,
  TaskCompletionMessage,
  TaskError,
  TaskState,
  registerAntikytheraTypes,
} from "../src";

beforeAll(() => {
  registerAntikytheraTypes();
});

describe("Antikythera types on the compas_pb wire", () => {
  it("round-trips a task assignment as a domain object", () => {
    const assignment = new TaskAssignmentMessage({
      id: "task-1",
      type: "system.echo",
      inputs: { count: 3, ratio: 0.5, label: "hello", enabled: true },
      outputKeys: ["result"],
      params: { nested: [1, { deep: "value" }] },
      context: { session: "s-1" },
      executionMode: ExecutionMode.COMPETITIVE,
    });

    const loaded = pbLoadBytes(pbDump(assignment));

    // The registry hands back the domain class, not a protobuf message or a bare dict.
    expect(loaded).toBeInstanceOf(TaskAssignmentMessage);
    expect(loaded.id).toBe("task-1");
    expect(loaded.type).toBe("system.echo");
    expect(loaded.inputs).toEqual({
      count: 3,
      ratio: 0.5,
      label: "hello",
      enabled: true,
    });
    expect(loaded.outputKeys).toEqual(["result"]);
    expect(loaded.params).toEqual({ nested: [1, { deep: "value" }] });
    expect(loaded.context).toEqual({ session: "s-1" });
    expect(loaded.executionMode).toBe(ExecutionMode.COMPETITIVE);
  });

  it("keeps integers and floats distinct across the wire", () => {
    const assignment = new TaskAssignmentMessage({
      id: "t",
      type: "x.y",
      inputs: { whole: 7, fractional: 7.25 },
    });

    const loaded = pbLoadBytes(pbDump(assignment));
    expect(loaded.inputs.whole).toBe(7);
    expect(loaded.inputs.fractional).toBe(7.25);
  });

  it("round-trips a completion, including its error details", () => {
    const completion = new TaskCompletionMessage({
      id: "task-2",
      state: TaskState.FAILED,
      agentId: "agent-a",
      outputs: { partial: [1, 2] },
      error: new TaskError({
        code: "SCOPE_CONDITION_ERROR",
        message: "boom",
        details: { where: "condition", index: 2 },
      }),
      durationMs: 1250,
    });

    const loaded = pbLoadBytes(pbDump(completion));

    expect(loaded).toBeInstanceOf(TaskCompletionMessage);
    expect(loaded.state).toBe(TaskState.FAILED);
    expect(loaded.agentId).toBe("agent-a");
    expect(loaded.outputs).toEqual({ partial: [1, 2] });
    expect(loaded.error?.code).toBe("SCOPE_CONDITION_ERROR");
    expect(loaded.error?.details).toEqual({ where: "condition", index: 2 });
    expect(loaded.durationMs).toBe(1250);
  });

  it("round-trips the small control messages", () => {
    const claim = pbLoadBytes(
      pbDump(new TaskClaimRequest({ taskId: "t-1", agentId: "a-1" })),
    );
    expect(claim).toBeInstanceOf(TaskClaimRequest);
    expect([claim.taskId, claim.agentId]).toEqual(["t-1", "a-1"]);

    const allocation = pbLoadBytes(
      pbDump(
        new TaskAllocationMessage({ taskId: "t-1", assignedAgentId: "a-1" }),
      ),
    );
    expect(allocation).toBeInstanceOf(TaskAllocationMessage);
    expect(allocation.assignedAgentId).toBe("a-1");

    const ack = pbLoadBytes(
      pbDump(
        new TaskCompletionAckMessage({
          id: "t-1",
          state: TaskState.SUCCEEDED,
          acceptedAgentId: "a-2",
        }),
      ),
    );
    expect(ack).toBeInstanceOf(TaskCompletionAckMessage);
    expect(ack.state).toBe(TaskState.SUCCEEDED);
    expect(ack.acceptedAgentId).toBe("a-2");
  });

  it("preserves timestamps to the second", () => {
    const timestamp = new Date("2026-08-19T10:30:00.000Z");
    const loaded = pbLoadBytes(
      pbDump(new TaskClaimRequest({ taskId: "t", agentId: "a", timestamp })),
    );
    expect(loaded.timestamp.toISOString()).toBe(timestamp.toISOString());
  });

  it("carries a COMPAS envelope through as a reconstructable payload", () => {
    // A browser only ever holds the JSON form of a COMPAS object; it must go out as
    // FallbackData so the Python side reconstructs it rather than seeing a bare dict.
    const frame = {
      dtype: "compas.geometry.Frame",
      data: { point: [0, 0, 0] },
    };
    const loaded = pbLoadBytes(
      pbDump(
        new TaskCompletionMessage({
          id: "t",
          state: TaskState.SUCCEEDED,
          agentId: "a",
          outputs: { frame },
        }),
      ),
    );
    expect(loaded.outputs.frame).toEqual(frame);
  });
});
