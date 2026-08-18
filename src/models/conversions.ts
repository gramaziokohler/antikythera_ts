/**
 * Registers the Antikythera domain model with compas_pb_ts.
 *
 * The TypeScript counterpart of `antikythera.models.conversions`, which registers the same
 * types through `@pb_serializer` / `@pb_deserializer` and is discovered through the
 * `compas_pb.plugins` entry point. JavaScript has no equivalent of packaging entry points,
 * and a bundled browser application cannot inspect its dependency tree at runtime, so
 * registration is explicit:
 *
 *     import { registerAntikytheraTypes } from "@gramaziokohler/antikythera-ts";
 *     registerAntikytheraTypes();
 *
 * Call it once during application start-up, before any message is encoded or decoded.
 */

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import { timestampDate, timestampFromDate } from "@bufbuild/protobuf/wkt";
import {
  registerType,
  resolveAnyData,
  serializeAny,
  serializeMap,
} from "@gramaziokohler/compas-pb-ts";
import type { AnyData } from "@gramaziokohler/compas-pb-ts/proto/compas_pb/generated/message_pb";

import * as pb from "../proto/antikythera_pb";
import {
  ExecutionMode,
  TaskAllocationMessage,
  TaskAssignmentMessage,
  TaskClaimRequest,
  TaskCompletionAckMessage,
  TaskCompletionMessage,
  TaskError,
  TaskState,
} from "./tasks";

const EXECUTION_MODE_TO_PB: Record<ExecutionMode, pb.ExecutionMode> = {
  [ExecutionMode.EXCLUSIVE]: pb.ExecutionMode.EXCLUSIVE,
  [ExecutionMode.COMPETITIVE]: pb.ExecutionMode.COMPETITIVE,
};

const EXECUTION_MODE_FROM_PB = new Map<pb.ExecutionMode, ExecutionMode>([
  [pb.ExecutionMode.EXCLUSIVE, ExecutionMode.EXCLUSIVE],
  [pb.ExecutionMode.COMPETITIVE, ExecutionMode.COMPETITIVE],
]);

const TASK_STATE_TO_PB: Record<TaskState, pb.TaskState> = {
  [TaskState.UNSPECIFIED]: pb.TaskState.UNSPECIFIED,
  [TaskState.PENDING]: pb.TaskState.PENDING,
  [TaskState.READY]: pb.TaskState.READY,
  [TaskState.RUNNING]: pb.TaskState.RUNNING,
  [TaskState.SUCCEEDED]: pb.TaskState.SUCCEEDED,
  [TaskState.FAILED]: pb.TaskState.FAILED,
};

const TASK_STATE_FROM_PB = new Map<pb.TaskState, TaskState>(
  Object.entries(TASK_STATE_TO_PB).map(([domain, wire]) => [
    wire,
    domain as TaskState,
  ]),
);

function decodeMap(map: Record<string, AnyData>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(map)) {
    result[key] = resolveAnyData(value);
  }
  return result;
}

let registered = false;

/** Registers every Antikythera type with the compas_pb runtime. Idempotent. */
export function registerAntikytheraTypes(): void {
  if (registered) {
    return;
  }
  registered = true;

  registerType("antikythera.v1.TaskAssignmentMessage", TaskAssignmentMessage, {
    toBytes: (message) =>
      toBinary(
        pb.TaskAssignmentMessageSchema,
        create(pb.TaskAssignmentMessageSchema, {
          id: message.id,
          type: message.type,
          inputs: serializeMap(message.inputs),
          outputKeys: message.outputKeys,
          params: serializeMap(message.params),
          context: serializeMap(message.context),
          timestamp: timestampFromDate(message.timestamp),
          executionMode: EXECUTION_MODE_TO_PB[message.executionMode],
        }),
      ),
    fromBytes: (bytes) => {
      const decoded = fromBinary(pb.TaskAssignmentMessageSchema, bytes);
      return new TaskAssignmentMessage({
        id: decoded.id,
        type: decoded.type,
        inputs: decodeMap(decoded.inputs),
        outputKeys: decoded.outputKeys,
        params: decodeMap(decoded.params),
        context: decodeMap(decoded.context),
        timestamp: decoded.timestamp
          ? timestampDate(decoded.timestamp)
          : undefined,
        executionMode:
          EXECUTION_MODE_FROM_PB.get(decoded.executionMode) ??
          ExecutionMode.EXCLUSIVE,
        rawParams: decoded.params,
      });
    },
  });

  registerType("antikythera.v1.TaskClaimRequest", TaskClaimRequest, {
    toBytes: (message) =>
      toBinary(
        pb.TaskClaimRequestSchema,
        create(pb.TaskClaimRequestSchema, {
          taskId: message.taskId,
          agentId: message.agentId,
          timestamp: timestampFromDate(message.timestamp),
        }),
      ),
    fromBytes: (bytes) => {
      const decoded = fromBinary(pb.TaskClaimRequestSchema, bytes);
      return new TaskClaimRequest({
        taskId: decoded.taskId,
        agentId: decoded.agentId,
        timestamp: decoded.timestamp
          ? timestampDate(decoded.timestamp)
          : undefined,
      });
    },
  });

  registerType("antikythera.v1.TaskAllocationMessage", TaskAllocationMessage, {
    toBytes: (message) =>
      toBinary(
        pb.TaskAllocationMessageSchema,
        create(pb.TaskAllocationMessageSchema, {
          taskId: message.taskId,
          assignedAgentId: message.assignedAgentId,
          timestamp: timestampFromDate(message.timestamp),
        }),
      ),
    fromBytes: (bytes) => {
      const decoded = fromBinary(pb.TaskAllocationMessageSchema, bytes);
      return new TaskAllocationMessage({
        taskId: decoded.taskId,
        assignedAgentId: decoded.assignedAgentId,
        timestamp: decoded.timestamp
          ? timestampDate(decoded.timestamp)
          : undefined,
      });
    },
  });

  registerType("antikythera.v1.TaskCompletionMessage", TaskCompletionMessage, {
    toBytes: (message) =>
      toBinary(
        pb.TaskCompletionMessageSchema,
        create(pb.TaskCompletionMessageSchema, {
          id: message.id,
          state: TASK_STATE_TO_PB[message.state],
          agentId: message.agentId,
          outputs: serializeMap(message.outputs),
          error: message.error
            ? create(pb.TaskErrorSchema, {
                code: message.error.code,
                message: message.error.message,
                details:
                  message.error.details === undefined
                    ? undefined
                    : serializeAny(message.error.details),
              })
            : undefined,
          timestamp: timestampFromDate(message.timestamp),
          durationMs: message.durationMs ? BigInt(message.durationMs) : 0n,
        }),
      ),
    fromBytes: (bytes) => {
      const decoded = fromBinary(pb.TaskCompletionMessageSchema, bytes);
      return new TaskCompletionMessage({
        id: decoded.id,
        state: TASK_STATE_FROM_PB.get(decoded.state) ?? TaskState.UNSPECIFIED,
        agentId: decoded.agentId,
        outputs: decodeMap(decoded.outputs),
        error: decoded.error
          ? new TaskError({
              code: decoded.error.code,
              message: decoded.error.message,
              details: decoded.error.details
                ? resolveAnyData(decoded.error.details)
                : undefined,
            })
          : undefined,
        timestamp: decoded.timestamp
          ? timestampDate(decoded.timestamp)
          : undefined,
        durationMs: decoded.durationMs ? Number(decoded.durationMs) : undefined,
      });
    },
  });

  registerType(
    "antikythera.v1.TaskCompletionAckMessage",
    TaskCompletionAckMessage,
    {
      toBytes: (message) =>
        toBinary(
          pb.TaskCompletionAckMessageSchema,
          create(pb.TaskCompletionAckMessageSchema, {
            id: message.id,
            state: TASK_STATE_TO_PB[message.state],
            acceptedAgentId: message.acceptedAgentId,
            timestamp: timestampFromDate(message.timestamp),
          }),
        ),
      fromBytes: (bytes) => {
        const decoded = fromBinary(pb.TaskCompletionAckMessageSchema, bytes);
        return new TaskCompletionAckMessage({
          id: decoded.id,
          state: TASK_STATE_FROM_PB.get(decoded.state) ?? TaskState.UNSPECIFIED,
          acceptedAgentId: decoded.acceptedAgentId,
          timestamp: decoded.timestamp
            ? timestampDate(decoded.timestamp)
            : undefined,
        });
      },
    },
  );
}
