export function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error('Escribe un importe válido con hasta dos decimales.');
  const [whole, part = ''] = String(value).split('.');
  const result = Number(whole) * 100 + Number(part.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0 || result > 100000000) throw new Error('El importe debe ser mayor a cero y no superar $1,000,000.');
  return result;
}
// The start date of the salary fund anchors the estimated 15-day periods.
export function periodAt(anchor, date, length = 15) {
  const parse = value => Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parse(anchor)) || !Number.isFinite(parse(date))) throw new Error('Fecha de periodo no válida.');
  const index = Math.max(0, Math.floor((parse(date) - parse(anchor)) / (length * 86400000)));
  const iso = ms => new Date(ms).toISOString().slice(0, 10);
  return {startsOn: iso(parse(anchor) + index * length * 86400000), nextOn: iso(parse(anchor) + (index + 1) * length * 86400000)};
}
export function summary(fund, expenses, reservations, periodEndExclusive) {
  const spent = expenses.filter(e => e.fund_id === fund.id).reduce((s, e) => s + e.amount_cents, 0);
  const paid = new Set(expenses.map(e => e.reservation_id).filter(Boolean));
  // Past due bills stay reserved; a bill due in a later period is only a forecast.
  const reserved = reservations.filter(r => r.fund_id === fund.id && !paid.has(r.id) && (!periodEndExclusive || r.due_on < periodEndExclusive)).reduce((s, r) => s + r.amount_cents, 0);
  const balance = fund.opening_cents - spent;
  return {spent, reserved, balance, available: balance - reserved};
}
export function validateExpense(expense, fund) {
  if (!fund) throw new Error('Selecciona un fondo.');
  if (fund.kind === 'voucher' && expense.method !== 'card') throw new Error('Los vales solo permiten pago con tarjeta.');
  if (!expense.description.trim()) throw new Error('Escribe el concepto.');
  if (expense.occurred_on < fund.starts_on) throw new Error('La fecha es anterior al saldo inicial del fondo. Registra ese movimiento en la conciliación histórica.');
}
export const money = value => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' }).format(value / 100);
