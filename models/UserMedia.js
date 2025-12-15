const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const UserMedia = sequelize.define(
  "UserMedia",
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

    name: {
   
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    url: {
      // relative or absolute URL to stored media
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: "",
    },

    size: {
      // file size in bytes
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    type: {
      // image / video
      type: DataTypes.ENUM("image", "video"),
      allowNull: false,
      defaultValue: "image",
    },

    mime_type: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },

    folder: {
 
      type: DataTypes.ENUM("profile", "gallery", "other"),
      allowNull: false,
      defaultValue: "gallery",
    },

    status: {
    
      type: DataTypes.ENUM("active", "deleted"),
      allowNull: false,
      defaultValue: "active",
    },

    uploaded_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "pb_user_media", 
    timestamps: false,
    underscored: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["folder"] },
      { fields: ["status"] },
      { fields: ["uploaded_at"] },
    ],
  }
);

module.exports = UserMedia;
