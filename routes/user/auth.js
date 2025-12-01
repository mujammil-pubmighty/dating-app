const express = require("express");
const router = express.Router();

const authController = require("../../controllers/user/authController");
const utilController = require("../../config/utilController");
const matchingController = require("../../controllers/user/matchingController");
router.get("/setting", utilController.getAllOptions);

router.post("/register/google", authController.registerWithEmail);
router.post("/register", authController.registerUser);
router.post("/register/verify", authController.verifyRegister);
router.post("/login", authController.loginUser);
router.post("/forgot-password", authController.forgotPassword);
router.post("/forgot-password/verify", authController.forgotPasswordVerify);

router.post("/like", matchingController.likeUser);
router.post("/reject", matchingController.rejectUser);
router.post("/match", matchingController.matchUser);


module.exports = router;
