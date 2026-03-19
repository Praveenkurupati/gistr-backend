import mongoose from "mongoose";
import { TagService } from "../services/TagService";
import { Entity } from "../models/Entity";
import { Tag } from "../models/Tag";
import { TagRelation } from "../models/TagRelation";

import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer: MongoMemoryServer;

describe("TagService - Attach Tags", () => {
  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await Entity.deleteMany({});
    await Tag.deleteMany({});
    await TagRelation.deleteMany({});
  });

  test("should attach tags correctly and prevent duplicates inherently (Idempotency)", async () => {
    // 1. Setup an Entity
    const entity = await Entity.create({
      type: "source",
      content: "A test source about mongodb",
    });

    // 2. Attach tags (intentionally duplicating 'mongodb' in input)
    const result1 = await TagService.attachTags(entity.id, "source", ["mongodb", "database", "MongoDB "]);
    
    // Expect output to normalize correctly
    expect(result1.attached.sort()).toEqual(["database", "mongodb"]);

    // Verify DB State
    const tags = await Tag.find();
    expect(tags.length).toBe(2);
    expect(tags.find(t => t.name === "mongodb")?.usageCount).toBe(1);

    const relations = await TagRelation.find({ entityId: entity.id });
    expect(relations.length).toBe(2);

    // 3. Attach same tags again (Idempotent test)
    const result2 = await TagService.attachTags(entity.id, "source", ["mongodb"]);
    expect(result2.attached).toEqual([]); // No new tags attached

    // Verify usage count hasn't improperly incremented
    const updatedTag = await Tag.findOne({ name: "mongodb" });
    expect(updatedTag?.usageCount).toBe(1);

    const updatedRelations = await TagRelation.find({ entityId: entity.id });
    expect(updatedRelations.length).toBe(2); // Still 2
  });
});
