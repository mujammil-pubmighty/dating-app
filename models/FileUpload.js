const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// Centralized allowlist (kept in code, not ENUM)
const ALLOWED_EXTS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "rtf",
];

const FileUpload = sequelize.define(
  "FileUpload",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },

    folders: {
      type: DataTypes.STRING(300),
      allowNull: false,
    },

    size: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: false,
    },

    file_type: {
      type: DataTypes.STRING(16),
      allowNull: false,
      validate: {
        isInAllowList(value) {
          if (!ALLOWED_EXTS.includes(String(value).toLowerCase())) {
            throw new Error("Extension not allowed");
          }
        },
      },
    },

    // Full MIME type from server-side detection (NOT client-provided)
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    uploader_type: {
      type: DataTypes.ENUM("admin", "employee"),
      allowNull: false,
    },

    employee_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    admin_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
    },

    entity_type: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment:
        "Polymorphic relation: indicates which module/entity this file is attached to (e.g., branch, employee_doc, job_resume).",
    },

    entity_id: {
      type: DataTypes.BIGINT.UNSIGNED,
      allowNull: true,
      comment:
        "Polymorphic relation: primary key of the entity record referenced by entity_type.",
    },

    uploader_ip: {
      type: DataTypes.STRING(45),
      allowNull: true,
    },
    user_agent: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "modified_at",
    tableName: "pb_file_uploads",
    indexes: [
      {
        name: "idx_unique_name_folders",
        unique: true,
        fields: ["name", "folders"],
      },
      {
        name: "idx_entity_type_entity_id",
        fields: ["entity_type", "entity_id"],
      },
      {
        name: "idx_file_type",
        fields: ["file_type"],
      },
      {
        name: "idx_uploader_type",
        fields: ["uploader_type"],
      },
      {
        name: "idx_employee",
        fields: ["employee_id"],
      },
      {
        name: "idx_admin",
        fields: ["admin_id"],
      },
    ],
  }
);

module.exports = FileUpload;
