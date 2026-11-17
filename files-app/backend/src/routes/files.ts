import { Router } from "express";
import multer from "multer";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { s3, BUCKET } from "../aws";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

type FileEntry = {
  key: string;
  size: number;
  lastModified: string | null;
};

// GET /api/files — list every object in the bucket
router.get("/", async (_req, res, next) => {
  try {
    const files: FileEntry[] = [];
    let token: string | undefined;
    do {
      const out = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET,
          ContinuationToken: token,
        })
      );
      for (const obj of out.Contents ?? []) {
        files.push({
          key: obj.Key ?? "",
          size: obj.Size ?? 0,
          lastModified: obj.LastModified?.toISOString() ?? null,
        });
      }
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
    files.sort((a, b) => a.key.localeCompare(b.key));
    res.json({
      files,
      count: files.length,
      totalBytes: files.reduce((sum, f) => sum + f.size, 0),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/files — upload one file. Form fields: file, prefix (optional
// folder-like prefix). Refuses to overwrite an existing key (409).
router.post("/", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "file is required" });
    const prefix = String(req.body?.prefix ?? "").replace(/^\/+|\/+$/g, "");
    const name = req.file.originalname.split(/[\\/]/).pop() ?? "file";
    const key = prefix ? `${prefix}/${name}` : name;

    let exists = true;
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      exists = false;
    }
    if (exists) {
      return res
        .status(409)
        .json({ error: `already exists: ${key} (delete it first to replace)` });
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );
    res.status(201).json({ key, size: req.file.size });
  } catch (err) {
    next(err);
  }
});

// GET /api/files/download?key=... — stream the object as an attachment
router.get("/download", async (req, res, next) => {
  try {
    const key = String(req.query.key ?? "");
    if (!key) return res.status(400).json({ error: "key is required" });
    const out = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key })
    );
    const filename = key.split("/").pop() ?? "download";
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    if (out.ContentType) res.setHeader("Content-Type", out.ContentType);
    if (out.ContentLength != null)
      res.setHeader("Content-Length", String(out.ContentLength));
    (out.Body as Readable).pipe(res);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/files?key=...
router.delete("/", async (req, res, next) => {
  try {
    const key = String(req.query.key ?? "");
    if (!key) return res.status(400).json({ error: "key is required" });
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
