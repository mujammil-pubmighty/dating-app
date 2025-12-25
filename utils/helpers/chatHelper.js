const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");

const CHAT_TMP_DIR = path.join(process.cwd(), "public", "tmp", "chat");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CHAT_TMP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const name = crypto.randomBytes(16).toString("hex") + ext.toLowerCase();
    cb(null, name);
  },
});

const fileFilter = (req, file, cb) => {
  const okMime = [
    // images
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/heic",
    "image/heif",

    // audio
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "audio/webm",
    "audio/wav",
  ];

  if (!okMime.includes(file.mimetype)) {
    return cb(new Error("INVALID_FILE_TYPE"), false);
  }
  cb(null, true);
};

const uploadChatMedia = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2500 * 1024 * 1024, // 25MB
  },
});

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function moveTmpToChatUploads(tmpFilePath, filename) {
  const chatDir = path.join(process.cwd(), "public", "uploads", "chat");
  ensureDir(chatDir);

  const destPath = path.join(chatDir, filename);

  await fs.promises.rename(tmpFilePath, destPath);

  return filename;
}

async function getOrCreateChatBetweenUsers(userIdA, userIdB, transaction) {
  // Optional: normalize to avoid duplicate chats
  const [p1, p2] =
    Number(userIdA) < Number(userIdB)
      ? [Number(userIdA), Number(userIdB)]
      : [Number(userIdB), Number(userIdA)];

  let chat = await Chat.findOne({
    where: {
      participant_1_id: p1,
      participant_2_id: p2,
    },
    transaction,
  });

  if (!chat) {
    chat = await Chat.create(
      {
        participant_1_id: p1,
        participant_2_id: p2,
        last_message_id: null,
        last_message_time: null,
        unread_count_p1: 0,
        unread_count_p2: 0,
        is_archived_p1: false,
        is_archived_p2: false,
        chat_status_p1: "active",
        chat_status_p2: "active",
      },
      { transaction }
    );
  }

  return chat;
}

module.exports = {
  moveTmpToChatUploads,
  uploadChatMedia,
  getOrCreateChatBetweenUsers,
};
