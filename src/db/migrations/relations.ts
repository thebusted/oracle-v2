import { relations } from "drizzle-orm/relations";
import { forumThreads, forumMessages } from "./schema";

export const forumMessagesRelations = relations(forumMessages, ({one}) => ({
	forumThread: one(forumThreads, {
		fields: [forumMessages.threadId],
		references: [forumThreads.id]
	}),
}));

export const forumThreadsRelations = relations(forumThreads, ({many}) => ({
	forumMessages: many(forumMessages),
}));