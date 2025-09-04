const express = require('express');
const router = express.Router();
const db = require('../../Config/db'); // mysql2 or mysql connection


router.get('/lead-assignments', async (req, res) => {
  try {
    const [assignments] = await db.query(`
      SELECT 
        el.id AS lead_id,
        el.assigned_by,
        el.assigned_to,
        e1.name AS assigned_to_name,
        e1.role AS assigned_to_role,
        e2.name AS manager_name,
        e2.id AS manager_id
      FROM emailleads el
      LEFT JOIN employees e1 ON el.assigned_to = e1.id
      LEFT JOIN employees e2 ON e1.managerId = e2.id
      WHERE el.assigned_to IS NOT NULL OR el.assigned_by IS NOT NULL
    `);

    const assignmentsByLeadId = assignments.reduce((acc, assignment) => {
      const role = assignment.assigned_to_role;
      acc[assignment.lead_id] = {
        assigned_by: assignment.assigned_by || null,
        assigned_to: assignment.assigned_to || null,
        assigned_to_name: assignment.assigned_to_name || 'Unassigned',
        assigned_to_role: role || null,
        manager_id: (role === 'manager' || role === 'admin') ? assignment.assigned_to : assignment.manager_id || null,
        manager_name: (role === 'manager' || role === 'admin') ? assignment.assigned_to_name : assignment.manager_name || 'No Manager',
        associate_id: role === 'employee' ? assignment.assigned_to : null,
        associate_name: role === 'employee' ? assignment.assigned_to_name : null
      };
      return acc;
    }, {});

    res.json(assignmentsByLeadId);
  } catch (err) {
    console.error('Error fetching lead assignments:', err);
    res.status(500).json({ message: 'Database error' });
  }
});

router.put('/leadcrm/:leadId/assign-user', async (req, res) => {
  const { leadId } = req.params;
  const { assigned_by, assigned_to } = req.body;

  if (!assigned_by || !assigned_to) {
    return res.status(400).json({ message: 'assigned_by and assigned_to are required' });
  }

  try {
    // Validate lead
    const [leadExists] = await db.query('SELECT id FROM emailleads WHERE id = ?', [leadId]);
    if (leadExists.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Validate employee
    const [employeeExists] = await db.query('SELECT id FROM employees WHERE id = ?', [assigned_to]);
    if (employeeExists.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Update assignment
    await db.query(
      'UPDATE emailleads SET assigned_by = ?, assigned_to = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?',
      [assigned_by, assigned_to, leadId]
    );

    // Fetch updated assignment
    const [updatedAssignment] = await db.query(
      `
      SELECT 
        el.id AS lead_id,
        el.assigned_by,
        el.assigned_to,
        e1.name AS assigned_to_name,
        e1.role AS assigned_to_role,
        e2.name AS manager_name,
        e2.id AS manager_id
      FROM emailleads el
      LEFT JOIN employees e1 ON el.assigned_to = e1.id
      LEFT JOIN employees e2 ON e1.managerId = e2.id
      WHERE el.id = ?
      `,
      [leadId]
    );

    const updated = updatedAssignment[0] || {};
    const role = updated.assigned_to_role;
    const data = {
      assigned_by: updated.assigned_by || null,
      assigned_to: updated.assigned_to || null,
      assigned_to_name: updated.assigned_to_name || 'Unassigned',
      assigned_to_role: role || null,
      manager_id: (role === 'manager' || role === 'admin') ? updated.assigned_to : updated.manager_id || null,
      manager_name: (role === 'manager' || role === 'admin') ? updated.assigned_to_name : updated.manager_name || 'No Manager',
      associate_id: role === 'employee' ? updated.assigned_to : null,
      associate_name: role === 'employee' ? updated.assigned_to_name : null
    };

    res.json({
      message: 'Assignment updated successfully',
      data,
    });
  } catch (err) {
    console.error('Error updating assignment:', err);
    res.status(500).json({ message: 'Database error' });
  }
});



module.exports = router;
