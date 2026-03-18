import mongoose, { Schema, Document } from "mongoose";

export type EntityType = "source" | "snippet" | "ai_response";

export interface IEntity extends Document {
  type: EntityType;
  content: string;
  metadata?: Record<string, any>;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const entitySchema = new Schema<IEntity>(
  {
    type: {
      type: String,
      enum: ["source", "snippet", "ai_response"],
      required: true,
      index: true, // Needed for searching by entityType efficiently
    },
    content: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Entity = mongoose.model<IEntity>("Entity", entitySchema);
