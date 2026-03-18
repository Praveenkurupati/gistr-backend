import mongoose, { Schema, Document } from "mongoose";

export interface ITag extends Document {
  name: string;
  usageCount: number;
  parent?: mongoose.Types.ObjectId | ITag;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tagSchema = new Schema<ITag>(
  {
    name: {
      type: String,
      required: true,
      unique: true, // Ensures normalized names are unique globally
      trim: true,
      index: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    parent: {
      type: Schema.Types.ObjectId,
      ref: "Tag",
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Tag = mongoose.model<ITag>("Tag", tagSchema);
