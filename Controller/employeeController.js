const db = require('../Config/db');
const employeeModel = require('../Models/employeeModel');
const { updateEmployeeModel, adminupdateEmployeeModel } = require('../Models/employeeModel');

const getEmployees = async (req, res) => {
    const { role } = req.query;

    if (!role) {
      return res.status(400).json({ message: 'Role is required.' });
    }

    try {
      const employees = await employeeModel.getEmployeesByRole(role);
      res.status(200).json({ data: employees });
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ message: 'Server error.', error: error.message });
    }
};

const getManagers = async (req, res) => {
  try {
    const [result] = await employeeModel.getAllManagers();
    res.status(200).json({ message: 'Managers fetched successfully', data: result });
  } catch (error) {
    res.status(500).json({ message: 'Database error.', error: error.message });
  }
};

const getAllEmployeesWithManagers = async (req, res) => {
  try {
    const allEmployees = await employeeModel.getAllEmployees();
    const managers = allEmployees.filter(emp => emp.role === 'manager');
    
    const result = managers.map(manager => {
      const employeesUnderManager = allEmployees.filter(emp => emp.managerId === manager.id);
      return {
        ...manager,
        employeeCount: employeesUnderManager.length,
        teamMembers: employeesUnderManager,
      };
    });
    
    res.status(200).json({ data: result });
  } catch (error) {
    console.error('Error fetching all employees:', error);
    res.status(500).json({ message: 'Server error.', error: error.message });
  }
};

const getEmployeesByManagerId = async (req, res) => {
  const managerId = req.user.id; // Ensure req.user is set by authentication middleware

  try {
    const [results] = await db.query('SELECT id, name FROM employees WHERE managerId = ?', [managerId]);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Error fetching employees', error: error.message });
  }
};

const assignLead = async (req, res) => {
  const { leadid, employeeName, employeeId, managerId, userId, userName, status } = req.body;

  console.log("Received employee ID:", employeeId);
  console.log("Received employee Name:", employeeName);
  console.log("Received Manager Name (assign_to_manager):", userName);
  console.log("Received Manager ID (for reassignleads):", userId);
  console.log("Received Manager ID (for notifications):", managerId);

  try {
    await updateEmployeeModel(leadid, employeeName, employeeId, managerId, userId, userName, status);
    res.status(200).json({ message: "Assignee updated and notification sent." });
  } catch (error) {
    console.error('Error in updateEmployeeModel:', error);
    res.status(500).json({ message: 'Error updating lead or inserting notification', error: error.message });
  }
};

const adminassignLead = async (req, res) => {
  const { leadid, employeeName, employeeId, managerId, userId, userName, status } = req.body;

  console.log("Received employee ID:", employeeId);
  console.log("Received employee Name:", employeeName);
  console.log("Received Manager Name (assign_to_manager):", userName);
  console.log("Received Manager ID (for reassignleads):", userId);
  console.log("Received Manager ID (for notifications):", managerId);

  try {
    await adminupdateEmployeeModel(leadid, employeeName, employeeId, managerId, userId, userName, status);
    res.status(200).json({ message: "Assignee updated and notification sent." });
  } catch (error) {
    console.error('Error in adminupdateEmployeeModel:', error);
    res.status(500).json({ message: 'Error updating lead or inserting notification', error: error.message });
  }
};

const getEmployeesByManager = async (req, res) => {
  const managerId = req.params.managerId;

  try {
    const employees = await employeeModel.getEmployeesByManagerId(managerId);
    
    if (employees.length === 0) {
      return res.status(404).json({ message: 'No employees found for the selected manager' });
    }

    res.status(200).json(employees);
  } catch (error) {
    console.error('Error fetching employees by manager:', error);
    res.status(500).json({ message: 'Database query error', error: error.message });
  }
};

const deleteEmployee = async (req, res) => {
  const employeeId = req.params.id;

  try {
    const [result] = await db.query('DELETE FROM employees WHERE id = ?', [employeeId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ message: 'Database error', error: error.message });
  }
};

module.exports = {
  getEmployees,
  getManagers,
  getAllEmployeesWithManagers,
  getEmployeesByManagerId,
  assignLead,
  getEmployeesByManager,
  deleteEmployee,
  adminassignLead
};