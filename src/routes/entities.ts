import { Router } from "express";
import { EntitySearchService, SearchOptions } from "../services/EntitySearchService";
import { EntityType } from "../models/Entity";
import { BadRequestError } from "../utils/errors";

export const entitiesRouter = Router();

entitiesRouter.get("/search", async (req, res) => {
  const { tags, mode, entityType, page, limit } = req.query;

  if (!tags || typeof tags !== "string") {
    throw new BadRequestError("Comma-separated tags query parameter is required. /search?tags=a,b");
  }

  const tagArray = tags.split(",").map((t) => t.trim()).filter(Boolean);

  const searchMode = (mode === "and" || mode === "or") ? mode : "or";
  
  const options: SearchOptions = {
    tags: tagArray,
    mode: searchMode,
    page: page ? parseInt(page as string) : 1,
    limit: limit ? parseInt(limit as string) : 10,
  };

  if (entityType) {
    options.entityType = entityType as EntityType;
  }

  const results = await EntitySearchService.searchEntities(options);

  res.status(200).json(results);
});
