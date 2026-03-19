import mongoose from "mongoose";
import { Entity } from "../models/Entity";
import { Tag } from "../models/Tag";
import { TagRelation } from "../models/TagRelation";
import { NotFoundError } from "../utils/errors";

export class EntityService {
  /**
   * Soft Deletes an entity and manages Tag lifecycle cleanup.
   * Requirement: When an entity is deleted, tag relationships must be cleaned up,
   * and usage counts updated correctly.
   */
  static async deleteEntity(entityId: string) {
    if (!mongoose.Types.ObjectId.isValid(entityId)) {
      throw new NotFoundError("Invalid entityId format");
    }

    const eId = new mongoose.Types.ObjectId(entityId);

    // 1. Soft delete the entity
    const entity = await Entity.findOneAndUpdate(
      { _id: eId, isDeleted: false },
      { $set: { isDeleted: true } },
      { new: true }
    );

    if (!entity) {
      throw new NotFoundError("Entity not found or already deleted");
    }

    // 2. Find all existing tag relations, to decrement tag usage count
    const relations = await TagRelation.find({ entityId: eId });
    if (relations.length > 0) {
      const tagIds = relations.map((r) => r.tagId);

      // Decrement the usage count from the Tag collection
      await Tag.updateMany(
        { _id: { $in: tagIds } },
        { $inc: { usageCount: -1 } }
      );

      // We remove the relations so the tags won't surface in search queries
      // A soft delete on the relation table is also possible, but hard delete 
      // keeps the table size tight since deleting a relationship is definitive.
      await TagRelation.deleteMany({ entityId: eId });
    }

    return { message: "Entity successfully deleted and relationships cleaned up." };
  }
}
