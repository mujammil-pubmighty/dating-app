const { Op } = require("sequelize");
const Joi = require("joi");
const sequelize = require("../../config/db");
const User = require("../../models/User");
const UserInteraction = require("../../models/UserInteraction");
const {getOption,isUserSessionValid,getOrCreateChatBetweenUsers,} = require("../../utils/helper");
const Chats = require("../../models/chats");
function extractUserIdFromSession(sessionResult) {
  if (!sessionResult) return null;
  const raw =
    sessionResult.user_id ??
    sessionResult.userId ??
    sessionResult.data?.user_id ??
    sessionResult.data?.userId ??
      sessionResult.data ??    
    sessionResult.user?.id;

  if (raw == null) return null;

  const num = Number(raw);
  return Number.isNaN(num) ? null : num;
}

async function likeUser(req, res) {
  const transaction = await sequelize.transaction();

  try {
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

    const isSessionValid = await isUserSessionValid(req);
    if (!isSessionValid.success) {
      await transaction.rollback();
      return res.status(401).json(isSessionValid);
    }

    const userId = Number(isSessionValid.data);

    if (!userId || Number.isNaN(userId)) {
      await transaction.rollback();
      return res.status(401).json({
        success: false,
        message: "Invalid session: user_id missing.",
      });
    }

    const { target_user_id: targetUserId } = value;

    if (userId === Number(targetUserId)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "You cannot like yourself.",
      });
    }

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
        message: "You can only like bot profiles in this app.",
      });
    }

    // ---- Check existing interaction ----
    const existingInteraction = await UserInteraction.findOne({
      where: {
        user_id: userId,
        target_user_id: targetUserId,
      },
      transaction,
    });

    const previousAction = existingInteraction ? existingInteraction.action : null;
  
    await UserInteraction.upsert(
      {
        user_id: userId,
        target_user_id: targetUserId,
        action: "like",
        is_mutual: true, // user↔bot as instant mutual
      },
      { transaction }
    );

    if (previousAction === "like") {
      // Already liked before → no change
   //   console.log("[likeUser] already liked, no counter change");
    } else if (previousAction === "reject") {
      // REJECT -> LIKE  → likes +1, rejects -1
    //  console.log("[likeUser] REJECT -> LIKE, +1 like, -1 reject");
      await User.increment(
        { total_likes: 1, total_rejects: -1 },
        { where: { id: userId }, transaction }
      );
    } else {
      // First time interaction → like +1
     // console.log("[likeUser] first LIKE, +1 like");
      await User.increment(
        { total_likes: 1 },
        { where: { id: userId }, transaction }
      );
    }

    const chat = await getOrCreateChatBetweenUsers(
      userId,
      targetUserId,
      transaction
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "liked",
      data: {
        target_user_id: targetUserId,
        target_type: targetUser.type, // 'bot'
        is_match: true, // for bots we treat like = match
        chat_id: chat.id,
      },
    });
  } catch (err) {
    console.error("[likeUser] Error:", err);
    await transaction.rollback();
    return res.status(500).json({
      success: false,
      message: "Failed to like bot.",
    });
  }
}

async function rejectUser(req, res) {
  const transaction = await sequelize.transaction();

  try {
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

    const isSessionValid = await isUserSessionValid(req);
    if (!isSessionValid.success) {
      await transaction.rollback();
      return res.status(401).json(isSessionValid);
    }

    const userId = Number(isSessionValid.data);

    if (!userId || Number.isNaN(userId)) {
      await transaction.rollback();
      return res.status(401).json({
        success: false,
        message: "Invalid session: user_id missing.",
      });
    }

    if (Number(userId) === Number(targetUserId)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "You cannot reject yourself.",
      });
    }

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
        message: "You can only reject bot profiles in this app.",
      });
    }

    // ---- Check existing interaction ----
    const existingInteraction = await UserInteraction.findOne({
      where: {
        user_id: userId,
        target_user_id: targetUserId,
      },
      transaction,
    });

    const previousAction = existingInteraction ? existingInteraction.action : null;
   
    // Save/overwrite interaction as 'reject'
    await UserInteraction.upsert(
      {
        user_id: userId,
        target_user_id: targetUserId,
        action: "reject",
        is_mutual: false,
      },
      { transaction }
    );

    // ---- Update counters based on previous action ----
    if (previousAction === "like") {
      // LIKE -> REJECT → likes -1, rejects +1
      await User.increment(
        { total_likes: -1, total_rejects: 1 },
        { where: { id: userId }, transaction }
      );
    } else if (previousAction === "reject") {
      // Already rejected → no change
      //console.log("[rejectUser] already rejected, no counter change");
    } else {
      // First interaction is reject → rejects +1
     // console.log("[rejectUser] first REJECT, +1 reject");
      await User.increment(
        { total_rejects: 1 },
        { where: { id: userId }, transaction }
      );
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "reject",
      data: {
        target_user_id: targetUserId,
        target_type: targetUser.type,
      },
    });
  } catch (err) {
    console.error("[rejectUser] Error:", err);
    await transaction.rollback();
    return res.status(500).json({
      success: false,
      message: "Failed to reject bot.",
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

    const userId = extractUserIdFromSession(isSessionValid);

    if (!userId) {
      await transaction.rollback();
      return res.status(401).json({
        success: false,
        message: "Invalid session: user_id missing.",
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
        message: "You can only match with bot profiles in this app.",
      });
    }

    // Create mutual match interactions (user ↔ bot)
    await makeMutualMatch(userId, targetUserId, transaction);

    // (Later) create chat + first bot message here

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Matched with bot.",
      data: {
        action: "match",
        target_user_id: targetUserId,
        target_type: "bot",
      },
    });
  } catch (err) {
    console.error("[matchUser] Error:", err);
    await transaction.rollback();
    return res.status(500).json({
      success: false,
      message: "Failed to match with bot.",
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
  //  Create / overwrite user -> bot
  await UserInteraction.upsert(
    {
      user_id: userId,
      target_user_id: botId,
      action: "match",
      is_mutual: true,
    },
    { transaction }
  );

  //  Create / overwrite bot -> user (virtual “bot said yes”)
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

  await User.increment(
    { total_matches: 1 },
    { where: { id: botId }, transaction }
  );

  return { newlyCreated: true };
}


module.exports = {
  likeUser,
  rejectUser,
  matchUser,
};
