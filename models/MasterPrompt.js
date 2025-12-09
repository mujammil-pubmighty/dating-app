const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const MasterPrompt = sequelize.define(
  "MasterPrompt",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    prompt: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    user_type: {
      type: DataTypes.ENUM("new", "existing", "all"),
      allowNull: false,
      defaultValue: "all",
    },

    user_time: {
      type: DataTypes.ENUM("morning", "afternoon", "evening", "night", "all"),
      allowNull: false,
      defaultValue: "all",
    },

    bot_gender: {
      type: DataTypes.ENUM("male", "female", "any"),
      allowNull: false,
      defaultValue: "any",
    },

    personality_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    location_based: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    priority: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active",
    },

    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },

    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "pb_master_prompts",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",

    indexes: [
      { fields: ["user_type"] },
      { fields: ["user_time"] },
      { fields: ["status"] },
      { fields: ["priority"] },
    ],
  }
);

module.exports = MasterPrompt;
