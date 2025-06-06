import express from "express";
import chatAIController from "../controllers/chat-ai-controller";
import { IUserType } from "../models/user-model";
import verifyToken from "../middleware/verifyToken";

const router = express.Router();

router.post("/suggest-pricing/:gymId", verifyToken([IUserType.GYM_OWNER]), chatAIController.suggest_pricing);


router.post("/:id", verifyToken([IUserType.USER, IUserType.GYM_OWNER]), chatAIController.ask_question);


export default router;
