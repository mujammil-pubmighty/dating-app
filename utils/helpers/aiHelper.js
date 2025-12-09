const { geminiModel } = require("../../config/gemini");
const { Op } = require("sequelize");
const Chat = require("../../models/Chat");
const User = require("../../models/User");
const Message = require("../../models/Message");
const MasterPrompt = require("../../models/MasterPrompt");

//  decide if user is new or existing
function getUserType(user) {
  const createdAt = user.created_at || user.createdAt;
  if (!createdAt) return "existing";

  const diffMs = Date.now() - new Date(createdAt).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= 7 ? "new" : "existing";
}

//  get time of day (morning/afternoon/evening/night)
function getUserTimeOfDay(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

async function generateBotReplyForChat(chatId, lastUserMessageText) {
  // 1) Load chat + participants
  const chat = await Chat.findByPk(chatId);
  if (!chat) throw new Error("Chat not found");

  const user1 = await User.findByPk(chat.participant_1_id);
  const user2 = await User.findByPk(chat.participant_2_id);

  if (!user1 || !user2) throw new Error("Participants not found");

  // Assume: one is real, one is bot
  let realUser;
  let botUser;

  if (user1.type === "real" && user2.type === "bot") {
    realUser = user1;
    botUser = user2;
  } else if (user2.type === "real" && user1.type === "bot") {
    realUser = user2;
    botUser = user1;
  } else {
    // fallback: treat user1 as real, user2 as bot
    realUser = user1;
    botUser = user2;
  }

  // Decide user_type + time bucket
  const userType = getUserType(realUser); // 'new' | 'existing' | etc.
  const userTime = getUserTimeOfDay(); // 'morning' | 'afternoon' | 'evening' | 'night'

  //  Get suitable MasterPrompt
  const masterPrompt = await MasterPrompt.findOne({
    where: {
      status: "active",
      user_type: { [Op.in]: [userType, "all"] },
      user_time: { [Op.in]: [userTime, "all"] },
      bot_gender: { [Op.in]: [botUser.gender || "any", "any"] },
    },
    order: [["priority", "DESC"]],
  });

  if (!masterPrompt) {
    throw new Error("No active master prompt found");
  }

  // 4) Fetch conversation context (last N messages)
  const previousMessages = await Message.findAll({
    where: { chat_id: chatId },
    order: [["created_at", "ASC"]],
    limit: 15,
  });

  const historyText = previousMessages
    .map((m) => {
      const who = m.sender_type === "bot" ? "Bot" : "User";
      return `${who}: ${m.message}`;
    })
    .join("\n");

  // 5) Base system prompt (SHORT, human-style, dating persona)
  const baseSystemPrompt = `
You are a friendly, flirty, human-like replying to a user in a dating chat.
Keep every reply SHORT (1 lines), natural, and conversational.
Never repeat the user's full message. Ask at most one light question.
Always reply in a warm, casual tone like a real person texting on WhatsApp.
Your reply must be relevant to the user's last message and the ongoing chat.
If the user flirts, respond playfully but respectfully.
Avoid long paragraphs and avoid robotic or overly formal language.
`.trim();

  // Merge MasterPrompt + location-based replacements
  let extraRules = masterPrompt.prompt || "";

  if (masterPrompt.location_based) {
    extraRules = extraRules
      .replace("{{city}}", realUser.city || "")
      .replace("{{state}}", realUser.state || "")
      .replace("{{country}}", realUser.country || "");
  }

  const finalSystemPrompt = `
${baseSystemPrompt}

Additional behavior rules for this bot:
${extraRules}
`.trim();

  // 7) Final prompt text for Gemini
  const promptText = `
System Instructions:
${finalSystemPrompt}

Conversation History:
${historyText || "No previous messages yet."}

User's Latest Message:
"${lastUserMessageText}"

Now reply with ONE short, natural message as the girl.
`.trim();

  //  Call Gemini API
  const result = await geminiModel.generateContent({
    contents: [
      {
        role: "user",
        parts: [{ text: promptText }],
      },
    ],
  });

  const response = result.response;

  const text =
    typeof response.text === "function"
      ? response.text()
      : response.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("No text from Gemini");
  }

  // Return trimmed reply
  return text.trim();
}

module.exports = {
  generateBotReplyForChat,
};
