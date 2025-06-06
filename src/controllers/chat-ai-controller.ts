import { Request, Response } from "express";
import User, { IUserType } from "../models/user-model";
import Gym from "../models/gym-model";
import { fetchGymPurchaseInsights } from "./purchase-controller";
import GymController from "./gym-controller";
import { OpenAIClient, AzureKeyCredential } from "@azure/openai";



export const askAI = async (question: string): Promise<string | null> => {
  try {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
    const apiKey = process.env.AZURE_OPENAI_KEY!;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;

    const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));

    const chatMessages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: question }
    ];

    const response = await client.getChatCompletions(deployment, chatMessages, {
      maxTokens: 1000,
      temperature: 0.7,
      topP: 0.9,
    });

    const choice = response.choices?.[0]?.message?.content;
    return choice?.trim() || null;
  } catch (err) {
    console.error("Azure SDK error:", err);
    return null;
  }
};

class chatAIController {

  static async ask_question(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.params.id;
      const { question } = req.body;

      if (!question) {
        res.status(400).json({ error: "Question is required" });
        return;
      }

      const user = await User.findById(userId);
      const owner = await Gym.findById(userId);

      if (!user && !owner) {
        res.status(404).json({ message: "User or Gym Owner not found" });
        return;
      }

      const aiResponse = await askAI(question);

      if (!aiResponse) {
        res.status(500).json({ error: "AI response error" });
        return;
      }

      res.status(200).json({ message: aiResponse });
    } catch (err) {
      console.error("Error in ask_question:", err);
      res.status(500).json({ error: "Internal server error", message: err });
    }
  }

  static async suggest_pricing(req: Request, res: Response): Promise<void> {
    try {
      const { gymId } = req.params;
      const gym = await Gym.findById(gymId);

      if (!gym || !gym.owner) {
        res.status(404).json({ message: "Gym or Owner not found" });
        return;
      }

      const ratingStats = await GymController.fetchGymRatingStats(gymId);
      const purchaseStats = await fetchGymPurchaseInsights(gymId);

      const prices = gym.prices || [];
      const ratingThis = ratingStats?.data?.averageRatingThisGym || 0;
      const ratingCity = ratingStats?.data?.averageRatingCityGyms || 0;
      const purchasesThisWeek = purchaseStats?.purchasesCountInLastWeek || 0;
      const avgCityPurchases = purchaseStats?.averagePurchasesCountInCity || 0;

      const prompt = `
        You are an expert gym pricing strategist. 
        Given the following:
        - Gym name: ${gym.name}
        - City: ${gym.city}
        - Current prices: ${prices.join(", ")} (1-day, 3-day, 5-day)
        - Weekly purchases: ${purchasesThisWeek}
        - City average purchases: ${avgCityPurchases}
        - Gym rating: ${ratingThis}
        - City average rating: ${ratingCity}
        - Opening hours: 
          - Sunday–Thursday: ${gym.openingHours?.sundayToThursday?.from || "?"}–${gym.openingHours?.sundayToThursday?.to || "?"}
          - Friday: ${gym.openingHours?.friday?.from || "?"}–${gym.openingHours?.friday?.to || "?"}
          - Saturday: ${gym.openingHours?.saturday?.from || "?"}–${gym.openingHours?.saturday?.to || "?"}

        Suggest improved prices for this gym that balance affordability, competitiveness, and profitability. 
        Return the suggestion in this format:

        1-day pass: $X  
        3-day pass: $Y  
        5-day pass: $Z  
        `;

      const aiResponse = await askAI(prompt);

      if (!aiResponse) {
        res.status(500).json({ error: "AI response error" });
        return;
      }

      res.status(200).json({ message: aiResponse });
    } catch (err) {
      console.error("Error in suggest_pricing:", err);
      res.status(500).json({ error: "Internal server error", message: err });
    }
  }

}

export default chatAIController;
