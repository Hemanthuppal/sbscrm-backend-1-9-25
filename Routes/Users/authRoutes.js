const express = require('express');
const authController = require('../../Controller/authController');
const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post("/send-otp", authController.sendOtp);
router.post("/update-password", authController.updatePassword);

module.exports = router;
