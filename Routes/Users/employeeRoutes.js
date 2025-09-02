const express = require('express');
const employeeController = require('../../Controller/employeeController');
const authenticateJWT = require('../../middlewares/authenticateJWT');
const router = express.Router();

const { getEmployeesByManagerId } = require('../../Controller/employeeController');



router.get('/employees', authenticateJWT, employeeController.getEmployees);
router.get('/managers',  employeeController.getManagers);


router.get('/employees', employeeController.getEmployees);

// Route to get all employees and their count under managers
router.get('/employees/managers', employeeController.getAllEmployeesWithManagers);


router.get('/employeesassign',authenticateJWT, getEmployeesByManagerId);


router.get('/employees/:managerId', employeeController.getEmployeesByManager);


router.delete('/employees/:id', employeeController.deleteEmployee);

module.exports = router;
