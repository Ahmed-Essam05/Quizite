import express from "express";

import { protect } from "../controllers/authController.js";
import { getOverview } from "../controllers/overviewController.js";

const router = express.Router();

router.get("/", protect, getOverview);

export default router;
