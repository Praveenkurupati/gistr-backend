import mongoose from "mongoose";
import { Tag } from "../models/Tag";
import { TagRelation } from "../models/TagRelation";
import { EntityType } from "../models/Entity";
import { normalizeTags } from "../utils/tagUtils";
import { BadRequestError } from "../utils/errors";

export interface SearchOptions {
  tags: string[];
  mode: "and" | "or";
  entityType?: EntityType;
  page?: number;
  limit?: number;
}

export class EntitySearchService {
  /**
   * Searches for entities based on tags using MongoDB aggregation.
   * Leverages the `{ tagId: 1, entityType: 1 }` index for fast filtering.
   */
  static async searchEntities({
    tags,
    mode = "or",
    entityType,
    page = 1,
    limit = 10,
  }: SearchOptions) {
    const normalizedTags = normalizeTags(tags);
    if (normalizedTags.length === 0) {
      throw new BadRequestError("At least one valid tag must be provided for search");
    }

    // 1. Resolve tag names to Tag ObjectIds
    const matchedTags = await Tag.find({ name: { $in: normalizedTags } }, "_id name isDeleted").lean();
    
    // Ignore soft-deleted tags implicitly by filtering them if desired, but we assume active tags
    const activeTagIds = matchedTags.filter(t => !t.isDeleted).map((t) => t._id);

    if (activeTagIds.length === 0) {
      return { total: 0, page, limit, data: [] }; // None of the provided tags exist
    }

    // 2. Build Aggregation Pipeline on TagRelation collection
    const matchStage: any = {
      tagId: { $in: activeTagIds },
    };

    if (entityType) {
      matchStage.entityType = entityType;
    }

    const pipeline: mongoose.PipelineStage[] = [
      { $match: matchStage },
    ];

    if (mode === "and") {
      // For AND, entity must possess ALL specified active tags
      pipeline.push(
        {
          $group: {
            _id: "$entityId",
            matchedCount: { $addToSet: "$tagId" },
          },
        },
        {
          $project: {
            _id: 1,
            matchedSize: { $size: "$matchedCount" },
          },
        },
        {
          $match: {
            matchedSize: { $gte: activeTagIds.length },
          },
        }
      );
    } else {
      // For OR, any entity matching at least one tag is included
      pipeline.push({
        $group: {
          _id: "$entityId",
        },
      });
    }

    // Facet for pagination & total count
    pipeline.push({
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          // Join with the Entity collection
          {
            $lookup: {
              from: "entities",
              localField: "_id",
              foreignField: "_id",
              as: "entityDetails",
            },
          },
          { $unwind: "$entityDetails" },
          // Exclude soft-deleted entities
          { $match: { "entityDetails.isDeleted": false } },
          // Reshape output to lift entity details
          { $replaceRoot: { newRoot: "$entityDetails" } },
        ],
      },
    });

    const results = await TagRelation.aggregate(pipeline);

    const total = results[0]?.metadata[0]?.total || 0;
    const data = results[0]?.data || [];

    return {
      total,
      page,
      limit,
      data,
    };
  }
}
