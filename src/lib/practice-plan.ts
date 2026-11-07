import type { Goal, PracticeFocus, Session } from './contracts';

export const practiceFocusLabels: Record<PracticeFocus, string> = {
  understand: 'Forstå fagstoffet',
  explain: 'Forklare med egne ord',
  examples: 'Bruke eksempler',
  discussion: 'Drøfte og begrunne',
};

/** A plan narrows practice, never the complete published source snapshot. */
export const practiceGoals = (session: Session): Goal[] =>
  session.pack.goals.filter(goal => session.plan.goalIds.includes(goal.id));
