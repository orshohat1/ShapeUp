import express from "express";
import { body, query, param } from "express-validator";
import upload from "../multer";
import GymController from "../controllers/gym-controller";
import verifyToken from "../middleware/verifyToken";
import { IUserType } from "../models/user-model";

const router = express.Router();

// Add a new gym
router.post(
    "/data", // v
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
    "/data/:gymId", // v
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

router.get("/data/rating-stats/:gymId", GymController.getGymRatingStats);

router.get(
    "/data", // v
    [
        query("owner")
            .isMongoId()
            .withMessage("Owner ID must be a valid MongoDB ObjectId")
            .optional(),
    ],
    GymController.getGyms
);

router.get(
    "/data/myGyms",
    verifyToken([IUserType.GYM_OWNER]),
    GymController.getMyGyms
);

router.delete( // v
    "/data/:gymId",
    verifyToken([IUserType.GYM_OWNER, IUserType.ADMIN]),
    GymController.deleteGymById
);

router.get("/data/filterGymsByPriceAndCity", verifyToken([IUserType.USER]), GymController.filterGymsByPriceAndCity);

router.get(
    "/data/filter", // v
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
    "/data/getAllGymsForAdmin", // v
    verifyToken([IUserType.ADMIN]),
    GymController.getAllGymsForAdmin
)


router.get("/data/:gymId", // v
    [
        param("gymId").notEmpty()
    ],
    GymController.getGymById);

router.get(
    "/data/:gymId/purchased-users", // v
    verifyToken([IUserType.GYM_OWNER, IUserType.ADMIN]),
    GymController.getPurchasedUsersByGymId
);

export default router;
