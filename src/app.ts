import "express-async-errors";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db";
import { env } from "./config/env";
import { HttpError } from "./utils/errors";

import { tagsRouter } from "./routes/tags";
import { entitiesRouter } from "./routes/entities";
import { analyticsRouter } from "./routes/analytics";

export const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/tags", tagsRouter);
app.use("/entities", entitiesRouter);
app.use("/tags/analytics", analyticsRouter); // Or mount independently

// Global Error Handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Error:", err);
  
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  res.status(500).json({ error: "Internal Server Error" });
});

export const startServer = async () => {
  await connectDB();
  app.listen(env.PORT, () => {
    console.log(`🚀 Server running on port ${env.PORT}`);
  });
};

if (require.main === module) {
  startServer();
}
