import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { sqs, getQueueUrl } from "../aws";

const router = Router();

type Task = {
  id: string;
  title: string;
  note: string;
  enqueuedAt: string;
};

type PendingMessage = {
  messageId: string;
  receiptHandle: string;
  task: Task;
};

// POST /api/tasks — enqueue one task
router.post("/", async (req, res, next) => {
  try {
    const title = String(req.body?.title ?? "").trim();
    if (!title) return res.status(400).json({ error: "title is required" });
    const task: Task = {
      id: randomUUID(),
      title,
      note: String(req.body?.note ?? ""),
      enqueuedAt: new Date().toISOString(),
    };
    const out = await sqs.send(
      new SendMessageCommand({
        QueueUrl: await getQueueUrl(),
        MessageBody: JSON.stringify(task),
      })
    );
    res.status(201).json({ messageId: out.MessageId, task });
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks — queue counts + a peek at pending messages.
// The peek receives with VisibilityTimeout=0, so messages stay available
// and are NOT consumed; receipt handles from a peek can still be used to
// complete (delete) a task.
router.get("/", async (_req, res, next) => {
  try {
    const queueUrl = await getQueueUrl();
    const attrs = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
          "ApproximateNumberOfMessagesDelayed",
        ],
      })
    );
    const a = attrs.Attributes ?? {};

    const received = await sqs.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 0,
        WaitTimeSeconds: 0,
      })
    );
    const messages: PendingMessage[] = (received.Messages ?? []).map((m) => {
      let task: Task;
      try {
        task = JSON.parse(m.Body ?? "{}") as Task;
      } catch {
        task = {
          id: m.MessageId ?? "",
          title: m.Body ?? "",
          note: "",
          enqueuedAt: "",
        };
      }
      return {
        messageId: m.MessageId ?? "",
        receiptHandle: m.ReceiptHandle ?? "",
        task,
      };
    });

    res.json({
      counts: {
        visible: Number(a.ApproximateNumberOfMessages ?? 0),
        inFlight: Number(a.ApproximateNumberOfMessagesNotVisible ?? 0),
        delayed: Number(a.ApproximateNumberOfMessagesDelayed ?? 0),
      },
      messages,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/complete { receiptHandle } — mark a task done (delete)
router.post("/complete", async (req, res, next) => {
  try {
    const receiptHandle = String(req.body?.receiptHandle ?? "");
    if (!receiptHandle)
      return res.status(400).json({ error: "receiptHandle is required" });
    await sqs.send(
      new DeleteMessageCommand({
        QueueUrl: await getQueueUrl(),
        ReceiptHandle: receiptHandle,
      })
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/purge — remove every message in the queue
router.post("/purge", async (_req, res, next) => {
  try {
    await sqs.send(new PurgeQueueCommand({ QueueUrl: await getQueueUrl() }));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
