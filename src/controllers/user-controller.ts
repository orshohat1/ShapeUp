import fs from "fs";
import path from "path";
import { Request, Response } from "express";
import { validationResult } from "express-validator";
import User, { IUserType } from "../models/user-model";
import Gym from "../models/gym-model";
import { getFromCookie } from "./auth-controller";
import CreditCard from "../models/creditcard-model";
import mongoose from 'mongoose';

class UserController {
  static async updateUserById(req: Request, res: Response): Promise<void> {
    const { firstName, lastName, street, city } = req.body;
    const { userId } = req.params;
    const protocol = process.env.NODE_ENV === "production" ? "https" : req.protocol;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        message: "Validation array is not empty",
        error: errors.array(),
      });
      return;
    }

    const avatar =
      req.files && "avatar" in req.files
        ? (req.files["avatar"] as Express.Multer.File[])[0]
        : null;

    try {
      const user = await User.findById(userId);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      // Handle avatar replacement
      let avatarUrl = user.avatarUrl;
      if (avatar) {
        UserController.deleteFile(user.avatarUrl);
        avatarUrl = `${protocol}://${req.get("host")}/src/uploads/${
          avatar.filename
        }`;
      }

      // Update user fields
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (city) user.city = city;
      if (street) user.street = street;
      if (avatarUrl) user.avatarUrl = avatarUrl;

      await user.save();

      res
        .status(200)
        .json({ message: "User details updated successfully", user });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static deleteFile(fileUrl?: string): void {
    if (!fileUrl) return;

    // Construct the full path to the file on the server
    const fileUrlPath = path.resolve(
      __dirname,
      "../..",
      "src",
      "uploads",
      path.basename(fileUrl)
    );
    if (fs.existsSync(fileUrlPath)) {
      fs.unlinkSync(fileUrlPath);
    }
  }

  static async getUserById(req: Request, res: Response): Promise<void> {
    const { userId } = req.params;

    try {
      const user = await User.findById(userId).populate("creditCard");

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      if (user.role !== IUserType.USER && user.role !== IUserType.GYM_OWNER) {
        res.status(403).json({ message: "Forbidden: Not a USER or GYM-OWNER" });
        return;
      }

      res.status(200).json(user);
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async getMyProfile(req: Request, res: Response): Promise<void> {
    const userID = await getFromCookie(req, res, "id");
    if (!userID) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    try {
      const user = await User.findById(userID);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      let userWithoutSensitiveData = JSON.parse(JSON.stringify(user));
      delete userWithoutSensitiveData.password;
      delete userWithoutSensitiveData.refreshTokens;

      res.status(200).json(userWithoutSensitiveData);
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async deleteUserById(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        message: "Validation failed",
        error: errors.array(),
      });
      return;
    }
  
    const { userId } = req.params;
    const requestingUserID = await getFromCookie(req, res, "id");
    const requestingUserRole = await getFromCookie(req, res, "role");
  
    try {
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
  
      // Prevent deleting admin accounts
      if (user.role === IUserType.ADMIN) {
        res.status(403).json({ message: "Admin accounts cannot be deleted" });
        return;
      }
  
      // Non-admins can only delete themselves
      if (requestingUserRole !== IUserType.ADMIN && userId !== requestingUserID) {
        res.status(403).json({ message: "Users can only delete themselves" });
        return;
      }
  
      // If user is a gym owner, delete all their gyms
      if (user.role === IUserType.GYM_OWNER) {
        await Gym.deleteMany({ owner: userId });
        UserController.deleteFile(user.gymOwnerLicenseImage);
      }

      UserController.deleteFile(user.avatarUrl);

      if (user.creditCard) {
        await CreditCard.findByIdAndDelete(user.creditCard);
      }

      await User.findByIdAndDelete(userId);
      res.status(200).json({ message: "User deleted successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Internal Server Error", error: err });
    }
  }
  
  static async addFavoriteGym(req: Request, res: Response): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        message: "Validation array is not empty",
        error: errors.array(),
      });
      return;
    }

    const { userId } = req.params;
    const { gymId } = req.body;

    try {
      const gym = await Gym.findById(gymId);
      if (!gym) {
        res.status(404).json({ message: "Gym not found" });
        return;
      }
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      if (user.favoriteGyms.includes(gymId)) {
        res.status(400).json({ message: "Gym already in favorites" });
        return;
      }
      user.favoriteGyms.push(gymId);
      await user.save();

      res.status(200).json({
        message: "Gym added to favorites successfully",
        favoriteGyms: user.favoriteGyms,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async deleteFavoriteGymById(
    req: Request,
    res: Response
  ): Promise<void> {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        message: "Validation array is not empty",
        error: errors.array(),
      });
      return;
    }

    try {
      const { userId, gymId } = req.params;

      const objectId = new mongoose.Types.ObjectId(gymId);

      const gym = await Gym.findById(objectId);
      if (!gym) {
        res.status(404).json({ message: "Gym not found" });
        return;
      }
  
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
  
      if (!user.favoriteGyms.includes(objectId)) {
        res.status(400).json({ message: "Gym is not in user's favorites" });
        return;
      }
  
      user.favoriteGyms = user.favoriteGyms.filter(
        (id) => id.toString() !== gymId
      );
      await user.save();
  
      res.status(200).json({
        message: "Gym removed from favorites successfully",
        favoriteGyms: user.favoriteGyms,
      });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async filterUsers(req: Request, res: Response): Promise<void> {
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

      // Perform a case-insensitive search using regular expressions on the firstName, lastName, and email fields
      // of the User collection to find users that match the search query.
      const users = await User.find({
        $or: [
          { firstName: { $regex: searchRegex } },
          { lastName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
        ],
      });

      if (users.length === 0) {
        res
          .status(200)
          .json({ message: "No users found matching the search criteria" });
        return;
      }

      res.status(200).json({ users });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }

  static async getAllUsers(_req: Request, res: Response): Promise<void> {
    try {
      const users = await User.find({});
      res.status(200).json({ users });
    } catch (err) {
      res.status(500).json({ message: "Internal server error", error: err });
    }
  }
}

export default UserController;
