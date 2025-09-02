const db = require('../Config/db');

const getManagerById = async (managerId) => {
    const query = 'SELECT id, name FROM employees WHERE id = ? AND role = "manager"';
    const [result] = await db.query(query, [managerId]);
    return result.length > 0 ? result[0] : null;
};

const registerEmployee = async (employeeData) => {
    const { name, mobile, email, password, role, managerName, managerId } = employeeData;
    const query = `
      INSERT INTO employees (name, mobile, email, password, role, assign_manager, managerId, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const values = [name, mobile, email, password, role, managerName, managerId];
    return db.query(query, values);
};

const getAllManagers = async () => {
    const query = 'SELECT id, name FROM employees WHERE role = "manager"';
    return db.query(query);
};

const getEmployeeByEmail = async (email) => {
    const query = 'SELECT * FROM employees WHERE email = ?';
    return db.query(query, [email]);
};

const getEmployeesByRole = async (role) => {
    const query = `SELECT * FROM employees WHERE role = ?`;
    const [result] = await db.query(query, [role]);
    return result;
};

const getAllEmployees = async () => {
    const query = `SELECT * FROM employees`;
    const [result] = await db.query(query);
    return result;
};

const getEmployeesByManagerId = async (managerId) => {
    const query = 'SELECT * FROM employees WHERE managerId = ?';
    const [results] = await db.query(query, [managerId]);
    return results;
};

const updateEmployeeModel = async (leadid, employeeName, employeeId, managerId, userId, userName, status) => {
    try {
        // Update the addleads record with the new assignee information
        const updateLeadQuery = 'UPDATE addleads SET assignedSalesName = ?, assignedSalesId = ? WHERE leadid = ?';
        const [updateResult] = await db.query(updateLeadQuery, [employeeName, employeeId, leadid]);

        // Insert a new record into reassignleads
        const insertReassignQuery = `
            INSERT INTO reassignleads (
                leadid, assignedSalesId, assignedSalesName, assign_to_manager, managerid, status
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [reassignResult] = await db.query(insertReassignQuery, [leadid, employeeId, employeeName, userName, userId, status]);

        // Insert a notification for the manager
        const notificationMessage = `(Manager) assigned you a ${status}`;
        const insertNotificationQuery = `
            INSERT INTO notifications (employeeId, leadid, managerid, name, message, createdAt, \`read\`, status)
            VALUES (?, ?, ?, ?, ?, NOW(), 0, ?)
        `;
        const [notificationResult] = await db.query(insertNotificationQuery, [employeeId, leadid, managerId, userName, notificationMessage, status]);

        return { updateResult, reassignResult, notificationResult };
    } catch (error) {
        throw error;
    }
};

const adminupdateEmployeeModel = async (leadid, employeeName, employeeId, managerId, userId, userName, status) => {
    try {
        // Update the addleads record with the new assignee information
        const updateLeadQuery = 'UPDATE addleads SET assignedSalesName = ?, assignedSalesId = ? WHERE leadid = ?';
        const [updateResult] = await db.query(updateLeadQuery, [employeeName, employeeId, leadid]);

        // Insert a new record into reassignleads
        const insertReassignQuery = `
            INSERT INTO reassignleads (
                leadid, assignedSalesId, assignedSalesName, assign_to_manager, managerid, status
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [reassignResult] = await db.query(insertReassignQuery, [leadid, employeeId, employeeName, userName, userId, status]);

        // Insert a notification for the manager
        const notificationMessage = `Admin assigned you a ${status}`;
        const insertNotificationQuery = `
            INSERT INTO notifications (employeeId, leadid, managerid, name, message, createdAt, \`read\`, status)
            VALUES (?, ?, ?, ?, ?, NOW(), 0, ?)
        `;
        const [notificationResult] = await db.query(insertNotificationQuery, [employeeId, leadid, managerId, userName, notificationMessage, status]);

        return { updateResult, reassignResult, notificationResult };
    } catch (error) {
        throw error;
    }
};

module.exports = {
    registerEmployee,
    getAllEmployees,
    getAllManagers,
    getEmployeeByEmail,
    getManagerById,
    getEmployeesByRole,
    getEmployeesByManagerId,
    updateEmployeeModel,
    adminupdateEmployeeModel
};