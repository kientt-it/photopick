import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("USER"),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("idx_users_email").on(t.email)]);

export const albums = sqliteTable("albums", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  driveFolderId: text("drive_folder_id"),
  driveFolderUrl: text("drive_folder_url"),
  minSelection: integer("min_selection").notNull().default(0),
  maxSelection: integer("max_selection"),
  allowNote: integer("allow_note", { mode: "boolean" }).notNull().default(true),
  allowEditAfterSubmit: integer("allow_edit_after_submit", { mode: "boolean" }).notNull().default(false),
  startDate: text("start_date"),
  endDate: text("end_date"),
  status: text("status").notNull().default("DRAFT"),
  lastSyncAt: text("last_sync_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [index("idx_albums_status").on(t.status)]);

export const images = sqliteTable("images", {
  id: text("id").primaryKey(),
  albumId: text("album_id").notNull().references(() => albums.id),
  driveFileId: text("drive_file_id"),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull(),
  driveThumbnailLink: text("drive_thumbnail_link"),
  previewUrl: text("preview_url").notNull(),
  driveUrl: text("drive_url"),
  sourceModifiedAt: text("source_modified_at"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("idx_images_album_drive_file").on(t.albumId,t.driveFileId),index("idx_images_album_status").on(t.albumId,t.status)]);

export const selectionSessions = sqliteTable("selection_sessions", {
  id: text("id").primaryKey(),
  albumId: text("album_id").notNull().references(() => albums.id),
  userId: text("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("DRAFT"),
  submittedAt: text("submitted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("idx_sessions_album_user").on(t.albumId,t.userId),index("idx_sessions_status").on(t.status)]);

export const imageSelections = sqliteTable("image_selections", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => selectionSessions.id),
  imageId: text("image_id").notNull().references(() => images.id),
  selected: integer("selected", { mode: "boolean" }).notNull().default(false),
  note: text("note").notNull().default(""),
  selectedAt: text("selected_at"),
  updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("idx_selection_session_image").on(t.sessionId,t.imageId),index("idx_selection_selected").on(t.sessionId,t.selected)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  albumId: text("album_id"),
  action: text("action").notNull(),
  details: text("details").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (t) => [index("idx_audit_album_created").on(t.albumId,t.createdAt)]);
