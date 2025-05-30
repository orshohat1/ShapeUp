import multer, { StorageEngine } from "multer";
import fs from "fs";
import path from "path";

const FILE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpg",
};

const storage: StorageEngine = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "/app/uploads";

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const isValid = FILE_TYPES[file.mimetype];
    const error: Error | null = isValid ? null : new Error("Invalid image type");

    cb(error, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileName = file.originalname.replace(/\.[^/.]+$/, "").replace(/ /g, "-");
    const fileExtension = FILE_TYPES[file.mimetype];
    const timestamp = new Date(Date.now() + 4 * 60 * 60 * 1000)
      .toISOString()
      .replace(/:/g, "_");

    cb(null, `${fileName}-${timestamp}.${fileExtension}`);
  },
});

const upload = multer({ storage });

export default upload;
