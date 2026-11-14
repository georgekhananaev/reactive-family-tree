/* Written by scripts/bundle-migrations.mjs from the files in drizzle/. Do not edit by hand: run pnpm db:generate. */

export interface Migration {
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    "name": "0000_first_tables",
    "statements": [
      "CREATE TABLE `ai_connection` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`name` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`token_hash` text,\n\t`oauth_client_id` text,\n\t`mode` text NOT NULL,\n\t`access` text NOT NULL,\n\t`profile` text NOT NULL,\n\t`created_at` text NOT NULL,\n\t`last_used_at` text,\n\t`revoked_at` text\n);",
      "CREATE UNIQUE INDEX `ai_connection_token_hash_unique` ON `ai_connection` (`token_hash`);",
      "CREATE INDEX `ai_connection_user_idx` ON `ai_connection` (`user_id`);",
      "CREATE INDEX `ai_connection_client_idx` ON `ai_connection` (`user_id`,`oauth_client_id`);",
      "CREATE TABLE `branch_grant` (\n\t`user_id` text NOT NULL,\n\t`anchor_person_id` text NOT NULL,\n\t`granted_by` text,\n\t`created_at` text NOT NULL,\n\tPRIMARY KEY(`user_id`, `anchor_person_id`)\n);",
      "CREATE TABLE `edit` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`seq` integer,\n\t`status` text NOT NULL,\n\t`author_user_id` text,\n\t`author_name` text NOT NULL,\n\t`author_contact` text,\n\t`origin` text NOT NULL,\n\t`connection_id` text,\n\t`message` text NOT NULL,\n\t`note` text NOT NULL,\n\t`ops` text NOT NULL,\n\t`changes` text NOT NULL,\n\t`warnings` text NOT NULL,\n\t`touched` text NOT NULL,\n\t`reviewed_by` text,\n\t`review_note` text,\n\t`reverts_edit_id` text,\n\t`created_at` text NOT NULL,\n\t`applied_at` text\n);",
      "CREATE INDEX `edit_status_idx` ON `edit` (`status`,`created_at`);",
      "CREATE INDEX `edit_seq_idx` ON `edit` (`seq`);",
      "CREATE INDEX `edit_author_idx` ON `edit` (`author_user_id`);",
      "CREATE TABLE `edit_comment` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`edit_id` text NOT NULL,\n\t`author_name` text NOT NULL,\n\t`body` text NOT NULL,\n\t`created_at` text NOT NULL\n);",
      "CREATE INDEX `edit_comment_edit_idx` ON `edit_comment` (`edit_id`);",
      "CREATE TABLE `fact` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`rev` integer NOT NULL,\n\t`subject_type` text NOT NULL,\n\t`subject_id` text NOT NULL,\n\t`type` text NOT NULL,\n\t`date` text,\n\t`date_sort` integer,\n\t`place` text NOT NULL,\n\t`value` text NOT NULL,\n\t`note` text NOT NULL,\n\t`certainty` text NOT NULL,\n\t`privacy` text NOT NULL,\n\t`deleted_at` text\n);",
      "CREATE INDEX `fact_subject_idx` ON `fact` (`subject_id`);",
      "CREATE TABLE `invite` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`token_hash` text NOT NULL,\n\t`email` text NOT NULL,\n\t`role` text NOT NULL,\n\t`person_id` text,\n\t`grant_branch` integer NOT NULL,\n\t`created_by` text NOT NULL,\n\t`created_at` text NOT NULL,\n\t`expires_at` text NOT NULL,\n\t`used_at` text\n);",
      "CREATE UNIQUE INDEX `invite_token_hash_unique` ON `invite` (`token_hash`);",
      "CREATE TABLE `join_request` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`email` text NOT NULL,\n\t`message` text NOT NULL,\n\t`status` text NOT NULL,\n\t`decided_by` text,\n\t`created_at` text NOT NULL\n);",
      "CREATE TABLE `memory` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`rev` integer NOT NULL,\n\t`person_id` text NOT NULL,\n\t`author_user_id` text,\n\t`author_name` text NOT NULL,\n\t`body` text NOT NULL,\n\t`created_at` text NOT NULL,\n\t`deleted_at` text\n);",
      "CREATE INDEX `memory_person_idx` ON `memory` (`person_id`);",
      "CREATE TABLE `meta` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL\n);",
      "CREATE TABLE `notification` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`edit_id` text,\n\t`body` text NOT NULL,\n\t`created_at` text NOT NULL,\n\t`read_at` text\n);",
      "CREATE INDEX `notification_user_idx` ON `notification` (`user_id`,`read_at`);",
      "CREATE TABLE `person` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`rev` integer NOT NULL,\n\t`given` text NOT NULL,\n\t`family` text NOT NULL,\n\t`birth_name` text NOT NULL,\n\t`sex` text NOT NULL,\n\t`living` text NOT NULL,\n\t`privacy` text NOT NULL,\n\t`bio` text NOT NULL,\n\t`consent_at` text,\n\t`deleted_at` text\n);",
      "CREATE TABLE `setting` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL\n);",
      "CREATE TABLE `family_union` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`rev` integer NOT NULL,\n\t`kind` text NOT NULL,\n\t`status` text NOT NULL,\n\t`host_person_id` text,\n\t`since` integer,\n\t`deleted_at` text\n);",
      "CREATE TABLE `union_child` (\n\t`union_id` text NOT NULL,\n\t`child_id` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`position` integer NOT NULL,\n\tPRIMARY KEY(`union_id`, `child_id`)\n);",
      "CREATE INDEX `union_child_child_idx` ON `union_child` (`child_id`);",
      "CREATE TABLE `union_partner` (\n\t`union_id` text NOT NULL,\n\t`person_id` text NOT NULL,\n\t`position` integer NOT NULL,\n\tPRIMARY KEY(`union_id`, `person_id`)\n);",
      "CREATE INDEX `union_partner_person_idx` ON `union_partner` (`person_id`);",
      "CREATE TABLE `account` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`accountId` text NOT NULL,\n\t`providerId` text NOT NULL,\n\t`userId` text NOT NULL,\n\t`accessToken` text,\n\t`refreshToken` text,\n\t`idToken` text,\n\t`accessTokenExpiresAt` integer,\n\t`refreshTokenExpiresAt` integer,\n\t`scope` text,\n\t`password` text,\n\t`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,\n\t`updatedAt` integer NOT NULL,\n\tFOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `account_userId_idx` ON `account` (`userId`);",
      "CREATE TABLE `jwks` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`publicKey` text NOT NULL,\n\t`privateKey` text NOT NULL,\n\t`createdAt` integer NOT NULL,\n\t`expiresAt` integer,\n\t`alg` text,\n\t`crv` text\n);",
      "CREATE TABLE `oauthAccessToken` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`token` text,\n\t`clientId` text NOT NULL,\n\t`sessionId` text,\n\t`userId` text,\n\t`referenceId` text,\n\t`authorizationCodeId` text,\n\t`resources` text,\n\t`requestedUserInfoClaims` text,\n\t`refreshId` text,\n\t`expiresAt` integer,\n\t`createdAt` integer,\n\t`revoked` integer,\n\t`confirmation` text,\n\t`scopes` text NOT NULL,\n\tFOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`sessionId`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,\n\tFOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`refreshId`) REFERENCES `oauthRefreshToken`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `oauthAccessToken_token_unique` ON `oauthAccessToken` (`token`);",
      "CREATE INDEX `oauthAccessToken_clientId_idx` ON `oauthAccessToken` (`clientId`);",
      "CREATE INDEX `oauthAccessToken_sessionId_idx` ON `oauthAccessToken` (`sessionId`);",
      "CREATE INDEX `oauthAccessToken_userId_idx` ON `oauthAccessToken` (`userId`);",
      "CREATE INDEX `oauthAccessToken_authorizationCodeId_idx` ON `oauthAccessToken` (`authorizationCodeId`);",
      "CREATE INDEX `oauthAccessToken_refreshId_idx` ON `oauthAccessToken` (`refreshId`);",
      "CREATE TABLE `oauthClient` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`clientId` text NOT NULL,\n\t`clientSecret` text,\n\t`clientDiscoveryId` text,\n\t`disabled` integer DEFAULT false,\n\t`skipConsent` integer,\n\t`enableEndSession` integer,\n\t`subjectType` text,\n\t`scopes` text,\n\t`clientCredentialsScopes` text DEFAULT '[]',\n\t`userId` text,\n\t`createdAt` integer,\n\t`updatedAt` integer,\n\t`name` text,\n\t`uri` text,\n\t`icon` text,\n\t`contacts` text,\n\t`tos` text,\n\t`policy` text,\n\t`softwareId` text,\n\t`softwareVersion` text,\n\t`softwareStatement` text,\n\t`redirectUris` text NOT NULL,\n\t`postLogoutRedirectUris` text,\n\t`backchannelLogoutUri` text,\n\t`backchannelLogoutSessionRequired` integer,\n\t`tokenEndpointAuthMethod` text,\n\t`applicationType` text,\n\t`jwks` text,\n\t`jwksUri` text,\n\t`grantTypes` text,\n\t`responseTypes` text,\n\t`requirePKCE` integer,\n\t`dpopBoundAccessTokens` integer DEFAULT false,\n\t`referenceId` text,\n\t`metadata` text,\n\tFOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `oauthClient_clientId_unique` ON `oauthClient` (`clientId`);",
      "CREATE INDEX `oauthClient_userId_idx` ON `oauthClient` (`userId`);",
      "CREATE TABLE `oauthClientAssertion` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`expiresAt` integer NOT NULL\n);",
      "CREATE TABLE `oauthClientResource` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`clientId` text NOT NULL,\n\t`resourceId` text NOT NULL,\n\t`metadata` text,\n\t`createdAt` integer,\n\tFOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`resourceId`) REFERENCES `oauthResource`(`identifier`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `oauthClientResource_clientId_resourceId_uidx` ON `oauthClientResource` (`clientId`,`resourceId`);",
      "CREATE INDEX `oauthClientResource_clientId_idx` ON `oauthClientResource` (`clientId`);",
      "CREATE INDEX `oauthClientResource_resourceId_idx` ON `oauthClientResource` (`resourceId`);",
      "CREATE TABLE `oauthConsent` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`clientId` text NOT NULL,\n\t`userId` text,\n\t`referenceId` text,\n\t`resources` text,\n\t`requestedUserInfoClaims` text,\n\t`scopes` text NOT NULL,\n\t`createdAt` integer,\n\t`updatedAt` integer,\n\tFOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `oauthConsent_clientId_idx` ON `oauthConsent` (`clientId`);",
      "CREATE INDEX `oauthConsent_userId_idx` ON `oauthConsent` (`userId`);",
      "CREATE TABLE `oauthRefreshToken` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`token` text NOT NULL,\n\t`clientId` text NOT NULL,\n\t`sessionId` text,\n\t`userId` text NOT NULL,\n\t`referenceId` text,\n\t`authorizationCodeId` text,\n\t`resources` text,\n\t`requestedUserInfoClaims` text,\n\t`expiresAt` integer,\n\t`createdAt` integer,\n\t`revoked` integer,\n\t`rotatedAt` integer,\n\t`rotationReplayResponse` text,\n\t`rotationReplayExpiresAt` integer,\n\t`authTime` integer,\n\t`confirmation` text,\n\t`scopes` text NOT NULL,\n\tFOREIGN KEY (`clientId`) REFERENCES `oauthClient`(`clientId`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`sessionId`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,\n\tFOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `oauthRefreshToken_token_unique` ON `oauthRefreshToken` (`token`);",
      "CREATE INDEX `oauthRefreshToken_clientId_idx` ON `oauthRefreshToken` (`clientId`);",
      "CREATE INDEX `oauthRefreshToken_sessionId_idx` ON `oauthRefreshToken` (`sessionId`);",
      "CREATE INDEX `oauthRefreshToken_userId_idx` ON `oauthRefreshToken` (`userId`);",
      "CREATE INDEX `oauthRefreshToken_authorizationCodeId_idx` ON `oauthRefreshToken` (`authorizationCodeId`);",
      "CREATE TABLE `oauthResource` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`identifier` text NOT NULL,\n\t`name` text NOT NULL,\n\t`accessTokenTtl` integer,\n\t`refreshTokenTtl` integer,\n\t`signingAlgorithm` text,\n\t`signingKeyId` text,\n\t`allowedScopes` text,\n\t`customClaims` text,\n\t`dpopBoundAccessTokensRequired` integer DEFAULT false,\n\t`disabled` integer DEFAULT false,\n\t`createdAt` integer,\n\t`updatedAt` integer,\n\t`policyVersion` integer DEFAULT 1,\n\t`metadata` text\n);",
      "CREATE UNIQUE INDEX `oauthResource_identifier_unique` ON `oauthResource` (`identifier`);",
      "CREATE TABLE `passkey` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text,\n\t`publicKey` text NOT NULL,\n\t`userId` text NOT NULL,\n\t`credentialID` text NOT NULL,\n\t`counter` integer NOT NULL,\n\t`deviceType` text NOT NULL,\n\t`backedUp` integer NOT NULL,\n\t`transports` text,\n\t`createdAt` integer,\n\t`aaguid` text,\n\tFOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `passkey_userId_idx` ON `passkey` (`userId`);",
      "CREATE INDEX `passkey_credentialID_idx` ON `passkey` (`credentialID`);",
      "CREATE TABLE `session` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`expiresAt` integer NOT NULL,\n\t`token` text NOT NULL,\n\t`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,\n\t`updatedAt` integer NOT NULL,\n\t`ipAddress` text,\n\t`userAgent` text,\n\t`userId` text NOT NULL,\n\tFOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);",
      "CREATE INDEX `session_userId_idx` ON `session` (`userId`);",
      "CREATE TABLE `user` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`email` text NOT NULL,\n\t`emailVerified` integer DEFAULT false NOT NULL,\n\t`image` text,\n\t`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,\n\t`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,\n\t`role` text DEFAULT 'member',\n\t`personId` text\n);",
      "CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);",
      "CREATE TABLE `verification` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`identifier` text NOT NULL,\n\t`value` text NOT NULL,\n\t`expiresAt` integer NOT NULL,\n\t`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,\n\t`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL\n);",
      "CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);"
    ]
  },
  {
    "name": "0001_portraits",
    "statements": [
      "CREATE TABLE `media` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`size` integer NOT NULL,\n\t`uploaded_by` text,\n\t`created_at` text NOT NULL\n);",
      "ALTER TABLE `person` ADD `portrait` text;"
    ]
  },
  {
    "name": "0002_languages",
    "statements": [
      "ALTER TABLE `fact` ADD `lang` text DEFAULT 'en' NOT NULL;",
      "ALTER TABLE `fact` ADD `tr` text DEFAULT '{}' NOT NULL;",
      "ALTER TABLE `memory` ADD `lang` text DEFAULT 'en' NOT NULL;",
      "ALTER TABLE `memory` ADD `tr` text DEFAULT '{}' NOT NULL;",
      "ALTER TABLE `person` ADD `lang` text DEFAULT 'en' NOT NULL;",
      "ALTER TABLE `person` ADD `tr` text DEFAULT '{}' NOT NULL;",
      "ALTER TABLE `user` ADD `language` text;"
    ]
  }
];
