const router = require("express").Router();
const authController = require("../../controllers/admin/authController");
const adminController = require("../../controllers/admin/adminController");
const { fileUploader } = require("../../utils/helpers/fileUpload");

const multer = require("multer");

// memory storage is best (your uploadFile helper will write it)
const upload = multer({ storage: multer.memoryStorage() });

// auth
router.post("/login", authController.adminLogin);
router.post("/login/verify", authController.verifyAdminLogin);
router.post("/resend-send-otp", authController.sendOTPAgain);
router.post("/forgot-password", authController.forgotAdminPassword);
router.post("/forgot-password/verify", authController.verifyForgotPassword);

router.post(
  "/coin-packages/add",
  fileUploader.single("cover"),
  adminController.addCoinPackage
);

// admins
router.get("/admins", adminController.getAdmins);
router.post("/add", upload.single("avtar"), adminController.addAdmin);

router.post("/:id", fileUploader.single("avtar"), adminController.editAdmin);

router.get("/:id", adminController.getAdminById);

module.exports = router;
