import { eventType } from "inngest";
import z from "zod";
import { inngest } from "../client";

/**
 * await inngest.send(taskCreated.create({
 *   id: "task_001",
 * }));
 */

export const taskCreated = eventType("app/task.created", {
  schema: z.object({
    id: z.string(),
  }),
});

export const processTask = inngest.createFunction(
  {
    id: "process-task",
    triggers: [taskCreated],
  },
  async ({ event, step }) => {
    const result = await step.run("handle-task", async () => {
      return { processed: true, id: event.data.id };
    });

    await step.sleep("pause", "1s");

    return { message: `Task ${event.data.id} complete`, result };
  },
);
