export const SERVICE_TYPES = [
  ['electricity', 'Luz', '⚡'],
  ['water', 'Agua', '◉'],
  ['telephone', 'Teléfono', '☎'],
  ['internet', 'Internet', '⌁'],
  ['gas', 'Gas', '◒'],
  ['streaming', 'Streaming', '▶'],
  ['other', 'Otro', '▦'],
];

export const serviceType = value => SERVICE_TYPES.find(([type]) => type === value);

export function serviceRecords(reservations, expenses) {
  const paid = new Map(expenses.filter(expense => expense.reservation_id).map(expense => [expense.reservation_id, expense]));
  return reservations
    .filter(reservation => Boolean(reservation.service_type) && !reservation.weekly_plan_id)
    .map(reservation => ({...reservation, paidExpense:paid.get(reservation.id) || null}))
    .sort((a, b) => Number(Boolean(a.paidExpense)) - Number(Boolean(b.paidExpense)) || a.due_on.localeCompare(b.due_on));
}

export function validateServiceDraft(draft) {
  if (!SERVICE_TYPES.some(([type]) => type === draft.service_type)) throw new Error('Selecciona un tipo de servicio válido.');
  if (!draft.description?.trim()) throw new Error('Escribe el nombre del servicio.');
  if (!draft.cutoff_on || !draft.due_on) throw new Error('Indica las fechas de corte y de pago.');
  if (draft.cutoff_on > draft.due_on) throw new Error('La fecha de pago no puede ser anterior a la fecha de corte.');
  if (!Number.isSafeInteger(draft.amount_cents) || draft.amount_cents < 1) throw new Error('Indica un monto válido.');
  return draft;
}
