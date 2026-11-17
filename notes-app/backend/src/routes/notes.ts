import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { BUCKET, TABLE, ddb, s3 } from "../aws";

export interface Attachment {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  attachment: Attachment | null;
  createdAt: string;
  updatedAt: string;
}

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function getNote(id: string): Promise<Note | null> {
  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }));
  return (res.Item as Note) ?? null;
}

router.get("/", async (_req: Request, res: Response) => {
  const out = await ddb.send(new ScanCommand({ TableName: TABLE }));
  const notes = ((out.Items ?? []) as Note[]).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
  res.json(notes);
});

router.get("/:id", async (req: Request, res: Response) => {
  const note = await getNote(String(req.params.id));
  if (!note) return res.status(404).json({ error: "note not found" });
  res.json(note);
});

router.post("/", async (req: Request, res: Response) => {
  const { title, body } = req.body ?? {};
  if (typeof title !== "string" || title.trim() === "") {
    return res.status(400).json({ error: "title is required" });
  }
  const now = new Date().toISOString();
  const note: Note = {
    id: randomUUID(),
    title,
    body: typeof body === "string" ? body : "",
    attachment: null,
    createdAt: now,
    updatedAt: now,
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: note }));
  res.status(201).json(note);
});

router.put("/:id", async (req: Request, res: Response) => {
  const existing = await getNote(String(req.params.id));
  if (!existing) return res.status(404).json({ error: "note not found" });
  const { title, body } = req.body ?? {};
  const note: Note = {
    ...existing,
    title: typeof title === "string" ? title : existing.title,
    body: typeof body === "string" ? body : existing.body,
    updatedAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: note }));
  res.json(note);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const existing = await getNote(String(req.params.id));
  if (!existing) return res.status(404).json({ error: "note not found" });
  if (existing.attachment) {
    await s3.send(
      new DeleteObjectCommand({ Bucket: BUCKET, Key: existing.attachment.key })
    );
  }
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { id: existing.id } }));
  res.status(204).end();
});

router.post(
  "/:id/attachment",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const note = await getNote(String(req.params.id));
    if (!note) return res.status(404).json({ error: "note not found" });
    if (!req.file) return res.status(400).json({ error: "file is required" });

    if (note.attachment) {
      await s3.send(
        new DeleteObjectCommand({ Bucket: BUCKET, Key: note.attachment.key })
      );
    }
    const key = `notes/${note.id}/${req.file.originalname}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );
    const updated: Note = {
      ...note,
      attachment: {
        key,
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
      },
      updatedAt: new Date().toISOString(),
    };
    await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }));
    res.json(updated);
  }
);

router.get("/:id/attachment", async (req: Request, res: Response) => {
  const note = await getNote(String(req.params.id));
  if (!note?.attachment) {
    return res.status(404).json({ error: "attachment not found" });
  }
  const obj = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: note.attachment.key })
  );
  res.setHeader("Content-Type", note.attachment.contentType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(note.attachment.filename)}"`
  );
  const bytes = await obj.Body?.transformToByteArray();
  res.send(bytes ? Buffer.from(bytes) : Buffer.alloc(0));
});

router.delete("/:id/attachment", async (req: Request, res: Response) => {
  const note = await getNote(String(req.params.id));
  if (!note?.attachment) {
    return res.status(404).json({ error: "attachment not found" });
  }
  await s3.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: note.attachment.key })
  );
  const updated: Note = {
    ...note,
    attachment: null,
    updatedAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: updated }));
  res.json(updated);
});

export default router;
