const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { JWT_SECRET } = require('../middleware/auth.middleware');

/**
 * 1. Single Sign-In & Login Handler (FR-01, FR-02)
 * Supports Email, Username, or LRN / Employee ID with bcrypt password verification
 * and optional Role validation check.
 */
async function login(req, res, next) {
  try {
    const { identifier, password, role } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Kailangan ang Email, LRN, o Employee ID at ang password.'
      });
    }

    const trimmedIdentifier = identifier.trim();

    // Query user record by email or lrn_or_id
    const { rows } = await db.query(
      `SELECT * FROM users WHERE email = ? OR lrn_or_id = ? LIMIT 1`,
      [trimmedIdentifier, trimmedIdentifier]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Maling kredensyal. Hindi natagpuan ang account sa talaan ng Aralytics.'
      });
    }

    const user = rows[0];

    // Verify bcrypt password hash
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Maling kredensyal. Hindi tumutugma ang ibinigay na password.'
      });
    }

    // Role verification (if role selector is specified from UI)
    if (role && role !== 'ALL' && role !== user.role) {
      return res.status(403).json({
        success: false,
        message: `Hindi Awtorisadong Pag-access: Ang account na ito ay rehistrado bilang ${
          user.role === 'TEACHER' ? 'Guro' : 'Mag-aaral'
        }. Paki-pili ang tamang role selector o gamitin ang kaukulang kredensyal.`
      });
    }

    const fullName = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const sectionId = user.section_id || user.section || null;

    // Secure JWT Payload (SRS Section 3.1 & 5.1, FR-02..04)
    const payload = {
      id: user.id,
      user_id: user.id,
      lrn_or_id: user.lrn_or_id,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: fullName,
      email: user.email,
      role: user.role,
      section: user.section,
      section_id: sectionId
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: `Maligayang pagdating, ${fullName}! Matagumpay ang iyong pag-login.`,
      token,
      user: payload
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 2. Session Logout Handler (FR-01)
 * Acknowledges session termination for client audit tracking
 */
async function logout(req, res, next) {
  try {
    res.json({
      success: true,
      message: 'Matagumpay na nag-logout sa Aralytics Learning Hub sesyon.'
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 3. Token Validation & Active Session Handshake (FR-02)
 * Verifies attached req.user JWT against live database record
 */
async function validateToken(req, res, next) {
  try {
    const userId = req.user.id || req.user.user_id;
    const { rows } = await db.query(
      `SELECT id, lrn_or_id, first_name, last_name, full_name, email, role, section, section_id, created_at FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Hindi natagpuan ang aktibong user record.'
      });
    }

    const user = rows[0];
    const fullName = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const sectionId = user.section_id || user.section || null;

    res.json({
      success: true,
      valid: true,
      user: {
        id: user.id,
        user_id: user.id,
        lrn_or_id: user.lrn_or_id,
        first_name: user.first_name,
        last_name: user.last_name,
        full_name: fullName,
        email: user.email,
        role: user.role,
        section: user.section,
        section_id: sectionId
      }
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 4. Current User Profile Handler (/api/auth/me)
 */
async function me(req, res, next) {
  return validateToken(req, res, next);
}

/**
 * 5. User Account Registration Handler (FR-01, SRS Section 5.1)
 */
async function register(req, res, next) {
  try {
    const { lrn_or_id, first_name, last_name, email, password, role, section, section_id } = req.body;

    if (!lrn_or_id || !first_name || !last_name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Lahat ng field (lrn_or_id, first_name, last_name, email, password) ay kailangan.'
      });
    }

    const assignedRole = role === 'TEACHER' ? 'TEACHER' : 'STUDENT';
    const assignedSection = assignedRole === 'STUDENT' ? (section_id || section || '10-Rizal') : null;
    const fullName = `${first_name.trim()} ${last_name.trim()}`;

    // Check existing by email or lrn_or_id
    const { rows: existing } = await db.query(
      `SELECT id FROM users WHERE email = ? OR lrn_or_id = ? LIMIT 1`,
      [email.trim(), lrn_or_id.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Mayroon nang account na nakarehistro gamit ang email o LRN/ID na ito.'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = `usr-${uuidv4()}`;

    await db.query(
      `INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role, section, section_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        lrn_or_id.trim(),
        first_name.trim(),
        last_name.trim(),
        fullName,
        email.trim(),
        passwordHash,
        assignedRole,
        assignedSection,
        assignedSection
      ]
    );

    const payload = {
      id: userId,
      user_id: userId,
      lrn_or_id: lrn_or_id.trim(),
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      full_name: fullName,
      email: email.trim(),
      role: assignedRole,
      section: assignedSection,
      section_id: assignedSection
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Matagumpay na narehistro ang account.',
      token,
      user: payload
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  logout,
  validateToken,
  me,
  register
};
