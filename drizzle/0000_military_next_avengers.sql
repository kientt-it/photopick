CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`drive_folder_id` text,
	`drive_folder_url` text,
	`min_selection` integer DEFAULT 0 NOT NULL,
	`max_selection` integer,
	`allow_note` integer DEFAULT true NOT NULL,
	`allow_edit_after_submit` integer DEFAULT false NOT NULL,
	`start_date` text,
	`end_date` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`last_sync_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE INDEX `idx_albums_status` ON `albums` (`status`);
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`album_id` text,
	`action` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);

CREATE INDEX `idx_audit_album_created` ON `audit_events` (`album_id`,`created_at`);
CREATE TABLE `image_selections` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`image_id` text NOT NULL,
	`selected` integer DEFAULT false NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`selected_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `selection_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `idx_selection_session_image` ON `image_selections` (`session_id`,`image_id`);
CREATE INDEX `idx_selection_selected` ON `image_selections` (`session_id`,`selected`);
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`drive_file_id` text,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`thumbnail_url` text NOT NULL,
	`preview_url` text NOT NULL,
	`drive_url` text,
	`source_modified_at` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `idx_images_album_drive_file` ON `images` (`album_id`,`drive_file_id`);
CREATE INDEX `idx_images_album_status` ON `images` (`album_id`,`status`);
CREATE TABLE `selection_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`submitted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `idx_sessions_album_user` ON `selection_sessions` (`album_id`,`user_id`);
CREATE INDEX `idx_sessions_status` ON `selection_sessions` (`status`);
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'USER' NOT NULL,
	`created_at` text NOT NULL
);

CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);