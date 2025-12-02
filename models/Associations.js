
const User = require("./User");
const UserInteraction = require("./UserInteraction");
const Chats= require("./chats");

function setupAssociations() {

  User.hasMany(UserInteraction, {
    foreignKey: "user_id",
    as: "sentInteractions",   // user.getSentInteractions()
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  UserInteraction.belongsTo(User, {
    foreignKey: "user_id",
    as: "actorUser",          // interaction.getActorUser()
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  User.hasMany(UserInteraction, {
    foreignKey: "target_user_id",
    as: "receivedInteractions", // user.getReceivedInteractions()
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });

  UserInteraction.belongsTo(User, {
    foreignKey: "target_user_id",
    as: "targetUser",         // interaction.getTargetUser()
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  });
  Chats.belongsTo(User, {
    as: "participant1",
    foreignKey: "participant1Id",
    onDelete: "CASCADE",
  });

  Chats.belongsTo(User, {
    as: "participant2",
    foreignKey: "participant2Id",
    onDelete: "CASCADE",
  });

  User.hasMany(Chats, {
    as: "chatsAsParticipant1",
    foreignKey: "participant1Id",
  });

  User.hasMany(Chats, {
    as: "chatsAsParticipant2",
    foreignKey: "participant2Id",
  });

}

module.exports ={ setupAssociations};
