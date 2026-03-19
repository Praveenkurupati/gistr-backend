import mongoose from "mongoose";
import { Tag, ITag } from "../models/Tag";
import { TagRelation } from "../models/TagRelation";
import { EntityType, Entity } from "../models/Entity";
import { normalizeTags } from "../utils/tagUtils";
import { BadRequestError, NotFoundError } from "../utils/errors";

export class TagService {
  /**
   * Attaches tags to an entity robustly.
   * - Normalizes input
   * - Safely bulk upserts tags
   * - Attaches relations using unique compound index protection
   * - Adjusts usageCount accurately
   */
  static async attachTags(
    entityId: string,
    entityType: EntityType,
    rawTags: string[]
  ) {
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      throw new BadRequestError("Invalid entityId");
    }

    const eId = new mongoose.Types.ObjectId(entityId);

    // Ensure entity exists before attaching
    const entityExists = await Entity.exists({ _id: eId, type: entityType });
    if (!entityExists) {
      throw new NotFoundError("Entity not found or mismatched type");
    }

    // 1. Normalize and dedupe incoming tags
    const normalizedTags = normalizeTags(rawTags);
    if (normalizedTags.length === 0) return { attached: [] };

    // 2. Ensure tags exist in Tag collection (Atomic Upsert)
    const tagBulkOps = normalizedTags.map((name) => ({
      updateOne: {
        filter: { name },
        update: {
          $setOnInsert: { name, usageCount: 0, isDeleted: false },
        },
        upsert: true,
      },
    }));

    if (tagBulkOps.length > 0) {
      await Tag.bulkWrite(tagBulkOps, { ordered: false });
    }

    // 3. Fetch all tag documents for the requested tags
    const tags = await Tag.find({ name: { $in: normalizedTags } });
    const tagMap = new Map<string, mongoose.Types.ObjectId>();
    tags.forEach((t) => tagMap.set(t.name, t._id as mongoose.Types.ObjectId));

    // 4. Find currently attached tags for this entity
    const existingRelations = await TagRelation.find({ entityId: eId });
    const attachedTagIds = new Set(
      existingRelations.map((r) => r.tagId.toString())
    );

    // 5. Determine which tags are genuinely new attachments
    const newTagsToAttach = tags.filter(
      (t) => !attachedTagIds.has((t._id as mongoose.Types.ObjectId).toString())
    );

    if (newTagsToAttach.length === 0) {
      return { attached: [] }; // Idempotent success (all already attached)
    }

    // 5b. Prevent Tag Explosion: Max 50 tags per entity
    const MAX_TAGS_PER_ENTITY = 50;
    if (existingRelations.length + newTagsToAttach.length > MAX_TAGS_PER_ENTITY) {
      throw new BadRequestError(`Cannot attach tags. An entity can have a maximum of ${MAX_TAGS_PER_ENTITY} tags.`);
    }

    // 6. Bulk insert new TagRelations
    const relationOps = newTagsToAttach.map((t) => ({
      insertOne: {
        document: {
          entityId: eId,
          tagId: t._id,
          entityType,
        },
      },
    }));

    try {
      await TagRelation.bulkWrite(relationOps, { ordered: false });
    } catch (err: any) {
      // Ignore duplicate key errors (11000) from concurrent requests hitting the unique index
      if (err.code !== 11000) {
        throw err;
      }
    }

    // 7. Increment usage counts (only for successfully attached ones in this operation)
    // Using atomic $inc
    const newTagIds = newTagsToAttach.map((t) => t._id);
    await Tag.updateMany(
      { _id: { $in: newTagIds } },
      { $inc: { usageCount: 1 } }
    );

    return {
      attached: newTagsToAttach.map((t) => t.name),
    };
  }
}
