CREATE TABLE `image_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`image_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`image_id`) REFERENCES `images`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_favorites_user_image` ON `image_favorites` (`user_id`,`image_id`);
--> statement-breakpoint
CREATE INDEX `idx_favorites_user_created` ON `image_favorites` (`user_id`,`created_at`);
