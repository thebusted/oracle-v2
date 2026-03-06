import { sqliteTable, AnySQLiteColumn, index, integer, text, foreignKey, uniqueIndex } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const consultLog = sqliteTable("consult_log", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	decision: text().notNull(),
	context: text(),
	principlesFound: integer("principles_found").notNull(),
	patternsFound: integer("patterns_found").notNull(),
	guidance: text().notNull(),
	createdAt: integer("created_at").notNull(),
	project: text(),
},
(table) => [
	index("idx_consult_created").on(table.createdAt),
	index("idx_consult_project").on(table.project),
]);

export const decisions = sqliteTable("decisions", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	title: text().notNull(),
	status: text().default("pending").notNull(),
	context: text(),
	options: text(),
	decision: text(),
	rationale: text(),
	project: text(),
	tags: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	decidedAt: integer("decided_at"),
	decidedBy: text("decided_by"),
},
(table) => [
	index("idx_decisions_created").on(table.createdAt),
	index("idx_decisions_project").on(table.project),
	index("idx_decisions_status").on(table.status),
]);

export const documentAccess = sqliteTable("document_access", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	documentId: text("document_id").notNull(),
	accessType: text("access_type"),
	createdAt: integer("created_at").notNull(),
	project: text(),
},
(table) => [
	index("idx_access_doc").on(table.documentId),
	index("idx_access_created").on(table.createdAt),
	index("idx_access_project").on(table.project),
]);

export const forumMessages = sqliteTable("forum_messages", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	threadId: integer("thread_id").notNull().references(() => forumThreads.id),
	role: text().notNull(),
	content: text().notNull(),
	author: text(),
	principlesFound: integer("principles_found"),
	patternsFound: integer("patterns_found"),
	searchQuery: text("search_query"),
	commentId: integer("comment_id"),
	createdAt: integer("created_at").notNull(),
},
(table) => [
	index("idx_message_created").on(table.createdAt),
	index("idx_message_role").on(table.role),
	index("idx_message_thread").on(table.threadId),
]);

export const forumThreads = sqliteTable("forum_threads", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	title: text().notNull(),
	createdBy: text("created_by").default("human"),
	status: text().default("active"),
	issueUrl: text("issue_url"),
	issueNumber: integer("issue_number"),
	project: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	syncedAt: integer("synced_at"),
},
(table) => [
	index("idx_thread_created").on(table.createdAt),
	index("idx_thread_project").on(table.project),
	index("idx_thread_status").on(table.status),
]);

export const indexingStatus = sqliteTable("indexing_status", {
	id: integer().primaryKey().notNull(),
	isIndexing: integer("is_indexing").default(0).notNull(),
	progressCurrent: integer("progress_current").default(0),
	progressTotal: integer("progress_total").default(0),
	startedAt: integer("started_at"),
	completedAt: integer("completed_at"),
	error: text(),
});

export const learnLog = sqliteTable("learn_log", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	documentId: text("document_id").notNull(),
	patternPreview: text("pattern_preview"),
	source: text(),
	concepts: text(),
	createdAt: integer("created_at").notNull(),
	project: text(),
},
(table) => [
	index("idx_learn_created").on(table.createdAt),
	index("idx_learn_project").on(table.project),
]);

export const oracleDocuments = sqliteTable("oracle_documents", {
	id: text().primaryKey().notNull(),
	type: text().notNull(),
	sourceFile: text("source_file").notNull(),
	concepts: text().notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	indexedAt: integer("indexed_at").notNull(),
	supersededBy: text("superseded_by"),
	supersededAt: integer("superseded_at"),
	supersededReason: text("superseded_reason"),
	origin: text(),
	project: text(),
	createdBy: text("created_by"),
},
(table) => [
	index("idx_project").on(table.project),
	index("idx_origin").on(table.origin),
	index("idx_superseded").on(table.supersededBy),
	index("idx_type").on(table.type),
	index("idx_source").on(table.sourceFile),
]);

export const searchLog = sqliteTable("search_log", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	query: text().notNull(),
	type: text(),
	mode: text(),
	resultsCount: integer("results_count"),
	searchTimeMs: integer("search_time_ms"),
	createdAt: integer("created_at").notNull(),
	project: text(),
	results: text(),
},
(table) => [
	index("idx_search_created").on(table.createdAt),
	index("idx_search_project").on(table.project),
]);

export const traceLog = sqliteTable("trace_log", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	traceId: text("trace_id").notNull(),
	query: text().notNull(),
	queryType: text("query_type").default("general"),
	foundFiles: text("found_files"),
	foundCommits: text("found_commits"),
	foundIssues: text("found_issues"),
	foundRetrospectives: text("found_retrospectives"),
	foundLearnings: text("found_learnings"),
	foundResonance: text("found_resonance"),
	fileCount: integer("file_count").default(0),
	commitCount: integer("commit_count").default(0),
	issueCount: integer("issue_count").default(0),
	depth: integer().default(0),
	parentTraceId: text("parent_trace_id"),
	childTraceIds: text("child_trace_ids").default("[]"),
	project: text(),
	sessionId: text("session_id"),
	agentCount: integer("agent_count").default(1),
	durationMs: integer("duration_ms"),
	status: text().default("raw"),
	awakening: text(),
	distilledToId: text("distilled_to_id"),
	distilledAt: integer("distilled_at"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
},
(table) => [
	index("idx_trace_created").on(table.createdAt),
	index("idx_trace_parent").on(table.parentTraceId),
	index("idx_trace_status").on(table.status),
	index("idx_trace_project").on(table.project),
	index("idx_trace_query").on(table.query),
	uniqueIndex("trace_log_trace_id_unique").on(table.traceId),
]);

