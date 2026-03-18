import { Router } from "express";
import { AnalyticsService } from "../services/AnalyticsService";

export const analyticsRouter = Router();

analyticsRouter.get("/", async (req, res) => {
  const { days } = req.query;
  const d = days ? parseInt(days as string) : 30;

  const result = await AnalyticsService.getTagAnalytics(d);

  res.status(200).json(result);
});
