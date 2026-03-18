import mongoose, { Schema, Document } from "mongoose";
import { EntityType } from "./Entity";

export interface ITagRelation extends Document {
  entityId: mongoose.Types.ObjectId;
  tagId: mongoose.Types.ObjectId;
  entityType: EntityType;
  createdAt: Date;
  updatedAt: Date;
}

const tagRelationSchema = new Schema<ITagRelation>(
  {
    entityId: {
      type: Schema.Types.ObjectId,
      ref: "Entity",
      required: true,
    },
    tagId: {
      type: Schema.Types.ObjectId,
      ref: "Tag",
      required: true,
    },
    entityType: {
      type: String,
      enum: ["source", "snippet", "ai_response"],
      required: true,
    },
  },
  { timestamps: true }
);

// Constraints & Indexing:
// 1. Unique compound index to prevent duplicate attachments to the same entity
tagRelationSchema.index({ entityId: 1, tagId: 1 }, { unique: true });

// 2. Index for reverse lookups + filtering (e.g. search all sources with tag 'mongodb')
tagRelationSchema.index({ tagId: 1, entityType: 1 });

export const TagRelation = mongoose.model<ITagRelation>(
  "TagRelation",
  tagRelationSchema
);
