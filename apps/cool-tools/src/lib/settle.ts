export interface Person {
    name: string;
    id: string;
}

export interface Expense {
    paidBy: string;
    amount: number;
    splitAmong: string[];
    desc: string;
    currency: string;
}

export const currencies: { code: string; name: string; rate: number }[] = [
    { code: 'USD', name: 'US Dollar', rate: 1 },
    { code: 'EUR', name: 'Euro', rate: 0.92 },
    { code: 'GBP', name: 'British Pound', rate: 0.79 },
    { code: 'JPY', name: 'Japanese Yen', rate: 144 },
    { code: 'CAD', name: 'Canadian Dollar', rate: 1.36 },
    { code: 'AUD', name: 'Australian Dollar', rate: 1.55 },
    { code: 'CHF', name: 'Swiss Franc', rate: 0.88 },
    { code: 'CNY', name: 'Chinese Yuan', rate: 7.24 },
    { code: 'INR', name: 'Indian Rupee', rate: 83.5 },
    { code: 'BRL', name: 'Brazilian Real', rate: 4.97 }
];

export function rateOf(code: string): number {
    return currencies.find((c) => c.code === code)?.rate ?? 1;
}

/** Convert every expense to `baseCurrency`, compute net balances, and find minimum transfers via greedy debt simplification. */
export function computeTransfers(people: Person[], expenses: Expense[], baseCurrency: string): { from: string; to: string; amount: number }[] {
    const net: Record<string, number> = {};
    for (const p of people) net[p.id] = 0;
    for (const e of expenses) {
        const baseAmount = (e.amount / rateOf(e.currency)) * rateOf(baseCurrency);
        net[e.paidBy] += baseAmount;
        const share = baseAmount / e.splitAmong.length;
        for (const pid of e.splitAmong) net[pid] -= share;
    }
    const debtors = Object.entries(net)
        .filter(([, v]) => v < 0)
        .map(([id, v]) => ({ id, v: -v }))
        .sort((a, b) => b.v - a.v);
    const creditors = Object.entries(net)
        .filter(([, v]) => v > 0)
        .map(([id, v]) => ({ id, v }))
        .sort((a, b) => b.v - a.v);
    const result: { from: string; to: string; amount: number }[] = [];
    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
        const amt = Math.min(debtors[di].v, creditors[ci].v);
        if (amt > 0.01) result.push({ from: debtors[di].id, to: creditors[ci].id, amount: Math.round(amt * 100) / 100 });
        debtors[di].v -= amt;
        creditors[ci].v -= amt;
        if (debtors[di].v < 0.01) di++;
        if (creditors[ci].v < 0.01) ci++;
    }
    return result;
}