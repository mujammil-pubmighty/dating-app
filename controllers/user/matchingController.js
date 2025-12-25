const { Op } = require("sequelize");
const Joi = require("joi");
const sequelize = require("../../config/db");
const User = require("../../models/User");
const UserInteraction = require("../../models/UserInteraction");
const { isUserSessionValid } = require("../../utils/helpers/authHelper");
const {
  getOrCreateChatBetweenUsers,
} = require("../../utils/helpers/chatHelper");

async function likeUser(req, res) {
  // 1) Validate input
  const schema = Joi.object({
    target_user_id: Joi.number().integer().positive().required(),
  });

  const { error, value } = schema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details?.[0]?.message || "Invalid payload",
      data: null,
    });
  }

  // 2) Validate session
  const session = await isUserSessionValid(req);
  if (!session?.success) {
    return res.status(401).json(session);
  }

  const userId = Number(session.data);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({
      success: false,
      message: "Invalid session",
      data: null,
    });
  }

  const targetUserId = Number(value.target_user_id);

  if (userId === targetUserId) {
    return res.status(400).json({
      success: false,
      message: "You cannot like yourself.",
      data: null,
    });
  }

  const transaction = await sequelize.transaction();
  try {
    // 3) Fetch target user (inside transaction for consistency)
    const targetUser = await User.findOne({
      where: {
        id: targetUserId,
        is_active: true,
        status: 1,
      },
      transaction,
      attributes: ["id", "type", "is_active", "status"],
    });

    if (!targetUser) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Target user not found.",
        data: null,
      });
    }

    // 4) Lock existing interaction row (prevents race double-like)
    const existing = await UserInteraction.findOne({
      where: { user_id: userId, target_user_id: targetUserId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const previousAction = existing?.action ?? null;

    if (previousAction === "like" || previousAction === "match") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "You have already liked or matched with this user.",
        data: null,
      });
    }

    // 5) Decide behavior
    const isTargetBot = String(targetUser.type || "").toLowerCase() === "bot";

    // Lock reverse row too (important for mutual match race)
    const reverse = await UserInteraction.findOne({
      where: { user_id: targetUserId, target_user_id: userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const reverseAction = reverse?.action ?? null;

    // Determine match rules
    // - If target is bot => instant match
    // - If target is human => match only if target already liked you
    const isHumanMutual = !isTargetBot && reverseAction === "like";
    const isMatch = isTargetBot || isHumanMutual;

    const newAction = isMatch ? "match" : "like";
    const newIsMutual = isMatch ? true : false;

    // 6) Write forward row (actor -> target)
    if (existing) {
      await existing.update(
        { action: newAction, is_mutual: newIsMutual },
        { transaction }
      );
    } else {
      await UserInteraction.create(
        {
          user_id: userId,
          target_user_id: targetUserId,
          action: newAction,
          is_mutual: newIsMutual,
        },
        { transaction }
      );
    }

    // 6.1) If match, write reverse row too (target -> actor) to keep symmetry
    if (isMatch) {
      if (reverse) {
        await reverse.update(
          { action: "match", is_mutual: true },
          { transaction }
        );
      } else {
        await UserInteraction.create(
          {
            user_id: targetUserId,
            target_user_id: userId,
            action: "match",
            is_mutual: true,
          },
          { transaction }
        );
      }
    }

    // 7) Update counters ONLY for the acting user (you). Don’t touch target counters.
    // 7.1) Update total_matches ONLY if this is a NEW match
    const isNewMatch =
      isMatch && (previousAction !== "match" || reverseAction !== "match");

    if (isNewMatch) {
      // increment match count for BOTH users
      await User.update(
        {
          total_matches: sequelize.literal("total_matches + 1"),
        },
        {
          where: {
            id: { [Op.in]: [userId, targetUserId] },
          },
          transaction,
        }
      );
    }

    // If REJECT -> LIKE/MATCH: +1 like, -1 reject (clamped)
    if (previousAction === "reject") {
      await User.update(
        {
          total_likes: sequelize.literal("total_likes + 1"),
          total_rejects: sequelize.literal("GREATEST(total_rejects - 1, 0)"),
        },
        { where: { id: userId }, transaction }
      );
    } else if (!previousAction) {
      await User.update(
        { total_likes: sequelize.literal("total_likes + 1") },
        { where: { id: userId }, transaction }
      );
    }

    // 8) Create chat only when match (bots only here)
    let chat = null;
    if (isMatch) {
      chat = await getOrCreateChatBetweenUsers(
        userId,
        targetUserId,
        transaction
      );
    }
    // TODO: Send notification to target user if human of like recived and matched

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: isBot ? "You got matched!" : "Liked successfully.",
      data: {
        target_user_id: targetUserId,
        target_type: targetUser.type,
        is_match: isMatch,
        chat_id: chat?.id || null,
      },
    });
  } catch (err) {
    console.error("Error during likeUser:", err);
    await transaction.rollback();
    return res.status(500).json({
      success: false,
      message: "Failed to like.",
      data: null,
    });
  }
}

async function rejectUser(req, res) {
  // 1) Validate input
  const schema = Joi.object({
    target_user_id: Joi.number().integer().positive().required(),
  });

  const { error, value } = schema.validate(req.body, {
    abortEarly: true,
    stripUnknown: true,
    convert: true,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details?.[0]?.message || "Invalid payload",
      data: null,
    });
  }

  // 2) Validate session
  const session = await isUserSessionValid(req);
  if (!session?.success) {
    return res.status(401).json(session);
  }

  const userId = Number(session.data);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(401).json({
      success: false,
      message: "Invalid session",
      data: null,
    });
  }

  const targetUserId = Number(value.target_user_id);

  if (userId === targetUserId) {
    return res.status(400).json({
      success: false,
      message: "You cannot reject yourself.",
      data: null,
    });
  }

  const transaction = await sequelize.transaction();
  try {
    // 3) Fetch target user (inside transaction for consistency)
    const targetUser = await User.findOne({
      where: {
        id: targetUserId,
        is_active: true,
        status: 1,
      },
      transaction,
      attributes: ["id", "type", "is_active", "status"],
    });

    if (!targetUser) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Target user not found.",
        data: null,
      });
    }

    // 4) Lock existing interaction row (prevents race double updates)
    const existing = await UserInteraction.findOne({
      where: { user_id: userId, target_user_id: targetUserId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const previousAction = existing?.action ?? null;

    // Lock reverse row too (important for breaking mutual match safely)
    const reverse = await UserInteraction.findOne({
      where: { user_id: targetUserId, target_user_id: userId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const reverseAction = reverse?.action ?? null;

    // 5) If already rejected, don’t double-count
    if (previousAction === "reject") {
      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: "Rejected.",
        data: {
          target_user_id: targetUserId,
          target_type: targetUser.type,
        },
      });
    }

    // 6) Write forward row as reject
    if (existing) {
      await existing.update(
        { action: "reject", is_mutual: false },
        { transaction }
      );
    } else {
      await UserInteraction.create(
        {
          user_id: userId,
          target_user_id: targetUserId,
          action: "reject",
          is_mutual: false,
        },
        { transaction }
      );
    }

    // 7) If there was a match, break it symmetrically and decrement matches for BOTH
    const wasMatch = previousAction === "match" || reverseAction === "match";
    if (wasMatch) {
      // Ensure reverse row is not left as match
      if (reverse) {
        // If the other side is match/like, you can decide desired behavior.
        // Here: if you reject, we force reverse to "reject" only if it was match,
        // otherwise we keep whatever they had (like) but remove mutuality.
        const nextReverseAction = reverseAction === "match" ? "reject" : reverseAction;

        await reverse.update(
          { action: nextReverseAction, is_mutual: false },
          { transaction }
        );
      }

      await User.update(
        {
          total_matches: sequelize.literal("GREATEST(total_matches - 1, 0)"),
        },
        {
          where: { id: { [Op.in]: [userId, targetUserId] } },
          transaction,
        }
      );
    }

    // 8) Update counters for ACTOR ONLY (likes/rejects)
    // If LIKE/MATCH -> REJECT: -1 like (clamped), +1 reject
    if (previousAction === "like" || previousAction === "match") {
      await User.update(
        {
          total_likes: sequelize.literal("GREATEST(total_likes - 1, 0)"),
          total_rejects: sequelize.literal("total_rejects + 1"),
        },
        { where: { id: userId }, transaction }
      );
    } else {
      // from null -> reject
      await User.update(
        { total_rejects: sequelize.literal("total_rejects + 1") },
        { where: { id: userId }, transaction }
      );
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Rejected.",
      data: {
        target_user_id: targetUserId,
        target_type: targetUser.type,
      },
    });
  } catch (err) {
    console.error("Error during rejectUser:", err);
    await transaction.rollback();
    return res.status(500).json({
      success: false,
      message: "Failed to reject.",
      data: null,
    });
  }
}

async function matchUser(req, res) {
  const transaction = await sequelize.transaction();

  try {
    //  Validate body
    const schema = Joi.object({
      target_user_id: Joi.number().integer().required(),
    });

    const { error, value } = schema.validate(req.body, { abortEarly: true });

    if (error) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { target_user_id: targetUserId } = value;

    // Validate session
    const isSessionValid = await isUserSessionValid(req);
    if (!isSessionValid.success) {
      await transaction.rollback();
      return res.status(401).json(isSessionValid);
    }

    const userId = isSessionValid.data;

    if (!userId) {
      await transaction.rollback();
      return res.status(401).json({
        success: false,
        message: "Invalid session.",
      });
    }

    if (Number(userId) === Number(targetUserId)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "You cannot match with yourself.",
      });
    }

    //  Target must be an active BOT
    const targetUser = await User.findByPk(targetUserId, { transaction });

    if (!targetUser || !targetUser.is_active) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Target user not found or inactive.",
      });
    }

    if (targetUser.type !== "bot") {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "You can only match with user2 profiles in this app.",
      });
    }
    const existingInteraction = await UserInteraction.findOne({
      where: {
        user_id: Number(userId),
        target_user_id: Number(targetUserId),
      },
      transaction,
    });

    const previousAction = existingInteraction
      ? existingInteraction.action
      : null;

    if (previousAction === "like" || previousAction === "match") {
    } else if (previousAction === "reject") {
      await User.increment(
        { total_likes: 1, total_rejects: -1 },
        { where: { id: userId }, transaction }
      );
    } else {
      await User.increment(
        { total_likes: 1 },
        { where: { id: userId }, transaction }
      );
    }
    const { newlyCreated } = await makeMutualMatch(
      Number(userId),
      Number(targetUserId),
      transaction
    );

    let chat = null;

    if (newlyCreated) {
      chat = await getOrCreateChatBetweenUsers(
        Number(userId),
        Number(targetUserId),
        transaction
      );
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Matched with User2.",
      data: {
        action: "match",
        target_user_id: targetUserId,
        target_type: "bot",
        is_new_match: newlyCreated,
      },
    });
  } catch (err) {
    console.error("[matchUser] Error:", err);
    await transaction.rollback();
    return res.status(500).json({
      success: false,
      message: "Failed to match with user2.",
    });
  }
}

async function makeMutualMatch(userId, botId, transaction) {
  // Extra safety: don't let undefined slip in
  if (!userId || !botId) {
    throw new Error(
      `makeMutualMatch called with invalid IDs. userId=${userId}, botId=${botId}`
    );
  }

  //  Check if mutual match already exists (user -> bot)
  const existing = await UserInteraction.findOne({
    where: {
      user_id: userId,
      target_user_id: botId,
      action: "match",
      is_mutual: true,
    },
    transaction,
  });

  // If already mutually matched, do nothing (no extra increments)
  if (existing) {
    return { newlyCreated: false };
  }

  await UserInteraction.upsert(
    {
      user_id: userId,
      target_user_id: botId,
      action: "match",
      is_mutual: true,
    },
    { transaction }
  );

  //  Create / overwrite bot  user
  await UserInteraction.upsert(
    {
      user_id: botId,
      target_user_id: userId,
      action: "match",
      is_mutual: true,
    },
    { transaction }
  );

  // Increment total_matches for both (only once per new mutual match)
  await User.increment(
    { total_matches: 1 },
    { where: { id: userId }, transaction }
  );

  return { newlyCreated: true };
}

async function getUserMatches(req, res) {
  try {
    // Validate query (pagination)
    const schema = Joi.object({
      page: Joi.number().integer().min(1).optional(),
      limit: Joi.number().integer().min(1).max(50).optional(),
    });

    const { error, value } = schema.validate(req.query, {
      abortEarly: true,
      convert: true,
    });

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const page = value.page || 1;
    const limit = value.limit || 10;
    const offset = (page - 1) * limit;

    // Validate session
    const isSessionValid = await isUserSessionValid(req);
    if (!isSessionValid.success) {
      return res.status(401).json(isSessionValid);
    }

    const currentUserId = Number(isSessionValid.data);
    if (!currentUserId || Number.isNaN(currentUserId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid session.",
      });
    }

    // Fetch all mutual interactions (like OR match) from this user's side
    const interactions = await UserInteraction.findAll({
      where: {
        user_id: currentUserId,
        is_mutual: 1,
        action: {
          [Op.in]: ["like", "match"], // now covers "like" with mutual=1
        },
      },
      order: [["created_at", "DESC"]],
    });

    if (!interactions.length) {
      return res.status(200).json({
        success: true,
        data: {
          matches: [],
          pagination: {
            page,
            limit,
            total_items: 0,
            total_pages: 0,
          },
        },
      });
    }

    //  Dedupe by target_user_id (latest mutual match per user)
    const latestByTargetId = {};

    interactions.forEach((row) => {
      const targetId = Number(row.target_user_id);
      const existing = latestByTargetId[targetId];

      if (!existing) {
        latestByTargetId[targetId] = row;
      } else {
        const prevTime = new Date(existing.created_at || 0).getTime();
        const newTime = new Date(row.created_at || 0).getTime();
        if (newTime > prevTime) {
          latestByTargetId[targetId] = row;
        }
      }
    });

    let targetUserIds = Object.keys(latestByTargetId).map((id) => Number(id));

    if (!targetUserIds.length) {
      return res.status(200).json({
        success: true,
        data: {
          matches: [],
          pagination: {
            page,
            limit,
            total_items: 0,
            total_pages: 0,
          },
        },
      });
    }

    const users = await User.findAll({
      where: {
        id: { [Op.in]: targetUserIds },
        is_active: true,
      },
      attributes: {
        exclude: ["password"],
      },
    });

    if (!users.length) {
      return res.status(200).json({
        success: true,
        data: {
          matches: [],
          pagination: {
            page,
            limit,
            total_items: 0,
            total_pages: 0,
          },
        },
      });
    }

    const usersById = {};
    users.forEach((u) => {
      const plain = u.toJSON();
      usersById[Number(plain.id)] = plain;
    });

    // keep only ids that actually exist as users
    targetUserIds = users.map((u) => Number(u.id));

    //  Build matches list – attach FULL user object
    let matches = targetUserIds.map((otherUserId) => {
      const other = usersById[otherUserId];
      const interaction = latestByTargetId[otherUserId];

      return {
        match_id: interaction ? interaction.id : null,
        user: other,
        matched_at: interaction ? interaction.created_at : null,
      };
    });

    //  Sort by matched_at desc (most recent first)
    matches.sort((a, b) => {
      const ta = a.matched_at ? new Date(a.matched_at).getTime() : 0;
      const tb = b.matched_at ? new Date(b.matched_at).getTime() : 0;
      return tb - ta;
    });

    // Apply pagination in-memory
    const totalItems = matches.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedMatches = matches.slice(offset, offset + limit);

    return res.status(200).json({
      success: true,
      data: {
        matches: paginatedMatches,
        pagination: {
          page,
          limit,
          total_items: totalItems,
          total_pages: totalPages,
        },
      },
      message: "All match users",
    });
  } catch (err) {
    console.error("[getUserMatches] Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch matches.",
    });
  }
}

module.exports = {
  likeUser,
  rejectUser,
  matchUser,
  getUserMatches,
};
