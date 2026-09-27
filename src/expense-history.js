export function expensesByFund(funds, expenses) {
  return funds.map(fund => {
    const movements = expenses
      .filter(expense => expense.fund_id === fund.id)
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || String(b.id).localeCompare(String(a.id)));

    return {
      fund,
      movements,
      total_cents: movements.reduce((total, expense) => total + expense.amount_cents, 0),
    };
  });
}
