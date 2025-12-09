const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const UserInteraction = sequelize.define(
  "UserInteraction",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    target_user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    action: {
      // like / reject / match
      type: DataTypes.ENUM("like", "reject", "match"),
      allowNull: false,
    },

    // optional if you want to mark mutual (for real user↔user later)
    is_mutual: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "pb_user_interactions", // follow your pb_ naming
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["target_user_id"] },
      { fields: ["action"] },
      // make sure only one row per pair+direction
      // {
      //   unique: true,
      //   fields: ["user_id", "target_user_id"],
      // },
    ],
  }
);

module.exports = UserInteraction;
