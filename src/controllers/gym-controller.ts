import Gym from "../models/gym-model";
import Review from "../models/review-model";
import { Request, Response } from "express";
import { validationResult } from "express-validator";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";

import { getFromCookie } from "./auth-controller";
import User, { IGymOwnerStatus, IUserType } from "../models/user-model";
import Purchase from "../models/purchase-model";

class GymController {
  // Add a new gym
  static async addGym(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          message: "Validation array is not empty",
          error: errors.array(),
        });
        return;
      }

      let { name, city, street, streetNumber, description } = req.body;
      const ownerQueryString = req.query.owner as string;
      const protocol = process.env.NODE_ENV === "production" ? "https" : req.protocol;


      if (!req.files || !(req.files as Express.Multer.File[]).length) {
        res
          .status(400)
          .json({ message: "Please upload at least one picture." });
        return;
      }

      const ownerIdObject = new mongoose.Types.ObjectId(ownerQueryString);
      const gymOwner = await User.findById(ownerIdObject);

      if (!gymOwner) {
        res.status(400).json({ message: "Gym owner not found" });
        return;
      }

      if (gymOwner.gymOwnerStatus !== IGymOwnerStatus.APPROVED) {
        res
          .status(400)
          .json({ message: "Gym owner status must be approved" });
        return;
      }

      const pictures = (req.files as Express.Multer.File[]).map(
        (file) =>
          `${protocol}://${req.get("host")}/src/uploads/${file.filename}`
      );

      const defaultOpeningHours = {
        sundayToThursday: { from: "06:00", to: "23:00" },
        friday: { from: "06:00", to: "17:00" },
        saturday: { from: "09:00", to: "23:00" },
      };

      const newGym = new Gym({
        name,
        pictures,
        city,
        street,
        streetNumber,
        description,
        owner: ownerIdObject,
        openingHours: defaultOpeningHours,
        prices: [0, 0, 0],
      });

      await newGym.save();

      res.status(201).json({
        message: "Gym added successfully!",
        gym: newGym,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async filterGymsByPriceAndCity(req: Request, res: Response): Promise<void> {
    try {
      const minPrice = parseFloat(req.query.minPrice as string);
      const maxPrice = parseFloat(req.query.maxPrice as string);
      const city = req.query.city as string | undefined;

      const query: any = {};

      if (!isNaN(minPrice) && !isNaN(maxPrice)) {
        query.prices = {
          $elemMatch: {
            $gte: minPrice,
            $lte: maxPrice
          }
        };
      }

      if (city && typeof city === "string") {
        query.city = new RegExp(`^${city}$`, "i");
      }

      if (Object.keys(query).length === 0) {
        res.status(400).json({ message: "At least one filter (min/max price or city) must be provided" });
        return;
      }

      const gyms = await Gym.find(query);
      res.status(200).json({ gyms });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  // Update gym details
  static async updateGymById(req: Request, res: Response): Promise<void> {
    try {
      const protocol = process.env.NODE_ENV === "production" ? "https" : req.protocol;
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ message: "Validation error", error: errors.array() });
        return;
      }
  
      const { gymId } = req.params;
      const existingGym = await Gym.findById(gymId);
      if (!existingGym) {
        res.status(404).json({ message: "Gym not found" });
        return;
      }
  
      let { name, city, street, streetNumber, description, prices, openingHours } = req.body;
  
      if (typeof prices === "string") prices = JSON.parse(prices);
      if (typeof openingHours === "string") openingHours = JSON.parse(openingHours);
  
      const updateData: Partial<Record<string, any>> = {};
      if (name) updateData.name = name;
      if (city) updateData.city = city;
      if (description) updateData.description = description;
      if (street) updateData.street = street;         
      if (streetNumber) updateData.streetNumber = streetNumber; 
      if (prices && Array.isArray(prices) && prices.length === 3) updateData.prices = prices;
      if (
        openingHours?.sundayToThursday &&
        openingHours?.friday &&
        openingHours?.saturday
      ) {
        updateData.openingHours = openingHours;
      }
  
      // Handle images only if pictures or files are sent
      let pictures: string[] = existingGym.pictures; 
      if ("pictures" in req.body && Array.isArray(req.body.pictures)) {
        const retained = req.body.pictures as string[];
        const toDelete = pictures.filter((img) => !retained.includes(img));
  
        toDelete.forEach((image) => {
          const imagePath = path.join(__dirname, "../uploads", path.basename(image));
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        });
  
        pictures = retained;
      }
  
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files?.["pictures[]"]) {
        const uploaded = files["pictures[]"].map(
          (file) => `${protocol}://${req.get("host")}/src/uploads/${file.filename}`
        );
        pictures = [...pictures, ...uploaded];
      }
  
      if (pictures.length) {
        updateData.pictures = pictures;
      }
  
      const updatedGym = await Gym.findByIdAndUpdate(gymId, updateData, { new: true });
  
      res.status(200).json({ message: "Gym updated successfully", gym: updatedGym });
    } catch (err) {
      console.error("Error updating gym:", err);
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }
  
  // get all gyms or get gyms by owner
  static async getGyms(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        message: "Validation array is not empty",
        error: errors.array(),
      });
      return;
    }

    try {
      let gyms;
      if (req.query.owner) {
        const owner = req.query.owner as string;

        if (!mongoose.Types.ObjectId.isValid(owner)) {
          res.status(400).json({ error: "Invalid owner ID format" });
          return;
        }
        gyms = await Gym.find({ owner });
      } else {
        gyms = await Gym.find();
      }
      res.status(200).json({ gyms });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async getAllGymsForAdmin(req: Request, res: Response): Promise<void> {
    try {
      const gyms = await Gym.find({})
        .populate("owner", "firstName lastName email role")
        .lean();

      res.status(200).json({ gyms });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async getMyGyms(req: Request, res: Response): Promise<void> {
    try {
      const myUserId = await getFromCookie(req, res, "id");
      let gyms;
      if (!mongoose.Types.ObjectId.isValid(myUserId)) {
        res.status(400).json({ error: "Invalid user ID format" });
        return;
      }
      gyms = await Gym.find({ owner: myUserId });
      res.status(200).json({ gyms });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  // Get gym details by Id
  static async getGymById(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          message: "Validation array is not empty",
          error: errors.array(),
        });
        return;
      }

      const { gymId } = req.params;

      const existingGym = await Gym.findById(gymId);
      if (!existingGym) {
        res.status(404).json({ message: "Gym not found" });
        return;
      }

      res
        .status(200)
        .json({ message: "Gym extracted successfully", gym: existingGym });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async fetchGymRatingStats(gymId: string) {
    if (!mongoose.Types.ObjectId.isValid(gymId)) {
      return {
        success: false,
        message: "Invalid gym ID.",
        data: null,
      };
    }
  
    const gym = await Gym.findById(gymId);
    if (!gym) {
      return {
        success: false,
        message: "Gym not found.",
        data: null,
      };
    }
  
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
    const [gymAvg] = await Review.aggregate([
      {
        $match: {
          gym: new mongoose.Types.ObjectId(gymId),
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
        },
      },
    ]);
  
    const gymsInCity = await Gym.find(
      { city: gym.city, _id: { $ne: gym._id } },
      { _id: 1 }
    );
  
    const gymIds = gymsInCity.map((g) => g._id);
  
    const [cityAvg] = await Review.aggregate([
      {
        $match: {
          gym: { $in: gymIds },
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
        },
      },
    ]);
  
    return {
      success: true,
      message: "Gym rating stats fetched successfully.",
      data: {
        gymId,
        gymName: gym.name,
        city: gym.city,
        averageRatingThisGym: gymAvg?.avgRating ?? null,
        averageRatingCityGyms: cityAvg?.avgRating ?? null,
      },
    };
  }  
  

  static async getGymRatingStats(req: Request, res: Response): Promise<void> {
    const { gymId } = req.params;
    const result = await GymController.fetchGymRatingStats(gymId);
  
    if (!result.success) {
      res.status(404).json({ message: result.message });
      return;
    }
  
    res.status(200).json(result.data);
  }
  


  static async deleteGymById(req: Request, res: Response): Promise<void> {
    try {
      const { gymId } = req.params;
      const gym = await Gym.findById(gymId);
      if (!gym) {
        res.status(404).json({ message: "Gym not found" });
        return;
      }
      if (
        gym.owner.toString() !== (await getFromCookie(req, res, "id")) &&
        IUserType.ADMIN !== (await getFromCookie(req, res, "role"))
      ) {
        res.status(403).json({
          message: "Forbidden. You don't have access to this resource",
        });
        return;
      }

      if (gym.pictures) {
        await Gym.findByIdAndDelete(gymId);
        gym.pictures.forEach((image) => {
          const imagePath = path.join(
            __dirname,
            "../uploads",
            path.basename(image)
          );
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        });
      }
      res.status(200).json({ message: "Gym deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async filterGyms(req: Request, res: Response): Promise<void> {
    const { search } = req.query;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        message: "Validation array is not empty",
        error: errors.array(),
      });
      return;
    }

    if (!search || typeof search !== "string") {
      res
        .status(400)
        .json({ message: "Search query is required and must be a string" });
      return;
    }

    try {
      const searchRegex = new RegExp(search, "i");

      const gyms = await Gym.find({
        $or: [
          { name: { $regex: searchRegex } },
          { city: { $regex: searchRegex } },
        ],
      });

      if (gyms.length === 0) {
        res
          .status(200)
          .json({ message: "No gyms found matching the search criteria" });
        return;
      }

      res.status(200).json({ gyms });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async getPurchasedUsersByGymId(req: Request, res: Response): Promise<void> {
    try {
      const { gymId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(gymId)) {
        res.status(400).json({ message: "Invalid gym ID format" });
        return;
      }

      const purchases = await Purchase.find({ gym: gymId })
        .populate<{ user: { _id: string; firstName: string; lastName: string; email: string; avatarUrl: string } }>("user", "_id firstName lastName email avatarUrl")
        .lean();

      const uniqueUsersMap = new Map();

      purchases.forEach((purchase) => {
        const user = purchase.user;
        if (!uniqueUsersMap.has(user._id.toString())) {
          uniqueUsersMap.set(user._id.toString(), {
            _id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            avatarUrl: user.avatarUrl,
            validFrom: purchase.startDate,
            validUntil: purchase.endDate,
            code: purchase.personalCode
          });
        }
      });

      res.status(200).json({ users: Array.from(uniqueUsersMap.values()) });

    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

}

export default GymController;
