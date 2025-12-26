const publicFeedUserAttributes = [
"id",
"username",
"email",
"phone",
"gender",
"city",
"state",
"country",
"address",
"avatar",
"dob",
"bio",
"interests",
"looking_for",
"total_likes",
"total_matches",
"total_rejects",
"height",
"education",
"is_verified",
];

const publicUserAttributes = [
"id",
"username",
"email",
"phone",
"gender",
"city",
"state",
"country",
"address",
"avatar",
"dob",
"bio",
"interests",
"looking_for",
"coins",
"total_likes",
"total_matches",
"total_rejects",
"height",
"education",
"is_verified",
];
const BCRYPT_ROUNDS = 12;

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB hard limit
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);


module.exports = {
    publicFeedUserAttributes,
    publicUserAttributes,
    BCRYPT_ROUNDS,
    MAX_AVATAR_BYTES,
    ALLOWED_MIME,
}