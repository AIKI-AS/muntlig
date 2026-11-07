export type Role = 'teacher' | 'student';
export type PracticeMode = 'text' | 'voice' | 'avatar';
export type Rights = 'teacher_owned' | 'open_license' | 'publisher_licensed' | 'unknown';
export type EvidenceStatus = 'independent' | 'with_hint' | 'not_explored';
export type Actor = { id: string; tenantId: string; role: Role; displayName: string };
export type Source = { id: string; title: string; page: number; text: string };
export type Goal = { id: string; title: string; prompt: string; sourceIds: string[] };
export type Pack = {
  id: string; title: string; subject: string; level: string; description: string;
  minutes: number; goals: Goal[]; sources: Source[]; rights: Rights;
  status: 'draft' | 'published'; version: number; createdAt: string; publishedAt: string | null;
};
export type Turn = {
  id: string; role: 'user' | 'assistant'; text: string; sourceIds: string[];
  goalId: string; at: string; hint: boolean;
};
export type Evidence = {
  goalId: string; status: EvidenceStatus; quote: string; turnId: string; sourceIds: string[];
};
export type Session = {
  id: string; packId: string; packVersion: number; pack: Pack; mode: PracticeMode;
  status: 'active' | 'completed'; turns: Turn[]; evidence: Evidence[];
  activeGoalId: string; startedAt: string; endedAt: string | null;
};
export type Integrations = { database: boolean; llm: boolean; voice: boolean; avatar: boolean };
export type Bootstrap = { actor: Actor; packs: Pack[]; sessions: Session[]; integrations: Integrations };
export type PackInput = Pick<Pack, 'title' | 'subject' | 'level' | 'description' | 'minutes' | 'goals' | 'sources' | 'rights'>;
export type Review = {
  session: Session;
  goals: (Goal & { evidence: Evidence | null })[];
  explored: number;
  nextGoal: Goal | null;
  /** True while a completed voice/avatar session still has an undeleted provider agent. Retry via POST /finish. */
  cleanupPending: boolean;
};
export const evidenceLabels: Record<EvidenceStatus, string> = {
  independent: 'Selvstendig forklart', with_hint: 'Forklart med støtte', not_explored: 'Ikke undersøkt',
};
