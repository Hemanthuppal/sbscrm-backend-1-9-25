const db = require('../Config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const employeeModel = require('../Models/employeeModel');
const transporter = require("../Mail/email");
const SECRET_KEY = 'your-secret-key';

const otpStore = {};

const register = async (req, res) => {
    const { name, mobile, email, password, role, assignManager } = req.body;
  
    // Validate required fields
    if (!name || !mobile || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
  
    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
  
      let managerName = null;
      let managerId = null;
  
      // Check for manager if role is employee
      if (role === 'employee' && assignManager) {
        // Fetch manager directly by ID
        const manager = await employeeModel.getManagerById(assignManager);
        if (manager) {
          managerName = manager.name;
          managerId = manager.id;
        } else {
          return res.status(400).json({ message: 'Invalid manager selected.' });
        }
      }
  
      // Prepare employee data for insertion
      const employeeData = {
        name,
        mobile,
        email,
        password: hashedPassword,
        role,
        managerName,
        managerId
      };
  
      // Register employee in database
      const [result] = await employeeModel.registerEmployee(employeeData);
  
      // Generate JWT token
      const token = jwt.sign(
        { id: result.insertId, email, role },
        SECRET_KEY,
        { expiresIn: '4h' }
      );
  
      res.status(201).json({
        message: 'User registered successfully.',
        data: result,
        token
      });
    } catch (error) {
      console.error('Error during registration:', error);
      res.status(500).json({ message: 'Server error.', error: error.message });
    }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const [result] = await employeeModel.getEmployeeByEmail(email);

    if (result.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const user = result[0];

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        role: user.role,
        assign_manager: user.assign_manager,
        managerId: user.managerId
      },
      SECRET_KEY,
      { expiresIn: '4h' }
    );
    
    res.status(200).json({
      message: 'Login successful.',
      token,
      id: user.id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      assign_manager: user.assign_manager,
      managerId: user.managerId
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const sendOtp = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    // Check if email exists
    const [results] = await db.query('SELECT * FROM employees WHERE email = ?', [email]);

    if (results.length === 0) {
      return res.status(404).json({ message: 'Email does not exist.' });
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000);
    otpStore[email] = otp;

    // Email the OTP
    const mailOptions = {
      from: 'iiiqbetsvarnaaz@gmail.com',
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}. This OTP is valid for 5 minutes.`,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'OTP sent to email.' });

    // Remove OTP after 5 minutes
    setTimeout(() => delete otpStore[email], 300000);
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ message: 'Error sending OTP.', error: error.message });
  }
};

const updatePassword = async (req, res) => {
  const { email, otp, newpassword, confirmpassword } = req.body;

  if (!email || !otp || !newpassword || !confirmpassword) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  if (newpassword !== confirmpassword) {
    return res.status(400).json({ message: 'Passwords do not match.' });
  }

  if (!otpStore[email] || otpStore[email] !== parseInt(otp)) {
    return res.status(400).json({ message: 'Invalid or expired OTP.' });
  }

  try {
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newpassword, 10);

    // Update password in database
    await db.query('UPDATE employees SET password = ?, updated_at = NOW() WHERE email = ?', [hashedPassword, email]);

    // Remove OTP after successful password update
    delete otpStore[email];

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ message: 'Error processing password update.', error: error.message });
  }
};

module.exports = {
  register,
  login,
  sendOtp,
  updatePassword,
};