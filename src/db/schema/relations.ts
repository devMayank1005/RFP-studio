import { relations } from "drizzle-orm";

import { user } from "./auth";
import { clients } from "./core";
import { approvedAnswers, kbEntries, kbSources } from "./kb";
import { chroQuestions, exports, generationJobs } from "./ops";
import { responseCitations, responseRevisions, responses } from "./responses";
import { rfpDocuments, rfpQuestions, rfpSections, rfps } from "./rfp";

/** Relational-query wiring for the tables the app reads as trees (an RFP, a response with its history). */

export const clientsRelations = relations(clients, ({ many }) => ({
  rfps: many(rfps),
}));

export const rfpsRelations = relations(rfps, ({ one, many }) => ({
  client: one(clients, { fields: [rfps.clientId], references: [clients.id] }),
  createdByUser: one(user, { fields: [rfps.createdBy], references: [user.id] }),
  documents: many(rfpDocuments),
  sections: many(rfpSections),
  questions: many(rfpQuestions),
  chroQuestions: many(chroQuestions),
  jobs: many(generationJobs),
  exports: many(exports),
}));

export const rfpDocumentsRelations = relations(rfpDocuments, ({ one }) => ({
  rfp: one(rfps, { fields: [rfpDocuments.rfpId], references: [rfps.id] }),
}));

export const rfpSectionsRelations = relations(rfpSections, ({ one, many }) => ({
  rfp: one(rfps, { fields: [rfpSections.rfpId], references: [rfps.id] }),
  questions: many(rfpQuestions),
}));

export const rfpQuestionsRelations = relations(rfpQuestions, ({ one }) => ({
  rfp: one(rfps, { fields: [rfpQuestions.rfpId], references: [rfps.id] }),
  section: one(rfpSections, { fields: [rfpQuestions.sectionId], references: [rfpSections.id] }),
  sourceDocument: one(rfpDocuments, {
    fields: [rfpQuestions.sourceDocumentId],
    references: [rfpDocuments.id],
  }),
  response: one(responses, { fields: [rfpQuestions.id], references: [responses.questionId] }),
}));

export const responsesRelations = relations(responses, ({ one, many }) => ({
  question: one(rfpQuestions, { fields: [responses.questionId], references: [rfpQuestions.id] }),
  currentRevision: one(responseRevisions, {
    fields: [responses.currentRevisionId],
    references: [responseRevisions.id],
  }),
  revisions: many(responseRevisions),
  assignee: one(user, { fields: [responses.assigneeId], references: [user.id] }),
}));

export const responseRevisionsRelations = relations(responseRevisions, ({ one, many }) => ({
  response: one(responses, { fields: [responseRevisions.responseId], references: [responses.id] }),
  author: one(user, { fields: [responseRevisions.authorId], references: [user.id] }),
  citations: many(responseCitations),
}));

export const responseCitationsRelations = relations(responseCitations, ({ one }) => ({
  revision: one(responseRevisions, {
    fields: [responseCitations.revisionId],
    references: [responseRevisions.id],
  }),
}));

export const kbEntriesRelations = relations(kbEntries, ({ one }) => ({
  source: one(kbSources, { fields: [kbEntries.sourceId], references: [kbSources.id] }),
}));

export const approvedAnswersRelations = relations(approvedAnswers, ({ one }) => ({
  originResponse: one(responses, {
    fields: [approvedAnswers.originResponseId],
    references: [responses.id],
  }),
  originRfp: one(rfps, { fields: [approvedAnswers.originRfpId], references: [rfps.id] }),
}));

export const chroQuestionsRelations = relations(chroQuestions, ({ one }) => ({
  rfp: one(rfps, { fields: [chroQuestions.rfpId], references: [rfps.id] }),
}));

export const generationJobsRelations = relations(generationJobs, ({ one }) => ({
  rfp: one(rfps, { fields: [generationJobs.rfpId], references: [rfps.id] }),
}));
