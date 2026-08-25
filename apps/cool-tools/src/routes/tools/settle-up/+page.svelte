<script lang="ts">
    interface Person { name: string; id: string; }
    interface Expense { paidBy: string; amount: number; splitAmong: string[]; desc: string; currency: string; }
    interface Group { id: string; name: string; people: Person[]; expenses: Expense[]; }

    let groups = $state<Group[]>([{ id: 'default', name: 'Untitled Group', people: [], expenses: [] }]);
    let activeGroup = $state('default');
    let newName = $state('');
    let paidBy = $state('');
    let amount = $state(0);
    let desc = $state('');
    let splitAmong = $state<string[]>([]);
    let txfr: { from: string; to: string; amount: number }[] = $state([]);
    let txfrCurrency = $state('USD');
    let newGroupName = $state('');
    let editingName = $state('');
    let editingGroup: string | null = $state(null);
    let editingPerson: string | null = $state(null);
    let editingPersonName = $state('');
    let currency = $state('USD');
    let displayCurrency = $state('USD');

    const currencies: { code: string; name: string; rate: number }[] = [
        { code: 'USD', name: 'US Dollar', rate: 1 },
        { code: 'EUR', name: 'Euro', rate: 0.92 },
        { code: 'GBP', name: 'British Pound', rate: 0.79 },
        { code: 'JPY', name: 'Japanese Yen', rate: 144 },
        { code: 'CAD', name: 'Canadian Dollar', rate: 1.36 },
        { code: 'AUD', name: 'Australian Dollar', rate: 1.55 },
        { code: 'CHF', name: 'Swiss Franc', rate: 0.88 },
        { code: 'CNY', name: 'Chinese Yuan', rate: 7.24 },
        { code: 'INR', name: 'Indian Rupee', rate: 83.5 },
        { code: 'BRL', name: 'Brazilian Real', rate: 4.97 },
    ];

    const STORAGE = 'cool-tools-settle-up';
    const SCHEMA_VERSION = 1;

    function load() {
        try {
            const d = JSON.parse(localStorage.getItem(STORAGE) || '{}');
            if (d.groups && d.groups.length > 0) groups = d.groups;
        } catch { /* corrupt stored data, ignore */ }
    }
    function save() { localStorage.setItem(STORAGE, JSON.stringify({ version: SCHEMA_VERSION, groups })); }
    load();

    let g = $derived(groups.find((g) => g.id === activeGroup) ?? groups[0]);

    function addGroup() {
        const n = newGroupName.trim();
        if (!n) return;
        const id = crypto.randomUUID();
        groups = [...groups, { id, name: n, people: [], expenses: [] }];
        activeGroup = id;
        newGroupName = '';
        save();
    }

    function removeGroup(id: string) {
        if (groups.length <= 1) return;
        groups = groups.filter((g) => g.id !== id);
        if (activeGroup === id) activeGroup = groups[0].id;
        save();
    }

    function startRenameGroup(id: string) {
        const grp = groups.find((g) => g.id === id);
        if (!grp) return;
        editingName = grp.name;
        editingGroup = id;
    }

    function finishRenameGroup(id: string) {
        const n = editingName.trim();
        if (!n) { editingGroup = null; return; }
        groups = groups.map((g) => g.id === id ? { ...g, name: n } : g);
        editingGroup = null;
        save();
    }

    function addPerson() {
        const n = newName.trim();
        if (!n || g.people.some((p) => p.name === n)) return;
        groups = groups.map((grp) => grp.id === activeGroup ? { ...grp, people: [...grp.people, { name: n, id: crypto.randomUUID() }] } : grp);
        newName = '';
        save();
    }

    function removePerson(id: string) {
        groups = groups.map((grp) => grp.id !== activeGroup ? grp : {
            ...grp,
            people: grp.people.filter((p) => p.id !== id),
            expenses: grp.expenses.map((e) => ({ ...e, splitAmong: e.splitAmong.filter((pid) => pid !== id) })).filter((e) => e.splitAmong.length > 0)
        });
        save();
    }

    function startRenamePerson(id: string) {
        const p = g.people.find((p) => p.id === id);
        if (!p) return;
        editingPersonName = p.name;
        editingPerson = id;
    }

    function finishRenamePerson(id: string) {
        const n = editingPersonName.trim();
        if (!n) { editingPerson = null; return; }
        groups = groups.map((grp) => grp.id !== activeGroup ? grp : { ...grp, people: grp.people.map((p) => p.id === id ? { ...p, name: n } : p) });
        editingPerson = null;
        save();
    }

    function addExpense() {
        if (!paidBy || amount <= 0 || splitAmong.length === 0) return;
        groups = groups.map((grp) => grp.id !== activeGroup ? grp : {
            ...grp,
            expenses: [...grp.expenses, { paidBy, amount, splitAmong, desc: desc || '(no desc)', currency }]
        });
        paidBy = ''; amount = 0; desc = ''; splitAmong = [];
        txfr = [];
        save();
    }

    function removeExpense(i: number) {
        groups = groups.map((grp) => grp.id !== activeGroup ? grp : {
            ...grp,
            expenses: grp.expenses.filter((_, idx) => idx !== i)
        });
        txfr = [];
        save();
    }

    function settle() {
        const baseRate = currencies.find((c) => c.code === currency)?.rate ?? 1;
        const net: Record<string, number> = {};
        for (const p of g.people) net[p.id] = 0;
        for (const e of g.expenses) {
            const rate = currencies.find((c) => c.code === e.currency)?.rate ?? 1;
            const baseAmount = e.amount / rate * baseRate;
            net[e.paidBy] += baseAmount;
            const share = baseAmount / e.splitAmong.length;
            for (const pid of e.splitAmong) net[pid] -= share;
        }
        const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v })).sort((a, b) => b.v - a.v);
        const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v);
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
        txfr = result;
        txfrCurrency = currency;
        displayCurrency = currency;
    }

    let transferRate = $derived((currencies.find((c) => c.code === displayCurrency)?.rate ?? 1) / (currencies.find((c) => c.code === txfrCurrency)?.rate ?? 1));

    function name(id: string) { return g.people.find((p) => p.id === id)?.name ?? '?'; }

    function exportGroup() {
        const blob = new Blob([JSON.stringify({ version: SCHEMA_VERSION, name: g.name, people: g.people, expenses: g.expenses }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${g.name.replace(/\s+/g, '-').toLowerCase()}.json`;
        a.click();
    }

    function importGroup() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const d = JSON.parse(await file.text());
                if (d.version && d.version !== SCHEMA_VERSION) return;
                if (d.people && d.expenses) {
                    const id = crypto.randomUUID();
                    groups = [...groups, { id, name: d.name || 'Imported Group', people: d.people, expenses: d.expenses }];
                    activeGroup = id;
                    save();
                }
            } catch { /* invalid/unsupported file, ignore */ }
        };
        input.click();
    }
</script>

<div class="mx-auto max-w-2xl px-4 py-8">
    <h1 class="mb-1 text-2xl font-bold text-brand-text-highlight">Settle Up</h1>
    <p class="mb-6 text-sm text-brand-text">Split expenses and find the minimum transfers to settle debts. Data is saved locally.</p>

    <div class="mb-2 flex items-center gap-2">
        <input type="text" placeholder="New group" bind:value={newGroupName} onkeydown={(e) => e.key === 'Enter' && addGroup()} class="w-32" />
        <button onclick={addGroup} class="text-xs">+</button>
    </div>
    <div class="mb-4 flex flex-wrap items-center gap-2">
        {#each groups as grp (grp.id)}
            {#if editingGroup === grp.id}
                <input type="text" bind:value={editingName} onkeydown={(e) => e.key === 'Enter' && finishRenameGroup(grp.id)} onblur={() => finishRenameGroup(grp.id)} class="w-24 text-xs" />
            {:else}
                <span
                    class="flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs transition-colors {grp.id === activeGroup ? 'border-brand-primary bg-white/10 text-brand-text-highlight' : 'border-brand-secondary bg-white/5 text-brand-text-highlight hover:bg-white/10'}"
                    role="button"
                    tabindex="0"
                    onclick={() => activeGroup = grp.id}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); activeGroup = grp.id; } }}
                >
                    {grp.name}
                    <button class="border-0 bg-transparent p-0 text-brand-text/60 hover:text-brand-text-highlight" onclick={(e) => { e.stopPropagation(); startRenameGroup(grp.id); }} title="Rename">~</button>
                    {#if groups.length > 1}
                        <button class="border-0 bg-transparent p-0 text-red-400/70 hover:text-red-400" onclick={(e) => { e.stopPropagation(); removeGroup(grp.id); }} title="Remove">✕</button>
                    {/if}
                </span>
            {/if}
        {/each}
    </div>

    <div class="mb-2 flex items-center gap-2">
        <input type="text" placeholder="New person" bind:value={newName} onkeydown={(e) => e.key === 'Enter' && addPerson()} class="w-32" />
        <button onclick={addPerson} class="text-xs">+</button>
    </div>

    {#if g.people.length > 0}
        <div class="mb-4 flex flex-wrap gap-2">
            {#each g.people as p (p.id)}
                <span class="flex items-center gap-1 rounded border border-brand-secondary bg-white/5 px-2 py-1 text-xs text-brand-text-highlight">
                    {#if editingPerson === p.id}
                        <input type="text" bind:value={editingPersonName} onkeydown={(e) => e.key === 'Enter' && finishRenamePerson(p.id)} onblur={() => finishRenamePerson(p.id)} class="w-20 text-xs" />
                    {:else}
                        {p.name}
                        <button class="border-0 bg-transparent p-0 text-brand-text/60 hover:text-brand-text-highlight" onclick={() => startRenamePerson(p.id)} title="Rename">~</button>
                        <button class="border-0 bg-transparent p-0 text-red-400/70 hover:text-red-400" onclick={() => removePerson(p.id)} title="Remove">✕</button>
                    {/if}
                </span>
            {/each}
        </div>

        <h3>Add Expense</h3>
        <div class="mb-6 grid grid-cols-2 gap-2 text-sm">
            <select bind:value={paidBy} class="text-xs">
                <option value="">Who paid?</option>
                {#each g.people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
            </select>
            <div class="flex gap-1">
                <input type="number" placeholder="Amount" bind:value={amount} min="0" step="0.01" class="flex-1" />
                <select bind:value={currency} class="w-20 text-xs">
                    {#each currencies as c (c.code)}<option value={c.code}>{c.code}</option>{/each}
                </select>
            </div>
            <input type="text" placeholder="Description" bind:value={desc} class="col-span-2" />
            <div class="col-span-2">
                <p class="mb-1 text-xs text-brand-text">Split among:</p>
                <div class="flex flex-wrap gap-2">
{#each g.people as p (p.id)}
                        <label class="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={splitAmong.includes(p.id)} onchange={() => {
                                splitAmong = splitAmong.includes(p.id)
                                    ? splitAmong.filter((id) => id !== p.id)
                                    : [...splitAmong, p.id];
                            }} />
                            {p.name}
                        </label>
                    {/each}
                </div>
            </div>
            <button onclick={addExpense} class="col-span-2">Add</button>
        </div>

        {#if g.expenses.length > 0}
            <h3>Expenses</h3>
            <div class="mb-4 flex flex-col gap-1">
                {#each g.expenses as e, i (i)}
                    <div class="flex items-center justify-between rounded border border-brand-secondary bg-white/5 px-3 py-1.5 text-xs text-brand-text">
                        <span>
                            <span class="font-semibold text-brand-text-highlight">{name(e.paidBy)}</span> paid
                            <span class="font-semibold text-brand-text-highlight">{e.currency} {e.amount.toFixed(2)}</span>
                            {#if e.desc}<span class="text-brand-text"> — {e.desc}</span>{/if}
                            <span class="text-brand-text/60"> · split {e.splitAmong.length}: {e.splitAmong.map(name).join(', ')}</span>
                        </span>
                        <button class="size-5 p-0 text-[10px]" onclick={() => removeExpense(i)}>✕</button>
                    </div>
                {/each}
            </div>
        {/if}

        <div class="flex gap-2">
            <button onclick={settle}>Settle Up</button>
            <button onclick={exportGroup}>Export</button>
            <button onclick={importGroup}>Import</button>
        </div>

        {#if txfr.length > 0}
            <div class="mt-4">
                <div class="mb-2 flex items-center gap-2">
                    <label class="text-xs text-brand-text" for="dispCur">Show in:</label>
                    <select id="dispCur" bind:value={displayCurrency} class="w-20 text-xs">
{#each currencies as c (c.code)}<option value={c.code}>{c.code}</option>{/each}
                    </select>
                </div>
                <div class="flex flex-col gap-1">
                    {#each txfr as t (t.from + t.to)}
                        <div class="rounded border border-green-400/30 bg-green-400/5 px-3 py-1.5 text-sm text-green-300">
                            {name(t.from)} → {name(t.to)}: <span class="font-bold">{displayCurrency} {(t.amount * transferRate).toFixed(2)}</span>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    {:else}
        <p class="text-sm text-brand-text">Add people above to get started.</p>
    {/if}
</div>