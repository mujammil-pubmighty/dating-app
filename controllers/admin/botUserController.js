const Joi = require("joi");
const sequelize = require("../../config/db");
const bcrypt = require("bcryptjs");

const User = require("../../models/User");
const UserSetting = require("../../models/UserSetting");

const { getRealIp, normalizeInterests } = require("../../utils/helper");
const { logActivity } = require("../../utils/helpers/activityLogHelper");
const { publicUserAttributes, BCRYPT_ROUNDS } = require("../../utils/staticValues");
const { isAdminSessionValid } = require("../../utils/helpers/authHelper");
async function addBotUser(req, res) {
  try {
    const adminSession = await isAdminSessionValid(req);
    if (!adminSession.success) return res.status(401).json(adminSession);

    const adminId = Number(adminSession.data);
    if (!adminId || Number.isNaN(adminId)) {
      return res.status(401).json({ success: false, message: "Invalid admin session" });
    }

    const schema = Joi.object({
      username: Joi.string().trim().min(3).max(40).pattern(/^[a-zA-Z0-9._-]+$/).optional(),
      email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).optional().allow(null, ""),
      phone_number: Joi.string().trim().pattern(/^\+?[0-9]{7,15}$/).optional().allow(null, ""),

      password: Joi.string()
        .min(8)
        .max(128)
        .pattern(/[A-Z]/)
        .pattern(/[a-z]/)
        .pattern(/[0-9]/)
        .required(),

      gender: Joi.string().valid("male", "female", "other", "prefer_not_to_say").required(),

      city: Joi.string().trim().max(100).required(),
      state: Joi.string().trim().max(100).required(),
      country: Joi.string().trim().max(100).required(),
      address: Joi.string().trim().optional().allow(null, ""),

      dob: Joi.date().iso().required(),
      bio: Joi.string().trim().required(),

      looking_for: Joi.string()
        .valid(
          "Long Term",
          "Long Term, Open To Short",
          "Short Term, Open To Long",
          "Short Term Fun",
          "New Friends",
          "Still Figuring Out"
        )
        .required(),

      height: Joi.string().trim().max(250).required(),
      education: Joi.string().trim().max(200).required(),

      interests: Joi.alternatives()
        .try(
          Joi.array().items(Joi.string().trim().max(50)).max(6),
          Joi.string().trim().max(400)
        )
        .required(),
    }).required();

    const { error, value } = schema.validate(req.body, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details?.[0]?.message || "Invalid request",
        data: null,
      });
    }

    // Normalize email/phone
    const email =
      value.email && String(value.email).trim()
        ? String(value.email).trim().toLowerCase()
        : null;

    const phone =
      value.phone_number && String(value.phone_number).trim()
        ? String(value.phone_number).trim()
        : null;

    //  bot must have complete profile
    const requiredBotFields = [
      "gender",
      "dob",
      "bio",
      "city",
      "state",
      "country",
      "looking_for",
      "height",
      "education",
      "interests",
    ];

    const missing = requiredBotFields.filter((k) => {
      const val = value[k];
      if (val === undefined || val === null) return true;
      if (typeof val === "string" && val.trim() === "") return true;
      if (Array.isArray(val) && val.length === 0) return true;
      return false;
    });

    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Bot profile incomplete. Missing: ${missing.join(", ")}`,
        data: null,
      });
    }

    // normalizeInterests -> CSV string
    const interests = normalizeInterests(value.interests);
    if (!interests || typeof interests !== "string") {
      return res.status(400).json({ success: false, message: "Bot interests are required (max 6).", data: null });
    }

    const interestCount = interests
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean).length;

    if (interestCount === 0) {
      return res.status(400).json({ success: false, message: "Bot interests are required (max 6).", data: null });
    }

    // Username generation
    let username = value.username ? String(value.username).toLowerCase() : null;

    // Uniqueness checks
    const existingUsername = await User.findOne({ where: { username } });
    if (existingUsername) {
      return res.status(409).json({ success: false, message: "This username is already registered." });
    }

    if (email) {
      const existingEmail = await User.findOne({ where: { email } });
      if (existingEmail) {
        return res.status(409).json({ success: false, message: "This email is already registered." });
      }
    }

    if (phone) {
      const existingPhone = await User.findOne({ where: { phone } });
      if (existingPhone) {
        return res.status(409).json({ success: false, message: "This phone number is already registered." });
      }
    }

    const createdUser = await sequelize.transaction(async (transaction) => {
      const hashedPass = await bcrypt.hash(value.password, BCRYPT_ROUNDS);

      const userPayload = {
        username,
        email: email || null,
        phone: phone || null,
        password: hashedPass,
        register_type: "manual",
        ip_address: getRealIp(req),

        type: "bot",
        is_bot: 1,
        is_verified: true,
        bot_profile_completed: 1,
        created_by_admin_id: adminId,

        gender: value.gender,
        dob: value.dob,
        bio: value.bio,
        city: value.city,
        state: value.state,
        country: value.country,
        address: value.address || null,
        looking_for: value.looking_for,
        height: value.height,
        education: value.education,
        interests,
      };

      const user = await User.create(userPayload, { transaction });

      await UserSetting.findOrCreate({
        where: { user_id: user.id },
        defaults: { user_id: user.id },
        transaction,
      });

      return user;
    });

    try {
      await logActivity(req, {
        userId: adminId,
        action: "admin created bot user",
        entityType: "user",
        entityId: createdUser.id,
        metadata: { type: "bot", username: createdUser.username, is_bot: true },
      });
    } catch (_) {}

    await createdUser.reload({ attributes: publicUserAttributes });

    return res.status(201).json({
      success: true,
      message: "Bot user created successfully.",
      data: { user: createdUser },
    });
  } catch (err) {
    console.error("Error during addBotUser:", err);
    return res.status(500).json({ success: false, message: "Internal server error", data: null });
  }
}

async function updateBotUserProfile(req, res) {
  try {
    const adminSession = await isAdminSessionValid(req);
    if (!adminSession.success) return res.status(401).json(adminSession);

    const adminId = Number(adminSession.data);
    if (!adminId || Number.isNaN(adminId)) {
      return res.status(401).json({ success: false, message: "Invalid admin session", data: null });
    }

    const targetUserId = Number(req.params.userId);
    if (!targetUserId || Number.isNaN(targetUserId)) {
      return res.status(400).json({ success: false, message: "Invalid userId", data: null });
    }

    // IMPORTANT: Bot controller should NOT allow bot conversion fields
    const updateSchema = Joi.object({
      username: Joi.string().trim().min(3).max(40).pattern(/^[a-zA-Z0-9._-]+$/).optional().allow(null, ""),
      email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).optional().allow(null, ""),
      phone: Joi.string().trim().pattern(/^\+?[0-9]{7,15}$/).optional().allow(null, ""),
      gender: Joi.string().valid("male", "female", "other", "prefer_not_to_say").optional().allow(null),
      city: Joi.string().trim().max(100).optional().allow(null, ""),
      state: Joi.string().trim().max(100).optional().allow(null, ""),
      country: Joi.string().trim().max(100).optional().allow(null, ""),
      address: Joi.string().trim().optional().allow(null, ""),
      dob: Joi.date().iso().optional().allow(null, ""),
      bio: Joi.string().trim().optional().allow(null, ""),

      looking_for: Joi.string()
        .valid(
          "Long Term",
          "Long Term, Open To Short",
          "Short Term, Open To Long",
          "Short Term Fun",
          "New Friends",
          "Still Figuring Out"
        )
        .optional()
        .allow(null, ""),

      height: Joi.string().trim().max(250).optional().allow(null, ""),
      education: Joi.string().trim().max(200).optional().allow(null, ""),

      // interests stored as CSV in DB? if yes, accept string only here
      interests: Joi.string().trim().max(400).optional().allow(null, ""),

      // admin toggles (safe)
      is_verified: Joi.boolean().optional(),
      is_active: Joi.boolean().optional(),
    }).min(1);

    const { error, value } = updateSchema.validate(req.body || {}, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details?.[0]?.message || "Invalid request.",
        data: null,
      });
    }

    const changedFields = Object.keys(value);

    const updatedUser = await sequelize.transaction(async (transaction) => {
      const user = await User.findByPk(targetUserId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user || Number(user.is_deleted) === 1) {
        const err = new Error("User not found.");
        err.statusCode = 404;
        throw err;
      }

      // Ensure it is Bot user
      const isBot = Number(user.is_bot) === 1 || String(user.type) === "bot";
      if (isBot) {
        const err = new Error("This endpoint is only for Bot users.");
        err.statusCode = 400;
        throw err;
      }

      const updatableFields = [
        "username",
        "email",
        "phone",
        "gender",
        "city",
        "state",
        "country",
        "address",
        "dob",
        "bio",
        "looking_for",
        "height",
        "education",
        "interests",
        "is_verified",
        "is_active",
      ];

      const updates = {};
      for (const key of updatableFields) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          updates[key] = value[key] === "" ? null : value[key];
        }
      }

      if (!Object.keys(updates).length) {
        const err = new Error("No valid fields to update.");
        err.statusCode = 400;
        throw err;
      }

      // Force keep Bot identity
      updates.type = "Bot";
      updates.is_bot = 0;

      await user.update(updates, { transaction });
      return user;
    });

    try {
      await logActivity(req, {
        userId: adminId,
        action: "admin updated Bot user profile",
        entityType: "user",
        entityId: updatedUser.id,
        metadata: { changed_fields: changedFields },
      });
    } catch (_) {}

    await updatedUser.reload({ attributes: publicUserAttributes });

    return res.status(200).json({
      success: true,
      message: "Bot user profile updated successfully.",
      data: updatedUser,
    });
  } catch (err) {
    console.error("Error updateBotUserProfile:", err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
      data: null,
    });
  }
}

async function deleteBotUser(req, res) {
  try {
    const adminSession = await isAdminSessionValid(req);
    if (!adminSession.success) return res.status(401).json(adminSession);

    const { userId } = req.params;

    const user = await User.findOne({
      where: { id: userId, is_deleted: 0,  type: "bot"  },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: "Bot user not found or already deleted" });
    }

    await user.update({ is_deleted: 1 });

    return res.json({ success: true, message: "Bot user deleted successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

async function getBotUserById(req, res) {
  try {
    const adminSession = await isAdminSessionValid(req);
    if (!adminSession.success) return res.status(401).json(adminSession);

    // validate params
    const paramsSchema = Joi.object({
      userId: Joi.number().integer().positive().required(),
    });

    const { error, value } = paramsSchema.validate(
      { userId: req.params.userId },
      { abortEarly: true }
    );

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details?.[0]?.message || "Invalid userId",
        data: null,
      });
    }

    const userId = Number(value.userId);

    const user = await User.findOne({
      where: {
        id: userId,
        is_deleted: 0,
        type: "bot", 
      },
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Bot user not found or already deleted",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Bot user fetched successfully",
      data: { user },
    });
  } catch (err) {
    console.error("Error getBotUserById:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      data: null,
    });
  }
}

async function getAllUsers(req, res) {
  try {
    // Admin auth
    const adminSession = await isAdminSessionValid(req);
    if (!adminSession.success) return res.status(401).json(adminSession);

    // Query validation (all optional)
    const schema = Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(200).default(20),

      // optional filters
      type: Joi.string().valid("real", "bot").allow("", null).default(null),
      status: Joi.number().integer().valid(0, 1, 2, 3).allow(null).default(null),
      is_active: Joi.boolean().allow(null).default(null),
      is_verified: Joi.boolean().allow(null).default(null),

      // optional search
      search: Joi.string().trim().max(100).allow("", null).default(null),

      // sorting
      sortBy: Joi.string()
        .valid("created_at", "updated_at", "username", "email", "status", "last_active")
        .default("created_at"),
      sortOrder: Joi.string().valid("ASC", "DESC").default("DESC"),
    });

    const { error, value } = schema.validate(req.query || {}, {
      abortEarly: true,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        msg: error.details?.[0]?.message || "Invalid query params",
      });
    }

    const { page, limit, type, status, is_active, is_verified, search, sortBy, sortOrder } = value;
    const offset = (page - 1) * limit;

    const where = { is_deleted: 0 };

    if (type) where.type = type;
    if (status !== null && status !== undefined) where.status = status;
    if (is_active !== null) where.is_active = is_active;
    if (is_verified !== null) where.is_verified = is_verified;

    if (search && search.trim()) {
      const s = search.trim();
      where[Op.or] = [
        { username: { [Op.like]: `%${s}%` } },
        { email: { [Op.like]: `%${s}%` } },
        { phone: { [Op.like]: `%${s}%` } },
        { city: { [Op.like]: `%${s}%` } },
        { country: { [Op.like]: `%${s}%` } },
      ];
    }

    const { rows, count } = await User.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      attributes: { exclude: ["password"] }, // never return password
    });

    return res.status(200).json({
      success: true,
      msg: "Users fetched successfully",
      data: {
        items: rows, //  LIST OF USERS
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          perPage: limit,
        },
      },
    });
  } catch (err) {
    console.error("getAllUsers error:", err);
    return res.status(500).json({
      success: false,
      msg: "Internal server error",
    });
  }
}
module.exports = {
  addBotUser,
  updateBotUserProfile,
  deleteBotUser,
  getBotUserById,
  getAllUsers
};
