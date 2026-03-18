# Gistr Backend System

A production-quality backend engine for tagging and semantic search entities (Sources, Snippets, AIResponses).

## Setup Instructions

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Setup Environment Variables:**
   Create a \`.env\` file in the root based on \`.env.example\` or use the defaulted ones:
   \`\`\`env
   PORT=3000
   MONGODB_URI=mongodb://localhost:27017/gistr
   NODE_ENV=development
   \`\`\`

3. **Provide MongoDB Instance:**
   Ensure MongoDB is running locally on \`mongodb://localhost:27017\` or provide a cluster string.

4. **Seed Database:**
   \`\`\`bash
   npm run seed
   \`\`\`

5. **Start Dev Server:**
   \`\`\`bash
   npm run dev
   \`\`\`

6. **Run Tests:**
   \`\`\`bash
   npm test
   \`\`\`

---

## Architecture & Design Decisions

### 1. Why this schema?
We opted for a **Polymorphic Entity Model** with a strict decoupling of Entities (`Entity`), Tags (`Tag`), and their mapping (`TagRelation`).
- **Entity**: Polymorphic, single-table design (`type` discriminator) allows universal APIs. Metadata handles unstructured differences like URL vs Author vs Code Language.
- **Tag**: Separated globally. A normalized string is its true identity, storing \`usageCount\`.
- **TagRelation**: An explicit join table. By isolating relations:
  - We keep `Entity` documents small (avoiding unbounded array growth/tag explosion directly inside the document).
  - Reverse lookups (find all entities by tag) are extremely fast and scalable.

### 2. How Tag Attachment works internally?
**Goals: Idempotency, Concurrency Safety, Strong Normalization.**
When \`POST /tags/attach\` is called:
1. Tags are normalized (lowercased, trimmed, deduplicated in memory).
2. Missing tags are atomically upserted into the \`Tag\` collection using robust \`bulkWrite()\` with \`$setOnInsert\`.
3. The server diffs the requested tags against existing \`TagRelation\`s for the given entity.
4. Only truly new relations are inserted via \`TagRelation.bulkWrite()\`. We catch duplicate key errors (\`11000\`) silently to survive race-condition concurrency.
5. Global tag \`usageCount\` is atomically incremented via \`$inc\` only for the successfully inserted new relations.

*Tag Explosion Prevention Tooling*: Pure normalization is applied. By separating Relation and Tags, maximum tags per entity could additionally be enforced here with a simple \`Array.length\` bounds check.

### 3. How Search works internally?
**Goal: Scalable Aggregation Pipelines over Nested Lookups.**
\`GET /entities/search?tags=a,b&mode=and\`
We avoid naive array filtering like \`{ tags: { $all: [...] } }\` directly on documents (which scan/index heavily as arrays grow).
Instead, we pivot entirely through the \`TagRelation\` collection:
1. We translate normalized requested string arrays to ObjectIDs.
2. We utilize the compound index \`{ tagId: 1, entityType: 1 }\` to immediately filter relations down to our target tags.
3. Depending on mode:
   - **OR mode**: Group by \`entityId\` essentially deduping matches. If it lands here, it matches.
   - **AND mode**: Group by \`entityId\` pushing \`$tagId\` to a set. We assert that the \`$size\` of this set matches exactly the number of targeted valid tags.
4. Finally, use \`$facet\` to cleanly retrieve \`$count\` and paginate via \`$skip\`/\`$limit\`, then perform a single \`$lookup\` back to the \`entities\` collection out-bounding precisely 10 documents max to the client.

### 4. Indexing Strategy (Detailed)
| Collection | Index | Type | Reasoning |
|---|---|---|---|
| \`Entity\` | \`{ type: 1 }\` | Single | Optimizes filtering entities by their specific polymorphic type. |
| \`Tag\` | \`{ name: 1 }\` | Unique Single | Crucial for normalizing string identities. Enforces uniqueness. Prevents system explosion and allows fast exact-match lookup mapping. |
| \`TagRelation\` | \`{ entityId: 1, tagId: 1 }\` | Unique Compound | Primary safeguard preventing an entity from receiving the exact same tag twice. Enforces data integrity at the lowest DB tier under concurrent load. |
| \`TagRelation\` | \`{ tagId: 1, entityType: 1 }\` | Compound | Core Search index. Optimized for the first stage of the search aggregation: query by Tag IDs and (optionally) narrow by EntityType without full table scans. |

### 5. Extend Semantic Search (Design)
*"How would you extend search to show related tags?"*

**Proposed Best Strategy: Embedding/Vector Similarity**
* **Implementation:** Instead of explicitly linking parents, map the text of tags/entities through an embedding model (e.g., OpenAI text-embedding-ada-002) and store the vector in a dedicated \`embeddings\` array or a Vector DB (like Milvus / Pinecone / Atlas Vector Search).
* **Trade-offs:** 
  - *Pros:* Captures true semantic meaning ("JS" = "JavaScript" = "Node"). No manual dictionary maintenance required. Automatically scales feature knowledge.
  - *Cons:* Adds high engineering complexity (ML model latency on ingest), higher compute cost, and requires sync pipelines to re-embed data periodically.
* **Alternative approaches compared:**
  - *Tag Hierarchy (Parent-Child)* is simple but rigid. Hard to manage cyclic graphs (e.g. is 'React' child of 'Frontend' or 'Framework'?).
  - *Namespaces (db/mongodb)* prevents collisions but requires users to perfectly know our strict conventions, hurting UX.

### 6. Where system breaks at scale?
- **Global tag lock-in limit:** If a single broad tag (like \`"bug"\`) is attached to 100 Million entities, the \`$lookup\` operations and the \`TagRelation\` grouping aggregation for that single tag could start facing memory limits (`$group` threshold in Atlas).
- **Pagination Depth:** Relying on `$skip` over heavily joined aggregations decays over deep pages (e.g., page 50,000).

### 7. What you'd improve with more time?
1. **Async Cleanup Workers:** I would implement a message queue (RabbitMQ/BullMQ) to listen for "entity.deleted" events, which would eventually soft-delete all child \`TagRelation\` entries and decrement global \`usageCount\` to prevent orphaned metrics.
2. **Cursor-based Pagination:** Move away from \`skip\` and \`limit\` to `offset _id` limit paginations for high scale.
3. **Caching Layer:** Redis caching on the aggregated \`/analytics\` endpoint, as aggregations on historical usage count get pricey dynamically.
