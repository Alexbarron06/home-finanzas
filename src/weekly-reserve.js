const DAY = 86400000;
const parse = value => Date.parse(`${value}T00:00:00Z`);
const iso = value => new Date(value).toISOString().slice(0, 10);

export const addDays = (value, days) => iso(parse(value) + days * DAY);

export function plannedContribution(plan, periodIndex) {
  if (periodIndex < plan.transition_periods) {
    const rounded = Math.ceil((plan.transition_total_cents / plan.transition_periods) / 100) * 100;
    return periodIndex === plan.transition_periods - 1
      ? plan.transition_total_cents - rounded * (plan.transition_periods - 1)
      : rounded;
  }
  return plan.regular_contribution_cents;
}

export function weeklyReserveStatus(plan, entries, today) {
  const allocations = entries.filter(entry => entry.entry_type === 'allocation');
  const payments = entries.filter(entry => entry.entry_type === 'payment');
  const paidDates = new Set(payments.map(entry => entry.effective_on));
  const allocated = allocations.reduce((total, entry) => total + entry.amount_cents, 0);
  const paid = payments.reduce((total, entry) => total + entry.amount_cents, 0);

  let nextDue = plan.first_payment_on;
  while (paidDates.has(nextDue)) nextDue = addDays(nextDue, 7);

  const elapsed = Math.max(0, Math.floor((parse(today) - parse(plan.reserve_starts_on)) / (15 * DAY)));
  const currentIndex = today < plan.reserve_starts_on ? 0 : elapsed;
  const currentStart = addDays(plan.reserve_starts_on, currentIndex * 15);
  const currentRecorded = allocations.some(entry => entry.effective_on === currentStart);
  const contributionIndex = currentRecorded ? currentIndex + 1 : currentIndex;

  return {
    allocated,
    paid,
    balance: allocated - paid,
    nextDue,
    paymentDue: nextDue <= today,
    nextContributionOn: currentRecorded ? addDays(currentStart, 15) : currentStart,
    nextContributionCents: plannedContribution(plan, contributionIndex),
  };
}
