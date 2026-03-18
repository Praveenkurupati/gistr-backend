import { Router } from "express";
import { TagService } from "../services/TagService";
import { BadRequestError } from "../utils/errors";

export const tagsRouter = Router();

tagsRouter.post("/attach", async (req, res) => {
  const { entityId, entityType, tags } = req.body;

  if (!entityId || !entityType || !Array.isArray(tags)) {
    throw new BadRequestError("entityId, entityType, and tags array are required.");
  }

  const result = await TagService.attachTags(entityId, entityType, tags);
  
  res.status(200).json({
    message: "Tags attached successfully",
    ...result,
  });
});
