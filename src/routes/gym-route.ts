import express from "express";
import { body, query, param } from "express-validator";
import upload from "../multer";
import GymController from "../controllers/gym-controller";
import verifyToken from "../middleware/verifyToken";
import { IUserType } from "../models/user-model";

const router = express.Router();

// Add a new gym
router.post(
    "/",
    upload.array("pictures", 5),
    [
        body("name").notEmpty().withMessage("Name is required."),
        body("city").notEmpty().withMessage("city is required."),
        body("street").notEmpty().withMessage("Street is required."),
        body("streetNumber").notEmpty().withMessage("Street number is required."),
        body("description").notEmpty().withMessage("Description is required."),
        query("owner")
            .notEmpty()
            .withMessage("Owner is required.")
            .isMongoId()
            .withMessage("Owner must be a valid MongoDB ObjectId."),
    ],
    GymController.addGym
);

router.put(
    "/:gymId",
    upload.fields([{ name: "pictures[]", maxCount: 5 }]),
    [
        param("gymId")
            .notEmpty()
            .withMessage("Gym ID is required.")
            .isMongoId()
            .withMessage("Gym ID must be a valid MongoDB ObjectId."),
        body("name").optional(),
        body("city").optional(),
        body("street").optional(),
        body("streetNumber").optional(),
        body("description").optional(),
        body("openingHours")
            .optional(),
        body("pictures")
            .optional()
            .isArray({ min: 1 })
            .withMessage("At least one picture is required"),
    ],
    GymController.updateGymById
);

router.get("/rating-stats/:gymId", GymController.getGymRatingStats);

router.get(
    "/",
    [
        query("owner")
            .isMongoId()
            .withMessage("Owner ID must be a valid MongoDB ObjectId")
            .optional(),
    ],
    GymController.getGyms
);

router.get(
    "/myGyms",
    verifyToken([IUserType.GYM_OWNER]),
    GymController.getMyGyms
);

router.delete(
    "/:gymId",
    verifyToken([IUserType.GYM_OWNER, IUserType.ADMIN]),
    GymController.deleteGymById
);

router.get("/filterGymsByPriceAndCity", verifyToken([IUserType.USER]), GymController.filterGymsByPriceAndCity);

router.get(
    "/filter",
    [
        query("search")
            .notEmpty()
            .withMessage("Search query is required")
            .isString()
            .withMessage("Search query must be a string")
    ],
    GymController.filterGyms
);

router.get(
    "/getAllGymsForAdmin",
    verifyToken([IUserType.ADMIN]),
    GymController.getAllGymsForAdmin
)


router.get("/apis/:gymId",
    [
        param("gymId").notEmpty()
    ],
    GymController.getGymById);

router.get(
    "/:gymId/purchased-users",
    verifyToken([IUserType.GYM_OWNER, IUserType.ADMIN]),
    GymController.getPurchasedUsersByGymId
);

export default router;
