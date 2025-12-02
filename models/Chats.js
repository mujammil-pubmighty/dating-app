// models/Chat.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // adjust path if different

const Chat = sequelize.define(
  'Chat',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },

    // First user in the chat (we'll always store smaller user_id here)
    participant1Id: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'participant_1_id',
    },

    // Second user in the chat (larger user_id)
    participant2Id: {   
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: 'participant_2_id',
    },

    // We'll keep this column, but you won't use it until Message model exists
    lastMessageId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: 'last_message_id',
    },

    lastMessageTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_message_time',
    },

    unreadCountP1: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'unread_count_p1',
    },

    unreadCountP2: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: 'unread_count_p2',
    },

    isArchivedP1: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_archived_p1',
    },

    isArchivedP2: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_archived_p2',
    },

    chatStatusP1: {
      type: DataTypes.ENUM('active', 'blocked', 'deleted'),
      allowNull: false,
      defaultValue: 'active',
      field: 'chat_status_p1',
    },

    chatStatusP2: {
      type: DataTypes.ENUM('active', 'blocked', 'deleted'),
      allowNull: false,
      defaultValue: 'active',
      field: 'chat_status_p2',
    },

    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },

    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    tableName: 'pb_chats',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',

    indexes: [
      // To make sure we can quickly find a chat by both users
      {
        name: 'idx_chats_participants',
        fields: ['participant_1_id', 'participant_2_id'],
      },
      // For chat list when user is participant_1
      {
        name: 'idx_chats_p1_status_time',
        fields: ['participant_1_id', 'chat_status_p1', 'is_archived_p1', 'last_message_time'],
      },
      // For chat list when user is participant_2
      {
        name: 'idx_chats_p2_status_time',
        fields: ['participant_2_id', 'chat_status_p2', 'is_archived_p2', 'last_message_time'],
      },
    ],
  }
);

module.exports = Chat;
