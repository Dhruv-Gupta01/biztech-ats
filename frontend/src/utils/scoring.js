// Central scoring logic — single source of truth for how suitability is calculated
// and how a rating maps to an assessment decision. Mirrors the backend formula in
// POST /api/candidates/:id/score so the UI preview always matches what the server persists.
const SKILL_WEIGHT = 0.6;
const EXPERIENCE_WEIGHT = 0.4;

export function calculateSuitability(skillScore, experienceScore) {
  if (skillScore == null || experienceScore == null || isNaN(skillScore) || isNaN(experienceScore)) return null;
  return Number(((skillScore * SKILL_WEIGHT) + (experienceScore * EXPERIENCE_WEIGHT)).toFixed(1));
}

// Suggests (does not force) a decision based on the computed rating.
// Recruiter can always override via the decision dropdown.
export function suggestDecision(rating) {
  if (rating == null) return 'Not interested';
  if (rating >= 8) return 'Selected';
  if (rating >= 5) return 'Not interested';
  return 'Rejected';
}

export const ASSESSMENT_STATUSES = ['Selected', 'Rejected', 'Not Appeared', 'Rescheduled', 'Not interested', 'Refered for other position'];