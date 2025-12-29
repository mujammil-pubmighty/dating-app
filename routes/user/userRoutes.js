const express = require("express");
const router = express.Router();
const coinController = require("../../controllers/user/coinController");
const authController = require("../../controllers/user/authController");
const matchingController = require("../../controllers/user/matchingController");
const userController = require("../../controllers/user/userController");
const chatController = require("../../controllers/user/chatController");
const adsController = require("../../controllers/user/adViewController");
const { fileUploader } = require("../../utils/helpers/fileUpload");
const videoCallConroller = require("../../controllers/user/videoCallConroller");
const feedController = require("../../controllers/user/feedController");
const {
  verifyGooglePlayPurchase,
} = require("../../controllers/user/googleBillingController");
const utilController = require("../../controllers/user/utilController");

/**
 * GET /setting
 *
 * Returns site-level configuration settings as a normalized key–value object.
 *
 * Purpose:
 * - Used by the frontend and other services to load global application behavior
 *   such as feature flags, limits, UI toggles, branding options, and runtime rules.
 * - Acts as a single source of truth for non-user-specific configuration.
 *
 * Scope & Rules:
 * - This endpoint MUST return only safe, sanitized, non-sensitive settings.
 * - Secrets, credentials, internal tokens, or operational flags must NEVER be exposed here.
 *   for easy consumption by the client.
 *
 * Usage:
 * - Called during app initialization or layout bootstrapping.
 * - Used to conditionally enable/disable features without redeploying the frontend.
 *
 * Security Notes:
 * - If this endpoint is public, strict whitelisting of allowed keys is mandatory.
 */
router.get("/setting", utilController.getSiteSettings);

/**
 * AUTHENTICATION & ACCOUNT LIFECYCLE ROUTES
 *
 * These endpoints handle the complete user authentication flow,
 * including registration, verification, login, and password recovery.
 *
 * Design Principles:
 * - All inputs must be strictly validated and sanitized with joi.
 * TODO - Rate limiting must be enforced to prevent brute-force and abuse.
 * - Responses should be consist to avoid user enumeration.
 * - Tokens, OTPs, and verification codes must have strict expiry.
 *
 *  Security Notes:
 *  TODO - Apply IP rate limiting on all auth endpoints.
 * - Never log passwords, OTPs, or raw tokens.
 * - Enforce strong password policies at registration and reset.
 */

/**
 * 1. /register/google
 *    - Handles registration using Google OAuth data.
 *    - Validates provider token and maps external identity to internal user record.
 *    - Must prevent duplicate accounts and handle provider-linked users safely.
 */
router.post("/register/google", authController.registerWithGoogle);

/**
 * 2. /register
 *    - Handles standard email-based user registration.
 *    - Triggers email verification process with OTP.
 *    - Creates a temp user record if verification on otherise create normal user.
 */
router.post("/register", authController.registerUser);

/**
 * 3. /register/verify
 *    - Verifies registration via OTP.
 *    - Activates the user account only after successful verification.
 */
router.post("/register/verify", authController.verifyRegister);

/**
 * 4. /login
 *    - Authenticates user credentials.
 *    - Issues session tokens on success.
 *    - Must NOT reveal whether email or password was incorrect.
 */
router.post("/login", authController.loginUser);

/**
 * 5. /forgot-password
 *    - Initiates password reset process.
 *    - Generates a time-limited OTP.
 *    - Must respond with success even if the email does not exist
 *      (to prevent account enumeration).
 */
router.post("/forgot-password", authController.forgotPassword);

/**
 * 6. /forgot-password/verify
 *    - Verifies password reset OTP.
 *    - Allows user to securely set a new password.
 */
router.post("/forgot-password/verify", authController.forgotPasswordVerify);

/**
 * 1. /like
 *    - Handles user "like" action.
 *    - Records a like interaction between the logged-in user and target user.
 *    - If the target user is a bot → creates an instant match.
 *    - If the target user is human → creates a match only when the target has already liked back.
 *    - Prevents duplicate likes or repeated matches.
 *    - Safely updates interaction counters likes using transactions.
 *    - Creates or fetches a chat automatically when a match is formed.
 */
router.post("/like", matchingController.likeUser);

/**
 * 2. /reject
 *    - Handles user "reject" action.
 *    - Records a reject interaction between the logged-in user and target user.
 *    - If a match existed, breaks the match safely on both sides.
 *    - Decrements match counters correctly without allowing negative values.
 *    - Updates reject counters for the acting user only.
 *    - Does NOT create chats and does NOT notify the target user.
 */
router.post("/reject", matchingController.rejectUser);

/**
 * 3. /matches
 *    - Fetches user interaction list for the logged-in user.
 *    - By default returns matched users (mutual matches only).
 *    - Supports optional filtering by interaction type (match or like).
 *    - Supports pagination, sorting, and ordering.
 *    - Returns one entry per target user (no duplicates).
 *    - Joins target user profile data efficiently (no N+1 queries).
 */
router.get("/matches", matchingController.getUserMatches);

/**
 * 1. /coins/packages
 *    - Fetches available coin packages for purchase.
 *    - By default returns only active packages.
 *    - Supports optional filtering by:
 *        • is_popular (popular packages)
 *        • only_ads_free (packages that remove ads)
 *    - Supports pagination with safe limits.
 *    - Supports sorting by price, coins, popularity, display order, or creation date.
 *    - Uses stable ordering to avoid duplicate/missing records during pagination.
 *    - Designed for storefront-style listing (no user-specific data leakage).
 */
router.get("/coins/packages", coinController.getCoinPackages);

/**
 * 2. /coins/purchases
 *    - Fetches coin purchase history for the logged-in user.
 *    - Returns only purchases belonging to the authenticated user.
 *    - Supports optional filtering by purchase status
 *      (pending, completed, failed, refunded).
 *    - Supports pagination and safe sorting.
 *    - Joins coin package metadata in a single query (no N+1 queries).
 *    - Preserves history even if a coin package is later deleted.
 *    - Returns consistent pagination metadata for client-side rendering.
 */
router.get("/coins/purchases", coinController.getUserCoinPurchases);

/**
 * Feed Routes
 */

/**
 * 1. GET /feed
 *    - Fetches the standard feed of bot profiles.
 *    - Works for both guests and logged-in users.
 *    - Supports filters: gender, name (prefix search).
 *    - Supports pagination + sorting (sortBy/sortOrder).
 *    - Logged-in users get interaction flags per profile:
 *      isLiked, isRejected, isMatched, canLike.
 *    - Masks sensitive fields like email/phone in the response.
 */
router.get("/feed", feedController.getFeed);

/**
 * 2. GET /feed/random
 *    - Fetches a randomized feed of bot profiles (shuffle style).
 *    - Works for both guests and logged-in users.
 *    - Supports gender filtering + pagination.
 *    - Logged-in users get interaction flags per profile:
 *      isLiked, isRejected, isMatched, canLike.
 *    - Guests still get the same response shape (flags defaulted).
 *    - Masks sensitive fields like email/phone in the response.
 */
router.get("/feed/random", feedController.getRandomFeed);

/**
 * 3. GET /feed/recommended
 *    - Fetches personalized recommended bot profiles for the logged-in user.
 *    - Login is mandatory (recommendations require user settings/preferences).
 *    - Applies user preferences from settings (preferred gender + age range).
 *    - Supports pagination (page/perPage).
 *    - Returns interaction flags per profile:
 *      isLiked, isRejected, isMatched, canLike.
 *    - Masks sensitive fields like email/phone in the response.
 */
router.get("/feed/recommended", feedController.getRecommendedFeed);
/**
 * 4. GET /feed/:id
 *    - Fetches a single feed user profile by ID.
 *    - Intended for profile detail view / user preview.
 *    - Should validate :id and ensure the target profile is active/allowed.
 *    - If logged-in, can include interaction status between viewer and target.
 *    - Masks sensitive fields like email/phone in the response.
 */
router.get("/feed/:id", feedController.getFeedUser);

/**
 * 1. GET /profile
 * ------------------------------------------------------------
 * Fetches the authenticated user's full profile data.
 *
 * - Requires a valid authenticated session.
 * - Returns profile information owned by the logged-in user.
 * - Includes avatar and profile media URLs if available.
 * - Does NOT expose sensitive fields such as password,
 *   authentication tokens, or internal flags.
 */
router.get("/profile", userController.getUserProfile);
/**
 * 2. POST /profile
 * ------------------------------------------------------------
 * Updates the authenticated user's core profile information.
 *
 * - Requires a valid authenticated session.
 * - Accepts multipart/form-data.
 * - Supports optional avatar upload via "avatar" field.
 * - Avatar file is first validated server-side (magic bytes, size, type).
 * - Existing avatar (if any) is safely replaced (storage + DB).
 * - Profile fields are partially updatable (only provided fields are changed).
 * - Rejects invalid file types, oversized files, or malformed input.
 * - Prevents unauthorized profile updates.
 */
router.post(
  "/profile",
  fileUploader.single("avatar"),
  userController.updateUserProfile
);
/**
 * 3. POST /profile/media
 * ------------------------------------------------------------
 * Uploads and replaces the authenticated user's profile media gallery.
 *
 * - Requires a valid authenticated session.
 * - Accepts multipart/form-data with multiple files.
 * - Field name must be "media".
 * - Enforces a maximum number of media files per user
 *   (value fetched dynamically from site settings).
 * - All incoming files are verified using magic-byte detection.
 * - Existing media files for the user are fully deleted
 *   (both storage and DB) before new uploads.
 * - Upload and DB writes are handled atomically to avoid partial states.
 * - Temporary files are always cleaned up (success or failure).
 */
router.post(
  "/profile/media",
  fileUploader.array("media", 10),
  userController.uploadProfileMedia
);
/**
 * 4. GET /profile/settings
 * ------------------------------------------------------------
 * Fetches the authenticated user's application and privacy settings.
 *
 * - Requires a valid authenticated session.
 * - Returns user-specific preferences such as:
 *   - Notification preferences
 *   - Discovery preferences (age range, gender, distance)
 *   - Privacy options (online status visibility)
 *   - UI preferences (language, theme)
 * - If settings row does not exist, returns defaults.
 */
router.get("/profile/settings", userController.getUserSettings);
/**
 * 5. POST /profile/settings
 * ------------------------------------------------------------
 * Updates the authenticated user's application and privacy settings.
 *
 * - Requires a valid authenticated session.
 * - Accepts partial updates (only provided fields are changed).
 * - Validates all fields strictly (no unknown keys allowed).
 * - Enforces logical constraints (e.g. min age <= max age).
 * - Uses upsert strategy to safely handle first-time users.
 */
router.post("/profile/settings", userController.updateUserSettings);
/**
 * 6. POST /profile/change-password
 * ------------------------------------------------------------
 * Changes the authenticated user's account password.
 *
 * - Requires a valid authenticated session.
 * - User must have a manual (email/password) account.
 * - Validates old password before allowing change.
 * - Prevents reusing the current password.
 * - New password is securely hashed before storage.
 * - Invalidates all active sessions after successful change
 *   (forces re-login on all devices).
 */
router.post("/profile/change-password", userController.changePassword);


/**
 * POST /chats/:chatId/send-message
 * ------------------------------------------------------------
 * Sends a new message in an existing chat.
 *
 * Security & Authorization:
 * - Requires a valid authenticated session.
 * - The authenticated user must be a participant of :chatId.
 * - Server must reject sending if the chat is blocked for either side.
 *
 * Payload & Uploads:
 * - Accepts multipart/form-data.
 * - Text can be sent along with optional media files.
 * - Uses `fileUploader.array("media", 10)`:
 *   - Field name: "media"
 *   - Max files: 10
 *   - File validation must enforce allowed mime types + max file size.
 */
router.post(
  "/chats/:chatId/send-message",
  fileUploader.array("media", 10),
  chatController.sendMessage
);

/**
 * GET /chats/:chatId/messages
 * ------------------------------------------------------------
 * Fetches chat messages using OFFSET-based pagination.
 *
 * Security & Authorization:
 * - Requires a valid authenticated session.
 * - The authenticated user must be a participant of :chatId.
 *
 * Query Params:
 * - page (default: 1)
 * - limit (default: 50, recommended hard cap)
 *
 * Behavior:
 * - Returns messages for the given chat only.
 * - Excludes deleted messages from normal view.
 * - Returns messages in chronological order for the requested page.
 */
router.get("/chats/:chatId/messages", chatController.getChatMessages);


/**
 * GET /chats/:chatId/messages/cursor
 * ------------------------------------------------------------
 * Fetches chat messages using CURSOR-based pagination (recommended for scale).
 *
 * Security & Authorization:
 * - Requires a valid authenticated session.
 * - The authenticated user must be a participant of :chatId.
 *
 * Query Params:
 * - cursor (optional): message.id of the last item from the previous page
 * - limit (default: 30–50, hard cap recommended)
 *
 */
router.get("/chats/:chatId/messages/cursor", chatController.getChatMessagesCursor);

/**
 * POST /chats/:chatId/messages/:messageId/delete
 * ------------------------------------------------------------
 * Deletes (unsends) a message.
 *
 * Security & Authorization:
 * - Requires a valid authenticated session.
 * - Only the original sender of :messageId may delete it.
 * - The message must belong to :chatId (server must enforce both).
 *
 * Behavior:
 * - Soft-deletes the message:
 *   - status set to "deleted"
 *   - message text replaced with "This message was deleted"
 * - Removes/ignores media and reply previews for deleted messages.
 * - Operation is idempotent (deleting an already deleted message succeeds).
*/
router.post("/chats/:chatId/messages/:messageId/delete", chatController.deleteMessage);

/**
 * GET /chats
 * ------------------------------------------------------------
 * Fetches the authenticated user's chat list (inbox).
 *
 * Security & Authorization:
 * - Requires a valid authenticated session.
 * - Returns only chats visible to the user (not deleted for that user).
 *
 * Query Params:
 * - page (default: 1)
 * - limit (default: 20, hard cap recommended)
 *
 * Ordering:
 * - Pinned chats first (per-user pin state).
 * - Then by last activity (updated_at / last_message_time).
 *
 * Response includes:
 * - The other participant's safe profile subset (no PII like email/phone).
 * - Last non-deleted message summary.
 * - Unread message count for the current user.
*/
router.get("/chats", chatController.getUserChats);

/**
 * POST /chats/pin
 * ------------------------------------------------------------
 * Pins or unpins one or more chats for the current user.
 *
 * Security & Authorization:
 * - Requires a valid authenticated session.
 * - User must be a participant of each chat in chat_ids.
 *
 * Payload:
 * - chat_ids: number[] (non-empty)
 * - is_pin: boolean (true = pin, false = unpin)
 *
 * Behavior:
 * - Updates per-user pin state:
 *   - is_pin_p1 or is_pin_p2 depending on participant side.
 * - Operation is idempotent (pinning already pinned chats is safe).
 */
router.post("/chats/pin", chatController.pinChats);
/**
 * POST /chats/:chatId/block
 * ------------------------------------------------------------
 * Blocks or unblocks a chat for the current user.
 *
 * Security & Authorization:
 * - Requires a valid authenticated session.
 * - The authenticated user must be a participant of :chatId.
 *
 * Payload:
 * - action: "block" | "unblock" (optional, default: "block")
 *
 * Behavior:
 * - Blocking is user-scoped:
 *   - Updates chat_status_p1 or chat_status_p2 for the current user only.
 * - Operation is idempotent:
 *   - Blocking an already blocked chat succeeds.
 *   - Unblocking an already active chat succeeds.
*/
router.post("/chats/:chatId/block", chatController.blockChat);
/**
 * POST /chats/:chatId/delete
 * ------------------------------------------------------------
 * Deletes a chat for the current user only (delete-for-me).
 *
 * Security & Authorization:
 * - Requires a valid authenticated session.
 * - The authenticated user must be a participant of :chatId.
 *
 * Behavior:
 * - Deletes chat visibility only for the current user:
 *   - Sets chat_status_p1 or chat_status_p2 to "deleted"
 * - Also clears per-user state:
 *   - unpins the chat for the user
 *   - resets unread count for the user
 * - Operation is idempotent.
*/
router.post("/chats/:chatId/delete", chatController.deleteChat);
/**
 * POST /chats/:chatId/mark-as-read
 * ------------------------------------------------------------
 * Marks messages in a chat as read for the current user.
 *
 * Security & Authorization:
 * - Requires a valid authenticated session.
 * - The authenticated user must be a participant of :chatId.
 * - Updates must be scoped to the given chat_id (server-enforced).
 *
 * Payload:
 * - lastMessageId (optional):
 *   - If provided, only messages with id <= lastMessageId are marked read.
 *   - Server should validate lastMessageId belongs to this chat (recommended).
 *
 * Behavior:
 * - Updates unread messages where:
 *   - chat_id = :chatId
 *   - receiver_id = current user
 *   - is_read = false
 *   - status != "deleted"
 * - Updates stored unread count on chat for the current user.
 */
router.post("/chats/:chatId/mark-as-read", chatController.markChatMessagesRead);

//ads view
router.get("/ads/status", adsController.getAdStatus);
router.post("/ads/complete", adsController.completeAdView);

//video call
router.post(
  "/chats/:chatId/video-calls/initiate",
  videoCallConroller.initiateVideoCall
);
router.post("/video-calls/:callId/accept", videoCallConroller.acceptVideoCall);
router.post("/video-calls/:callId/reject", videoCallConroller.rejectVideoCall);
router.post("/video-calls/:callId/end", videoCallConroller.endVideoCall);
router.get(
  "/video-calls/:callId/status",
  videoCallConroller.getVideoCallStatus
);
router.get("/video-calls", videoCallConroller.getVideoCallHistory);

//google billing
router.post("/billing/google-play/verify", verifyGooglePlayPurchase);

module.exports = router;
