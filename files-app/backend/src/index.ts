import "dotenv/config";
import cors from "cors";
import express from "express";
import { ensureResources } from "./aws";
import filesRouter from "./routes/files";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/files", filesRouter);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
);

const port = Number(process.env.PORT ?? 4001);

ensureResources()
  .then(() => {
    app.listen(port, () => {
      console.log(`files-backend listening on http://localhost:${port}`);
      console.log(
        `AWS endpoint: ${process.env.AWS_ENDPOINT_URL ?? "(real AWS)"} region=${process.env.AWS_REGION ?? "us-east-1"}`
      );
    });
  })
  .catch((err) => {
    console.error("Failed to prepare AWS resources. Is the emulator running?");
    console.error(err);
    process.exit(1);
  });
