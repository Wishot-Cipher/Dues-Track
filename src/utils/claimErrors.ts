/**
 * Human-friendly messages for claim / handover eligibility errors.
 *
 * The DB raises terse codes (e.g. "EXEC_ELIGIBILITY: conflict_dept_
 * faculty") that are great for logs but useless to a user staring at a
 * blocked claim or a handover they can't accept. This maps the codes —
 * wherever they appear in a raw error string — to clear guidance that
 * explains WHY and what to do next.
 *
 * The rules themselves are intentional (e.g. separation of powers: a
 * department exec can't also be a faculty exec in a university). We
 * keep the rules; we just explain them properly.
 */
export function friendlyEligibilityError(raw: string | null | undefined): string {
  const s = String(raw ?? '');

  if (/conflict_dept_faculty/i.test(s)) {
    return (
      "You already hold an exec role at the other tier. In a university, a department exec can't also be a faculty exec — that's separation of powers. Step down from your current role first, or let someone else take this one."
    );
  }
  if (/not_in_dept/i.test(s)) {
    return (
      'To lead a department you must belong to a class within it. Join a class in this department first, then claim the role.'
    );
  }
  if (/conflict_same_scope|already.*exec|duplicate/i.test(s)) {
    return 'You already hold (or have a pending claim for) this role.';
  }
  if (/cooldown|too_soon|under_cooldown/i.test(s)) {
    return 'You recently submitted a claim for this. Please wait for the cooldown to pass before trying again.';
  }
  if (/EXEC_ELIGIBILITY/i.test(s)) {
    return "You're not eligible for this role right now.";
  }

  // Not an eligibility error — return the original (already-readable) text.
  return s || 'Something went wrong. Please try again.';
}
