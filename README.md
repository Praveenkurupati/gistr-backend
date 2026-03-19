# 🗂️ Gistr Backend System

> A production-quality backend engine for **tagging** and **semantic search** across polymorphic entities — Sources, Snippets, and AIResponses.

---

## 📚 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running the Server](#running-the-server)
- [API Reference](#api-reference)
- [Architecture & Design Decisions](#architecture--design-decisions)
  - [Schema Design](#1-schema-design--polymorphic-entity-model)
  - [Tag Attachment Internals](#2-tag-attachment-internals)
  - [Tag Lifecycle & Soft Delete](#3-tag-lifecycle--soft-delete)
  - [Search Internals](#4-how-search-works-internally)
  - [Indexing Strategy](#5-indexing-strategy)
  - [Extending Semantic Search](#6-extending-semantic-search)
  - [Scale Limitations](#7-where-the-system-breaks-at-scale)
  - [Future Improvements](#8-future-improvements)
- [Testing](#testing)
- [Contributing](#contributing)

---

## Overview

Gistr is a backend service that enables scalable, concurrent-safe tagging and powerful multi-tag search across different entity types. It is designed with clean separation of concerns, aggregation-first search pipelines, and atomic database operations to ensure idempotency under concurrent load.

---

## Features

- ✅ **Polymorphic Entity Model** — Unified API for Sources, Snippets, and AIResponses
- ✅ **Idempotent & Concurrent-Safe Tag Attachment** — Using `bulkWrite` with `$setOnInsert`
- ✅ **AND / OR Tag Search** — Aggregation-pipeline driven, not naive array scanning
- ✅ **Tag Explosion Prevention** — Hard limit of 50 tags per entity
- ✅ **Soft Delete with Cleanup** — Entity soft-delete + synchronous tag relation teardown
- ✅ **Optimized Indexing** — Compound indexes on `TagRelation` for search and uniqueness enforcement
- ✅ **Paginated Results** — `$facet`-based count + paginated entity lookups

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | MongoDB (Mongoose ODM) |
| Testing | Jest / Supertest |
| Environment | dotenv |

---

## Project Structure

```
gistr-backend/
├── src/
│   ├── models/
│   │   ├── Entity.js          # Polymorphic entity model
│   │   ├── Tag.js             # Global normalized tag store
│   │   └── TagRelation.js     # Explicit entity-tag join table
│   ├── services/
│   │   ├── TagService.js      # Tag upsert, attachment, usageCount logic
│   │   └── EntityService.js   # Entity CRUD + soft delete
│   ├── routes/
│   │   ├── entities.js        # Entity routes + search endpoint
│   │   └── tags.js            # Tag attach/detach routes
│   └── app.js                 # Express app entry point
├── tests/
│   └── ...                    # Integration & unit tests
├── .env.example
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v16+
- [MongoDB](https://www.mongodb.com/) running locally or a remote cluster URI

---

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/gistr-backend.git
cd gistr-backend

# Install dependencies
npm install
```

---

### Environment Variables

Create a `.env` file in the project root. You can use the provided `.env.example` as a reference:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/gistr
NODE_ENV=development
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `MONGODB_URI` | `mongodb://localhost:27017/gistr` | MongoDB connection string |
| `NODE_ENV` | `development` | Application environment |

---

### Running the Server

```bash
# Seed the database with initial data
npm run seed

# Start the development server (with hot reload)
npm run dev

# Start in production mode
npm start
```

The server will start at `http://localhost:3000`.

---

## API Reference

### Entities

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/entities/search?tags=a,b&mode=and` | Search entities by tags (AND / OR mode) |
| `GET` | `/entities/:id` | Get a single entity |
| `POST` | `/entities` | Create a new entity |
| `DELETE` | `/entities/:id` | Soft delete an entity |

#### Search Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `tags` | `string` | Comma-separated tag names (e.g., `tags=js,backend`) |
| `mode` | `and` \| `or` | Match all tags (`and`) or any tag (`or`). Default: `or` |
| `type` | `string` | Filter by entity type: `source`, `snippet`, `airesponse` |
| `page` | `number` | Page number (default: `1`) |
| `limit` | `number` | Results per page (default: `10`, max: `10`) |

---

### Tags

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/tags/attach` | Attach tags to an entity |
| `POST` | `/tags/detach` | Detach tags from an entity |
| `GET` | `/tags` | List all tags with usage counts |
| `GET` | `/analytics` | Aggregated tag analytics |

#### Attach Tags — Request Body

```json
{
  "entityId": "64abc123...",
  "tags": ["javascript", "backend", "nodejs"]
}
```

---

## Architecture & Design Decisions

### 1. Schema Design — Polymorphic Entity Model

The system uses a **Polymorphic Entity Model** with strict decoupling of `Entity`, `Tag`, and `TagRelation`:

- **`Entity`**: Single-collection design with a `type` discriminator (`source`, `snippet`, `airesponse`). Unstructured differences (URL, Author, Code Language) live in a flexible `metadata` field. This enables unified APIs across all entity types.

- **`Tag`**: Globally normalized by lowercase string. Stores a `usageCount` for analytics. Tags are shared across all entity types.

- **`TagRelation`**: An explicit join table decoupling entities from their tags.
  - Keeps `Entity` documents small — no unbounded tag arrays inside documents.
  - Enables extremely fast reverse lookups: *"find all entities with tag X"*.

---

### 2. Tag Attachment Internals

**Goals: Idempotency · Concurrency Safety · Strong Normalization**

When `POST /tags/attach` is called, the following pipeline executes:

1. **Normalize** — Tags are lowercased, trimmed, and deduplicated in memory.
2. **Upsert Tags** — Missing tags are atomically upserted into the `Tag` collection via `bulkWrite()` using `$setOnInsert` to avoid overwriting existing data.
3. **Diff Relations** — The server diffs the requested tags against existing `TagRelation`s for that entity.
4. **Insert New Relations** — Only truly new relations are inserted via `TagRelation.bulkWrite()`. Duplicate key errors (`11000`) are silently swallowed to safely handle race conditions.
5. **Increment `usageCount`** — Atomically incremented via `$inc` only for successfully inserted new relations.

**Tag Explosion Prevention:**
A hard maximum of **50 tags per entity** is enforced synchronously inside `TagService`.

> **Why 50?** It's a fail-safe choke-point against malicious actors or automated scrapers flooding a single entity with thousands of system-generated tags — which would bloat the DB and crash aggregation `$size` limits. It forces callers to choose only the most important tags.

> **Limitation:** This cap doesn't prevent *similar tag* explosion (e.g., `js` and `javascript` coexisting). For semantic purity, this should be paired with a fuzzy-matching or alias resolution system.

---

### 3. Tag Lifecycle & Soft Delete

`EntityService` soft deletes an entity (`isDeleted = true`) and **synchronously** hard-deletes its `TagRelation`s:

- **Why synchronous?** For this implementation, it ensures immediate data consistency — the moment an entity is deleted, its tag `usageCount`s are accurate.
- **Production concern:** At high scale, deleting an entity with 50 tags means 50 tag document updates in one request — a bottleneck. This should be moved to an **async worker** (e.g., RabbitMQ / BullMQ) listening on an `entity.deleted` event.
- **Partial failure risk:** If the entity soft-delete succeeds but `usageCount` decrement fails, tag counts become inaccurate. The fix is wrapping the entire operation in a **MongoDB Distributed Transaction** (`session.withTransaction`).

---

### 4. How Search Works Internally

**Goal: Scalable aggregation pipelines over nested lookups**

`GET /entities/search?tags=a,b&mode=and` works entirely through the `TagRelation` collection — it avoids naive array filtering like `{ tags: { $all: [...] } }` directly on entity documents.

**Pipeline steps:**

1. Translate normalized tag strings → `ObjectID`s.
2. Use the `{ tagId: 1, entityType: 1 }` compound index to filter relations to matching tags immediately.
3. Depending on `mode`:
   - **OR mode** — Group by `entityId`, deduplicating matches. Any match qualifies.
   - **AND mode** — Group by `entityId`, push matched `tagId`s into a set. Assert that `$size` of the set equals the number of requested tags.
4. Use `$facet` to cleanly retrieve `$count` and paginate via `$skip` / `$limit`.
5. Perform a single `$lookup` to hydrate a maximum of 10 entity documents per page.

---

### 5. Indexing Strategy

| Collection | Index | Type | Reasoning |
|---|---|---|---|
| `Entity` | `{ type: 1 }` | Single | Optimizes filtering by polymorphic entity type. |
| `Tag` | `{ name: 1 }` | Unique Single | Enforces normalized string identity. Prevents duplicates and enables fast exact-match lookups. |
| `TagRelation` | `{ entityId: 1, tagId: 1 }` | Unique Compound | Prevents duplicate tag-entity pairings. Enforces data integrity under concurrent writes at the DB tier. |
| `TagRelation` | `{ tagId: 1, entityType: 1 }` | Compound | Core search index. Filters by tag ID and narrows by entity type in the first aggregation stage — no full collection scans. |

---

### 6. Extending Semantic Search

> *"How would you extend search to show related tags?"*

**Recommended: Embedding / Vector Similarity**

Map tag and entity text through an embedding model (e.g., `text-embedding-ada-002`) and store vectors in a dedicated field or a Vector DB (Milvus, Pinecone, or MongoDB Atlas Vector Search).

| Approach | Pros | Cons |
|---|---|---|
| **Vector Embeddings** ✅ | Captures true semantic meaning (`JS` ≈ `JavaScript` ≈ `Node`). No manual maintenance. Scales automatically. | High engineering complexity. ML model latency on ingest. Requires periodic re-embedding pipelines. |
| **Tag Hierarchy (Parent-Child)** | Simple to understand | Rigid. Cyclic graph issues (is `React` a child of `Frontend` or `Framework`?). |
| **Namespaces (`db/mongodb`)** | Prevents naming collisions | Requires users to know strict conventions — hurts UX. |

---

### 7. Where the System Breaks at Scale

- **Hot tags:** A single broad tag like `"bug"` attached to 100M+ entities would cause `$lookup` operations and `TagRelation` grouping aggregations to hit MongoDB's in-memory `$group` threshold.
- **Deep pagination:** Using `$skip` over heavily joined aggregations degrades badly at deep pages (e.g., page 50,000). Cursor-based pagination is required here.

---

### 8. Future Improvements

| Priority | Improvement | Rationale |
|---|---|---|
| High | **Async Cleanup Workers** | Implement a message queue (RabbitMQ / BullMQ) to handle tag relation teardown and `usageCount` decrements asynchronously on entity deletion. |
| High | **Cursor-Based Pagination** | Replace `$skip` / `$limit` with `_id`-based offset pagination for high-scale deep page performance. |
| Medium | **Redis Caching** | Cache the `/analytics` endpoint results — aggregations on `usageCount` history are expensive to run dynamically at scale. |
| Medium | **MongoDB Transactions** | Wrap entity delete + tag cleanup in a `session.withTransaction` to prevent partial-failure state corruption. |
| Low | **Fuzzy Tag Alias Resolution** | Pair with the 50-tag limit to prevent semantic duplicates like `js` / `javascript` / `node.js` from coexisting on the same entity. |

---

## Testing

```bash
# Run the full test suite
npm test

# Run tests in watch mode
npm run test:watch
```

Tests cover:
- Tag attachment idempotency and concurrency safety
- AND / OR search correctness across entity types
- Soft delete and tag relation cleanup
- Tag count boundary enforcement (50-tag limit)

---

## Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

Please ensure all tests pass before submitting a PR.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">Built with ❤️ for scalable systems</p>
