
const User = require("./User");
const UserInteraction = require("./UserInteraction");

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
}

module.exports ={ setupAssociations};
