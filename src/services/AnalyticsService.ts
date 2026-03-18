import { Tag } from "../models/Tag";
import { TagRelation } from "../models/TagRelation";

export class AnalyticsService {
  /**
   * Returns analytics: Total usage count per tag, usage grouped by entity type, top N tags.
   */
  static async getTagAnalytics(days: number = 30) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    // 1. Global top tags by raw usage count
    const topTags = await Tag.find({ isDeleted: false })
      .sort({ usageCount: -1 })
      .limit(10)
      .select("name usageCount")
      .lean();

    // 2. Aggregate breakdown of Tag relations created in the last N days grouped by entity type
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: sinceDate },
        },
      },
      {
        $group: {
          _id: "$entityType",
          relationsCreated: { $sum: 1 },
        },
      },
    ];

    const entityTypeBreakdown = await TagRelation.aggregate(pipeline);

    // Reshape entity breakdown for the response
    const entityTypeUsage = entityTypeBreakdown.reduce((acc, curr) => {
      acc[curr._id] = curr.relationsCreated;
      return acc;
    }, {} as Record<string, number>);

    return {
      periodDays: days,
      topTags: topTags.map(t => ({ name: t.name, count: t.usageCount })),
      entityTypeUsage,
    };
  }
}
