export function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error('Escribe un importe válido con hasta dos decimales.');
  const [whole, part = ''] = String(value).split('.');
  const result = Number(whole) * 100 + Number(part.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0 || result > 100000000) throw new Error('El importe debe ser mayor a cero y no superar $1,000,000.');
  return result;
}
export function summary(fund, expenses, reservations) {
  const spent = expenses.filter(e => e.fund_id === fund.id).reduce((s, e) => s + e.amount_cents, 0);
  const paid = new Set(expenses.map(e => e.reservation_id).filter(Boolean));
  const reserved = reservations.filter(r => r.fund_id === fund.id && !paid.has(r.id)).reduce((s, r) => s + r.amount_cents, 0);
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
