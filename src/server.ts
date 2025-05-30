import express from "express";
import cors from "cors";
import passport from "passport";
import session from "express-session";
import cookieParser from "cookie-parser";
import swaggerUi from 'swagger-ui-express';
import yaml from 'yamljs';
import { Server } from 'socket.io';
import * as http from "http";
import path from 'path';
import cron from 'node-cron';
import { connectDb } from "./mongodb";
import { initChat } from "./chat/chat-server";
import "./controllers/auth-controller";
import GymRouter from "./routes/gym-route"
import userRouter from "./routes/user-route";
import reviewRouter from "./routes/review-route";
import chatAIRouter from "./routes/chat-ai-route";
import adminRouter from "./routes/admin-route";
import creditcardRouter from "./routes/creditcard-route";
import purchaseRouter from "./routes/purchase-route";
import GymController from "./controllers/gym-controller";
import { fetchGymPurchaseInsights } from "./controllers/purchase-controller";
import Gym from "./models/gym-model";
import { askAI } from "./controllers/chat-ai-controller";


const app: any = express();
const swaggerDocument = yaml.load('./swagger.yaml');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/src/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/src/assets', express.static(path.join(__dirname, 'assets')));

// Google OAuth
app.use(session({ secret: "cats", resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// Use cookies
app.use(cookieParser());

// Access variables using process.env
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
export const socketIOServer = new Server(server, {
  path: "/users-chat",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
initChat(socketIOServer)
server.listen(process.env.HTTP_SERVER_PORT, () => {
  console.log(`Chat server is running on port ${process.env.HTTP_SERVER_PORT}`);
});

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:4000", "http://localhost:8081", "http://shapeup.cs.colman.ac.il", "https://shapeup.cs.colman.ac.il"], // Allow multiple origins
    credentials: true, // Allow sending cookies
  })
);

app.use("/gyms", GymRouter);
app.use("/users", userRouter);
app.use("/reviews", reviewRouter);
app.use("/askChatAi", chatAIRouter);
app.use("/admin", adminRouter);
app.use("/creditcard", creditcardRouter);
app.use("/purchase", purchaseRouter);

export default app;

export async function startServer(port = PORT) {
  await connectDb();
  return app.listen(port, () => console.log(`Server is up at ${port}`));
}

if (require.main === module) {
  (async () => {
    await startServer(PORT);
  })();
}


cron.schedule("0 0 * * 0", async () => {
  try
  {
    console.log("[CRON] Starting weekly gym stats AI analysis");
    let question = "I will send you details about each gym. please remember them for future use. ";
    const gyms = await Gym.find({}, { _id: 1, name: 1, openingHours: 1 });
    for (const gym of gyms) {
      const result = await GymController.fetchGymRatingStats(gym._id.toString());

      if (!result.success || !result.data) {
        continue;
      }
      
      const { averageRatingThisGym, averageRatingCityGyms } = result.data;
      question += `\n ${gym._id.toString()}: average ratings this gym: ${averageRatingThisGym}, average ratings for city gyms: ${averageRatingCityGyms}, `
      const insights = await fetchGymPurchaseInsights(gym._id.toString());
      
      if (!insights) continue;

      question += `purchases in last week: ${insights.purchasesCountInLastWeek}, Average purchases in same city: ${insights.averagePurchasesCountInCity}, `;
      
      if (
        gym.openingHours &&
        gym.openingHours.sundayToThursday &&
        gym.openingHours.friday &&
        gym.openingHours.saturday
      ) {
        question += `Opening Hours: - Sunday to Thursday: ${gym.openingHours.sundayToThursday.from} to ${gym.openingHours.sundayToThursday.to} - Friday: ${gym.openingHours.friday.from} to ${gym.openingHours.friday.to} - Saturday: ${gym.openingHours.saturday.from} to ${gym.openingHours.saturday.to}`;  
    }
    await askAI(question);
    console.log("[CRON] Weekly analysis completed");
    }
  } catch (error) {
      console.error("[CRON] Error during weekly gym stats AI analysis:", error);
}});
