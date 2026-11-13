CREATE TABLE `ai_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`token_hash` text,
	`oauth_client_id` text,
	`mode` text NOT NULL,
	`access` text NOT NULL,
	`profile` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_connection_token_hash_unique` ON `ai_connection` (`token_hash`);--> statement-breakpoint
CREATE INDEX `ai_connection_user_idx` ON `ai_connection` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_connection_client_idx` ON `ai_connection` (`user_id`,`oauth_client_id`);--> statement-breakpoint
CREATE TABLE `branch_grant` (
	`user_id` text NOT NULL,
	`anchor_person_id` text NOT NULL,
	`granted_by` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `anchor_person_id`)
);
--> statement-breakpoint
CREATE TABLE `edit` (
	`id` text PRIMARY KEY NOT NULL,
	`seq` integer,
	`status` text NOT NULL,
	`author_user_id` text,
	`author_name` text NOT NULL,
	`author_contact` text,
	`origin` text NOT NULL,
	`connection_id` text,
	`message` text NOT NULL,
	`note` text NOT NULL,
	`ops` text NOT NULL,
	`changes` text NOT NULL,
	`warnings` text NOT NULL,
	`touched` text NOT NULL,
	`reviewed_by` text,
	`review_note` text,
	`reverts_edit_id` text,
	`created_at` text NOT NULL,
	`applied_at` text
);
--> statement-breakpoint
CREATE INDEX `edit_status_idx` ON `edit` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `edit_seq_idx` ON `edit` (`seq`);--> statement-breakpoint
CREATE INDEX `edit_author_idx` ON `edit` (`author_user_id`);--> statement-breakpoint
CREATE TABLE `edit_comment` (
	`id` text PRIMARY KEY NOT NULL,
	`edit_id` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `edit_comment_edit_idx` ON `edit_comment` (`edit_id`);--> statement-breakpoint
CREATE TABLE `fact` (
	`id` text PRIMARY KEY NOT NULL,
	`rev` integer NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`type` text NOT NULL,
	`date` text,
	`date_sort` integer,
	`place` text NOT NULL,
	`value` text NOT NULL,
	`note` text NOT NULL,
	`certainty` text NOT NULL,
	`privacy` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `fact_subject_idx` ON `fact` (`subject_id`);--> statement-breakpoint
CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`person_id` text,
	`grant_branch` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token_hash_unique` ON `invite` (`token_hash`);--> statement-breakpoint
CREATE TABLE `join_request` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`decided_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `memory` (
	`id` text PRIMARY KEY NOT NULL,
	`rev` integer NOT NULL,
	`person_id` text NOT NULL,
	`author_user_id` text,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `memory_person_idx` ON `memory` (`person_id`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`edit_id` text,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text
);
--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notification` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`rev` integer NOT NULL,
	`given` text NOT NULL,
	`family` text NOT NULL,
	`birth_name` text NOT NULL,
	`sex` text NOT NULL,
	`living` text NOT NULL,
	`privacy` text NOT NULL,
	`bio` text NOT NULL,
	`consent_at` text,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `family_union` (
	`id` text PRIMARY KEY NOT NULL,
	`rev` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`host_person_id` text,
	`since` integer,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `union_child` (
	`union_id` text NOT NULL,
	`child_id` text NOT NULL,
	`kind` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`union_id`, `child_id`)
);
--> statement-breakpoint
CREATE INDEX `union_child_child_idx` ON `union_child` (`child_id`);--> statement-breakpoint
CREATE TABLE `union_partner` (
	`union_id` text NOT NULL,
	`person_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`union_id`, `person_id`)
);
--> statement-breakpoint
CREATE INDEX `union_partner_person_idx` ON `union_partner` (`person_id`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`userId`);--> statement-breakpoint
CREATE TABLE `jwks` (
	`id` text PRIMARY KEY NOT NULL,
	`publicKey` text NOT NULL,
	`privateKey` text NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer,
	`alg` text,
	`crv` text
);
--> statement-breakpoint
CREATE TABLE `oauthAccessToken` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text,
	`clientId` text NOT NULL,
	`sessionId` text,
	`userId` text,
	`referenceId` text,
	`authorizationCodeId` text,
	`resources` text,
	`requestedUserInfoClaims` text,
	`refreshId` text,
	`expiresAt` integer,
	`createdAt` integer,
	`revoked` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sessionId`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`refreshId`) REFERENCES `oauthRefreshToken`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthAccessToken_token_unique` ON `oauthAccessToken` (`token`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_clientId_idx` ON `oauthAccessToken` (`clientId`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_sessionId_idx` ON `oauthAccessToken` (`sessionId`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_userId_idx` ON `oauthAccessToken` (`userId`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_authorizationCodeId_idx` ON `oauthAccessToken` (`authorizationCodeId`);--> statement-breakpoint
CREATE INDEX `oauthAccessToken_refreshId_idx` ON `oauthAccessToken` (`refreshId`);--> statement-breakpoint
CREATE TABLE `oauthClient` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`clientSecret` text,
	`clientDiscoveryId` text,
	`disabled` integer DEFAULT false,
	`skipConsent` integer,
	`enableEndSession` integer,
	`subjectType` text,
	`scopes` text,
	`clientCredentialsScopes` text DEFAULT '[]',
	`userId` text,
	`createdAt` integer,
	`updatedAt` integer,
	`name` text,
	`uri` text,
	`icon` text,
	`contacts` text,
	`tos` text,
	`policy` text,
	`softwareId` text,
	`softwareVersion` text,
	`softwareStatement` text,
	`redirectUris` text NOT NULL,
	`postLogoutRedirectUris` text,
	`backchannelLogoutUri` text,
	`backchannelLogoutSessionRequired` integer,
	`tokenEndpointAuthMethod` text,
	`applicationType` text,
	`jwks` text,
	`jwksUri` text,
	`grantTypes` text,
	`responseTypes` text,
	`requirePKCE` integer,
	`dpopBoundAccessTokens` integer DEFAULT false,
	`referenceId` text,
	`metadata` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClient_clientId_unique` ON `oauthClient` (`clientId`);--> statement-breakpoint
CREATE INDEX `oauthClient_userId_idx` ON `oauthClient` (`userId`);--> statement-breakpoint
CREATE TABLE `oauthClientAssertion` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauthClientResource` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`resourceId` text NOT NULL,
	`metadata` text,
	`createdAt` integer,
	FOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resourceId`) REFERENCES `oauthResource`(`identifier`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthClientResource_clientId_resourceId_uidx` ON `oauthClientResource` (`clientId`,`resourceId`);--> statement-breakpoint
CREATE INDEX `oauthClientResource_clientId_idx` ON `oauthClientResource` (`clientId`);--> statement-breakpoint
CREATE INDEX `oauthClientResource_resourceId_idx` ON `oauthClientResource` (`resourceId`);--> statement-breakpoint
CREATE TABLE `oauthConsent` (
	`id` text PRIMARY KEY NOT NULL,
	`clientId` text NOT NULL,
	`userId` text,
	`referenceId` text,
	`resources` text,
	`requestedUserInfoClaims` text,
	`scopes` text NOT NULL,
	`createdAt` integer,
	`updatedAt` integer,
	FOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauthConsent_clientId_idx` ON `oauthConsent` (`clientId`);--> statement-breakpoint
CREATE INDEX `oauthConsent_userId_idx` ON `oauthConsent` (`userId`);--> statement-breakpoint
CREATE TABLE `oauthRefreshToken` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`clientId` text NOT NULL,
	`sessionId` text,
	`userId` text NOT NULL,
	`referenceId` text,
	`authorizationCodeId` text,
	`resources` text,
	`requestedUserInfoClaims` text,
	`expiresAt` integer,
	`createdAt` integer,
	`revoked` integer,
	`rotatedAt` integer,
	`rotationReplayResponse` text,
	`rotationReplayExpiresAt` integer,
	`authTime` integer,
	`confirmation` text,
	`scopes` text NOT NULL,
	FOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sessionId`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthRefreshToken_token_unique` ON `oauthRefreshToken` (`token`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_clientId_idx` ON `oauthRefreshToken` (`clientId`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_sessionId_idx` ON `oauthRefreshToken` (`sessionId`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_userId_idx` ON `oauthRefreshToken` (`userId`);--> statement-breakpoint
CREATE INDEX `oauthRefreshToken_authorizationCodeId_idx` ON `oauthRefreshToken` (`authorizationCodeId`);--> statement-breakpoint
CREATE TABLE `oauthResource` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`accessTokenTtl` integer,
	`refreshTokenTtl` integer,
	`signingAlgorithm` text,
	`signingKeyId` text,
	`allowedScopes` text,
	`customClaims` text,
	`dpopBoundAccessTokensRequired` integer DEFAULT false,
	`disabled` integer DEFAULT false,
	`createdAt` integer,
	`updatedAt` integer,
	`policyVersion` integer DEFAULT 1,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oauthResource_identifier_unique` ON `oauthResource` (`identifier`);--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`publicKey` text NOT NULL,
	`userId` text NOT NULL,
	`credentialID` text NOT NULL,
	`counter` integer NOT NULL,
	`deviceType` text NOT NULL,
	`backedUp` integer NOT NULL,
	`transports` text,
	`createdAt` integer,
	`aaguid` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`userId`);--> statement-breakpoint
CREATE INDEX `passkey_credentialID_idx` ON `passkey` (`credentialID`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`userId`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`role` text DEFAULT 'member',
	`personId` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);