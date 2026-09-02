/* ==========================================================================
   Calcuvelo — calculator logic (shared by every page)
   --------------------------------------------------------------------------
   • One Alpine.js component per calculator (compound, mortgage, ...).
   • Each component exposes:
       - init()       creates its Chart.js chart on $nextTick (after layout)
       - update()     recomputes results + chart + the data-table rows.
                      Re-run automatically by  x-effect="update()"  on every
                      input change → real-time, no "Calculate" button.
       - view         'chart' | 'table'  (the results view toggle)
       - setView(v)   switches the view and re-fits the chart when shown
       - rows[]       period-by-period data for the table
       - tableCols[]  column definitions so ONE generic <table> markup works
                      on every page:  { key, label, money?, cls? }
       - out{}        the summary numbers shown in the stat tiles

   IMPORTANT: the Chart instance lives in a CLOSURE variable (`let chart`),
   never on `this`. A Chart on Alpine's reactive object makes every internal
   Chart.js write reactive and triggers an infinite render loop.

   To change a formula later, edit that component's update() method only.
   ========================================================================== */

/* ----------------------------- Formatting helpers ----------------------------- */
const money = (v, dec = 0) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: dec, maximumFractionDigits: dec })
    .format(Number.isFinite(v) ? v : 0);

const pct = (v, dec = 2) =>
  new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: dec, maximumFractionDigits: dec })
    .format(Number.isFinite(v) ? v : 0);

const nfmt = (v, dec = 1) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: dec }).format(Number.isFinite(v) ? v : 0);

const compactCurrency = new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 1 });
const compact = (v) => compactCurrency.format(Number.isFinite(v) ? v : 0);

// "X months (Y yrs Z mo)" from a month count
const monthsToText = (m) => {
  if (!Number.isFinite(m)) return 'Never at this payment';
  m = Math.ceil(m);
  const y = Math.floor(m / 12), mo = m % 12;
  return `${m} mo` + (y ? ` (${y} yr${y > 1 ? 's' : ''}${mo ? ` ${mo} mo` : ''})` : '');
};

// Year label for a running month counter: "Year 3" or "3y 6m" for a partial year
const yearLabel = (m) => {
  const y = Math.floor(m / 12), mo = m % 12;
  return mo === 0 ? `Year ${y}` : `${y}y ${mo}m`;
};

/* ----------------------------- Chart.js shared theme ----------------------------- */
Chart.defaults.font.family = "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#64748b';
Chart.defaults.plugins.tooltip.backgroundColor = '#0f172a';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.tooltip.boxPadding = 4;

// Brand palette
const C = {
  indigo: '#4f46e5', indigoFill: 'rgba(79,70,229,0.12)',
  emerald: '#10b981', emeraldFill: 'rgba(16,185,129,0.14)',
  slate: '#94a3b8', slateFill: 'rgba(148,163,184,0.18)',
  amber: '#f59e0b', sky: '#0ea5e9', rose: '#f43f5e', roseFill: 'rgba(244,63,94,0.12)'
};

// Standard options for the currency line charts
function lineOpts(extra) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 16 } },
      tooltip: { callbacks: { label: (c) => (c.dataset.label ? c.dataset.label + ': ' : '') + money(c.parsed.y, 0) } }
    },
    scales: {
      y: { beginAtZero: true, ticks: { callback: (v) => compact(v) }, grid: { color: '#f1f5f9' }, border: { display: false } },
      x: { grid: { display: false }, border: { display: false } }
    }
  };
  return Object.assign(base, extra || {});
}

// Standard options for the currency doughnut charts (mortgage, auto loan)
function doughnutOpts() {
  return {
    responsive: true, maintainAspectRatio: false, cutout: '62%',
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 14 } },
      tooltip: { callbacks: { label: (c) => c.label + ': ' + money(c.parsed, 0) } }
    }
  };
}

/* ======================================================================
   1. COMPOUND INTEREST SIMULATOR
   Monthly compounding:  balance = balance * (1 + r/12) + monthlyContribution
   Time horizon = Years + Months  →  totalMonths = years * 12 + months
   ====================================================================== */
function compound() {
  let chart = null;
  return {
    principal: 10000, monthly: 500, rate: 7, years: 20, months: 0,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Period' },
      { key: 'start', label: 'Starting balance', money: true },
      { key: 'interest', label: 'Interest earned', money: true, cls: 'col-interest' },
      { key: 'contributions', label: 'Contributions', money: true },
      { key: 'end', label: 'Ending balance', money: true, cls: 'col-end' }
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'line',
          data: {
            labels: [],
            datasets: [
              { label: 'Contributions', data: [], borderColor: C.slate, backgroundColor: C.slateFill, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
              { label: 'Interest',      data: [], borderColor: C.emerald, backgroundColor: C.emeraldFill, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }
            ]
          },
          options: lineOpts({
            scales: {
              y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => compact(v) }, grid: { color: '#f1f5f9' }, border: { display: false } },
              x: { stacked: true, grid: { display: false }, border: { display: false }, title: { display: true, text: 'Years' } }
            }
          })
        });
        this.update();
      });
    },
    setView(v) {
      this.view = v;
      if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); });
    },
    update() {
      const P = Math.max(this.principal || 0, 0);
      const c = Math.max(this.monthly || 0, 0);
      const r = (this.rate || 0) / 100 / 12;
      const totalMonths = Math.max(Math.round((this.years || 0) * 12 + (this.months || 0)), 0);

      let bal = P, contributed = P;
      const labels = ['0'], contribSeries = [P], interestSeries = [0];
      const rows = [];

      let m = 0;
      while (m < totalMonths) {
        const chunk = Math.min(12, totalMonths - m);
        const startBal = bal;
        const startContributed = contributed;
        for (let k = 0; k < chunk; k++) { bal = bal * (1 + r) + c; contributed += c; m++; }
        const periodContrib = contributed - startContributed;
        const periodInterest = (bal - startBal) - periodContrib;
        rows.push({ period: yearLabel(m), start: startBal, interest: periodInterest, contributions: periodContrib, end: bal });
        labels.push(m % 12 === 0 ? String(m / 12) : (m / 12).toFixed(1));
        contribSeries.push(Math.round(contributed));
        interestSeries.push(Math.round(Math.max(bal - contributed, 0)));
      }

      this.rows = rows;
      this.out = { balance: bal, contributed, interest: bal - contributed, multiple: contributed > 0 ? bal / contributed : 0, totalMonths };

      if (!chart) return;
      chart.data.labels = labels;
      chart.data.datasets[0].data = contribSeries;
      chart.data.datasets[1].data = interestSeries;
      chart.update('none');
    }
  };
}

/* ======================================================================
   2. MORTGAGE AMORTIZATION
   Payment (P&I):  M = L * i(1+i)^n / ((1+i)^n - 1)      i = monthly rate
   Table: a year-by-year amortization schedule.
   ====================================================================== */
function mortgage() {
  let chart = null;
  return {
    price: 450000, downPct: 20, rate: 6.5, term: 30,
    propTax: 1.1, insurance: 1800, hoa: 0,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Year' },
      { key: 'start', label: 'Starting balance', money: true },
      { key: 'principal', label: 'Principal paid', money: true },
      { key: 'interest', label: 'Interest paid', money: true, cls: 'col-neg' },
      { key: 'end', label: 'Ending balance', money: true, cls: 'col-end' }
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'doughnut',
          data: { labels: ['Principal', 'Interest'], datasets: [{ data: [1, 1], backgroundColor: [C.indigo, C.amber], borderWidth: 0, hoverOffset: 6 }] },
          options: doughnutOpts()
        });
        this.update();
      });
    },
    setView(v) { this.view = v; if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); }); },
    update() {
      const price = Math.max(this.price || 0, 0);
      const down  = price * (this.downPct || 0) / 100;
      const loan  = Math.max(price - down, 0);
      const i = (this.rate || 0) / 100 / 12;
      const years = Math.max(Math.round(this.term || 1), 1);
      const n = years * 12;
      const M = i > 0 ? loan * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1) : loan / n;

      const totalPaid = M * n;
      const totalInterest = Math.max(totalPaid - loan, 0);
      const mTax = price * (this.propTax || 0) / 100 / 12;
      const mIns = (this.insurance || 0) / 12;
      const mHoa = this.hoa || 0;

      // Year-by-year amortization schedule
      const rows = [];
      let bal = loan;
      for (let y = 1; y <= years && bal > 0.005; y++) {
        const startBal = bal;
        let princ = 0, int = 0;
        for (let k = 0; k < 12; k++) {
          const interest = bal * i;
          const principal = Math.min(M - interest, bal);
          int += interest; princ += principal;
          bal -= principal;
        }
        rows.push({ period: `Year ${y}`, start: startBal, principal: princ, interest: int, end: Math.max(bal, 0) });
      }

      this.rows = rows;
      this.out = { down, loan, payment: M, totalInterest, totalPaid, monthlyAllIn: M + mTax + mIns + mHoa, mTax, mIns, mHoa };

      if (!chart) return;
      chart.data.datasets[0].data = [loan, totalInterest];
      chart.update('none');
    }
  };
}

/* ======================================================================
   3. RETIREMENT / 401(k) ESTIMATOR
   Monthly compounding of (employee % + employer match %) of salary,
   with an annual raise. Table: balance by age, year by year.
   ====================================================================== */
function retirement() {
  let chart = null;
  return {
    curAge: 30, retireAge: 65, curBal: 25000, salary: 75000,
    contribPct: 8, matchPct: 4, ret: 7, raise: 2, withdrawRate: 4,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Age' },
      { key: 'start', label: 'Starting balance', money: true },
      { key: 'contributions', label: 'Contributions', money: true },
      { key: 'growth', label: 'Investment growth', money: true, cls: 'col-interest' },
      { key: 'end', label: 'Ending balance', money: true, cls: 'col-end' }
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'line',
          data: {
            labels: [],
            datasets: [
              { label: 'Projected balance', data: [], borderColor: C.indigo, backgroundColor: C.indigoFill, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
              { label: 'Total contributed', data: [], borderColor: C.slate, borderDash: [5, 4], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 }
            ]
          },
          options: lineOpts({
            scales: {
              y: { beginAtZero: true, ticks: { callback: (v) => compact(v) }, grid: { color: '#f1f5f9' }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false }, title: { display: true, text: 'Age' } }
            }
          })
        });
        this.update();
      });
    },
    setView(v) { this.view = v; if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); }); },
    update() {
      const a0 = Math.max(this.curAge || 0, 0);
      const a1 = Math.max(this.retireAge || 0, a0);
      const months = (a1 - a0) * 12;
      const rM = (this.ret || 0) / 100 / 12;

      let bal = Math.max(this.curBal || 0, 0);
      let salary = Math.max(this.salary || 0, 0);
      let totalContrib = 0;
      const start = bal;

      const labels = [String(a0)], balSeries = [bal], contribSeries = [start];
      const rows = [];
      let yearStartBal = bal, yearContrib = 0;

      for (let m = 1; m <= months; m++) {
        const monthlyContribution = salary / 12 * ((this.contribPct || 0) + (this.matchPct || 0)) / 100;
        bal = bal * (1 + rM) + monthlyContribution;
        totalContrib += monthlyContribution;
        yearContrib += monthlyContribution;
        if (m % 12 === 0) {
          const age = a0 + m / 12;
          const growth = bal - yearStartBal - yearContrib;
          rows.push({ period: `Age ${age}`, start: yearStartBal, contributions: yearContrib, growth, end: bal });
          labels.push(String(age));
          balSeries.push(Math.round(bal));
          contribSeries.push(Math.round(start + totalContrib));
          salary *= 1 + (this.raise || 0) / 100;
          yearStartBal = bal; yearContrib = 0;
        }
      }

      this.rows = rows;
      this.out = { balance: bal, contributed: totalContrib, growth: bal - start - totalContrib, monthlyIncome: bal * (this.withdrawRate || 0) / 100 / 12 };

      if (!chart) return;
      chart.data.labels = labels;
      chart.data.datasets[0].data = balSeries;
      chart.data.datasets[1].data = contribSeries;
      chart.update('none');
    }
  };
}

/* ======================================================================
   4. AUTO LOAN CALCULATOR
   Amount financed = price + tax + fees - down - trade-in.
   Table: year-by-year amortization of the loan.
   ====================================================================== */
function autoLoan() {
  let chart = null;
  return {
    price: 35000, down: 4000, tradeIn: 0, taxRate: 7, fees: 700, term: 60, apr: 6.9,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Period' },
      { key: 'start', label: 'Starting balance', money: true },
      { key: 'principal', label: 'Principal paid', money: true },
      { key: 'interest', label: 'Interest paid', money: true, cls: 'col-neg' },
      { key: 'end', label: 'Ending balance', money: true, cls: 'col-end' }
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'doughnut',
          data: {
            labels: ['Vehicle (net of trade-in)', 'Sales tax', 'Fees', 'Interest'],
            datasets: [{ data: [1, 1, 1, 1], backgroundColor: [C.indigo, C.sky, C.slate, C.amber], borderWidth: 0, hoverOffset: 6 }]
          },
          options: doughnutOpts()
        });
        this.update();
      });
    },
    setView(v) { this.view = v; if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); }); },
    update() {
      const price   = Math.max(this.price || 0, 0);
      const tradeIn = Math.max(this.tradeIn || 0, 0);
      const taxable = Math.max(price - tradeIn, 0);
      const tax     = taxable * (this.taxRate || 0) / 100;
      const fees    = Math.max(this.fees || 0, 0);
      const financed = Math.max(price + tax + fees - (this.down || 0) - tradeIn, 0);

      const i = (this.apr || 0) / 100 / 12;
      const n = Math.max(Math.round(this.term || 1), 1);
      const M = i > 0 ? financed * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1) : financed / n;

      const totalPayments = M * n;
      const interest = Math.max(totalPayments - financed, 0);
      const vehicleNet = Math.max(price - tradeIn, 0);

      // Year-by-year amortization schedule
      const rows = [];
      let bal = financed, done = 0;
      while (done < n && bal > 0.005) {
        const chunk = Math.min(12, n - done);
        const startBal = bal;
        let princ = 0, int = 0;
        for (let k = 0; k < chunk; k++) {
          const int1 = bal * i;
          const princ1 = Math.min(M - int1, bal);
          int += int1; princ += princ1; bal -= princ1; done++;
        }
        rows.push({ period: yearLabel(done), start: startBal, principal: princ, interest: int, end: Math.max(bal, 0) });
      }

      this.rows = rows;
      this.out = { payment: M, financed, interest, totalCost: (this.down || 0) + totalPayments };

      if (!chart) return;
      chart.data.datasets[0].data = [vehicleNet, tax, fees, interest];
      chart.update('none');
    }
  };
}

/* ======================================================================
   5. DEBT PAYOFF TIMEFRAME
   Amortises a revolving balance at a fixed monthly payment.
   Table: month-by-month for the "current payment" scenario.
   ====================================================================== */
function debt() {
  let chart = null;
  return {
    balance: 6000, apr: 22, payment: 250, extra: 0,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Month' },
      { key: 'start', label: 'Starting balance', money: true },
      { key: 'interest', label: 'Interest', money: true, cls: 'col-neg' },
      { key: 'payment', label: 'Payment', money: true },
      { key: 'end', label: 'Ending balance', money: true, cls: 'col-end' }
    ],
    // Simulate month-by-month; returns { months, interest, series, rows }
    simulate(pay, keepRows) {
      const i = (this.apr || 0) / 100 / 12;
      let bal = Math.max(this.balance || 0, 0);
      let interest = 0, m = 0;
      const series = [bal];
      const rows = [];
      if (pay <= bal * i) return { months: Infinity, interest: Infinity, series, rows };
      while (bal > 0 && m < 600) {
        const charge = bal * i;
        const applied = Math.min(pay, bal + charge);
        interest += charge;
        const startBal = bal;
        bal = bal + charge - applied;
        if (bal < 0) bal = 0;
        m++;
        series.push(bal);
        if (keepRows) rows.push({ period: `Month ${m}`, start: startBal, interest: charge, payment: applied, end: bal });
      }
      return { months: m, interest, series, rows };
    },
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'line',
          data: {
            labels: [],
            datasets: [
              { label: 'Current payment',   data: [], borderColor: C.rose, backgroundColor: C.roseFill, fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 },
              { label: 'With extra payment', data: [], borderColor: C.emerald, backgroundColor: C.emeraldFill, fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 }
            ]
          },
          options: lineOpts({
            scales: {
              y: { beginAtZero: true, ticks: { callback: (v) => compact(v) }, grid: { color: '#f1f5f9' }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false }, title: { display: true, text: 'Months' } }
            }
          })
        });
        this.update();
      });
    },
    setView(v) { this.view = v; if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); }); },
    update() {
      const base    = this.simulate(this.payment || 0, true);
      const boosted = this.simulate((this.payment || 0) + (this.extra || 0), false);

      this.rows = base.rows;
      this.out = {
        feasible: Number.isFinite(base.months),
        months: base.months,
        interest: base.interest,
        totalPaid: (this.balance || 0) + (Number.isFinite(base.interest) ? base.interest : 0),
        monthsSaved: (Number.isFinite(base.months) && Number.isFinite(boosted.months)) ? base.months - boosted.months : 0,
        interestSaved: (Number.isFinite(base.interest) && Number.isFinite(boosted.interest)) ? base.interest - boosted.interest : 0
      };

      if (!chart) return;
      const len = Math.max(base.series.length, boosted.series.length);
      chart.data.labels = Array.from({ length: len }, (_, k) => k);
      chart.data.datasets[0].data = base.series;
      chart.data.datasets[1].data = boosted.series;
      chart.data.datasets[1].hidden = !(this.extra > 0);
      chart.update('none');
    }
  };
}

/* ======================================================================
   6. INFLATION / PURCHASING POWER
   Future purchasing power:  A / (1 + f)^t     Amount needed:  A * (1 + f)^t
   Time horizon = Years + Months.
   ====================================================================== */
function inflation() {
  let chart = null;
  return {
    amount: 10000, years: 20, months: 0, rate: 3,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Period' },
      { key: 'power', label: "Purchasing power", money: true, cls: 'col-end' },
      { key: 'lost', label: 'Cumulative value lost', money: true, cls: 'col-neg' },
      { key: 'needed', label: 'Needed to keep pace', money: true }
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'line',
          data: {
            labels: [],
            datasets: [
              { label: "Purchasing power (today's $)", data: [], borderColor: C.rose, backgroundColor: C.roseFill, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
              { label: 'Amount needed to keep pace',   data: [], borderColor: C.indigo, borderDash: [5, 4], fill: false, tension: 0.3, pointRadius: 0, borderWidth: 2 }
            ]
          },
          options: lineOpts({
            scales: {
              y: { beginAtZero: true, ticks: { callback: (v) => compact(v) }, grid: { color: '#f1f5f9' }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false }, title: { display: true, text: 'Years from now' } }
            }
          })
        });
        this.update();
      });
    },
    setView(v) { this.view = v; if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); }); },
    update() {
      const A = Math.max(this.amount || 0, 0);
      const f = (this.rate || 0) / 100;
      const totalMonths = Math.max(Math.round((this.years || 0) * 12 + (this.months || 0)), 0);
      const yTotal = totalMonths / 12;

      const labels = [], powerSeries = [], neededSeries = [];
      const rows = [];
      // one point/row per whole year, plus a final partial point
      const stops = [];
      for (let y = 0; y <= Math.floor(yTotal); y++) stops.push(y);
      if (yTotal > stops[stops.length - 1]) stops.push(yTotal);

      stops.forEach((t, idx) => {
        const power = A / Math.pow(1 + f, t);
        const needed = A * Math.pow(1 + f, t);
        labels.push(Number.isInteger(t) ? String(t) : t.toFixed(1));
        powerSeries.push(power);
        neededSeries.push(needed);
        if (idx > 0) {
          rows.push({ period: Number.isInteger(t) ? `Year ${t}` : `${Math.floor(t)}y ${Math.round((t % 1) * 12)}m`, power, lost: A - power, needed });
        }
      });

      const endPower = A / Math.pow(1 + f, yTotal);
      this.rows = rows;
      this.out = { power: endPower, needed: A * Math.pow(1 + f, yTotal), lost: A - endPower, lostPct: A > 0 ? 1 - endPower / A : 0 };

      if (!chart) return;
      chart.data.labels = labels;
      chart.data.datasets[0].data = powerSeries;
      chart.data.datasets[1].data = neededSeries;
      chart.update('none');
    }
  };
}

/* ======================================================================
   7. PRESENT VALUE / FUTURE VALUE  (time value of money)
   value = value * (1 + i) + pmt   (ordinary annuity, payment at period end)
   Table: value period by period.
   ====================================================================== */
function tvm() {
  let chart = null;
  return {
    mode: 'fv',
    amount: 25000, pmt: 0, rate: 6, periods: 120, freq: 12,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Period' },
      { key: 'start', label: 'Starting value', money: true },
      { key: 'growth', label: 'Growth', money: true, cls: 'col-interest' },
      { key: 'payment', label: 'Payment', money: true },
      { key: 'end', label: 'Ending value', money: true, cls: 'col-end' }
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'line',
          data: { labels: [], datasets: [
            { label: 'Value', data: [], borderColor: C.indigo, backgroundColor: C.indigoFill, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }
          ] },
          options: lineOpts({
            scales: {
              y: { beginAtZero: true, ticks: { callback: (v) => compact(v) }, grid: { color: '#f1f5f9' }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false }, title: { display: true, text: 'Periods' } }
            }
          })
        });
        this.update();
      });
    },
    setView(v) { this.view = v; if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); }); },
    update() {
      const i = (this.rate || 0) / 100 / (this.freq || 1);
      const n = Math.max(Math.round(this.periods || 0), 0);
      const amt = this.amount || 0;
      const pmt = this.pmt || 0;

      const grow = (pv) => {
        const labels = ['0'], values = [pv], rows = [];
        let v = pv;
        for (let k = 1; k <= n; k++) {
          const startV = v;
          const growth = startV * i;
          v = startV * (1 + i) + pmt;
          labels.push(String(k));
          values.push(v);
          rows.push({ period: `Period ${k}`, start: startV, growth, payment: pmt, end: v });
        }
        return { labels, values, rows };
      };

      let result, series, startPV;
      if (this.mode === 'fv') {
        startPV = amt;
        series = grow(amt);
        result = series.values[series.values.length - 1] ?? amt;
      } else {
        const factor = Math.pow(1 + i, n);
        const annuityFV = i > 0 ? pmt * ((factor - 1) / i) : pmt * n;
        startPV = (amt - annuityFV) / factor;
        result = startPV;
        series = grow(startPV);
      }

      const totalContributions = pmt * n;
      const endValue = this.mode === 'fv' ? result : amt;
      this.rows = series.rows;
      this.out = {
        result,
        invested: startPV + totalContributions,
        contributions: totalContributions,
        interest: endValue - startPV - totalContributions
      };

      if (!chart) return;
      chart.data.labels = series.labels;
      chart.data.datasets[0].data = series.values;
      chart.update('none');
    }
  };
}

/* ======================================================================
   8. REAL ROI CALCULATOR
   Nominal end = P (1+g)^y ;  tax on the gain ;  real = afterTax / (1+f)^y
   Time horizon = Years + Months. Table: the nominal + real trajectory
   (before capital-gains tax, which is applied once at sale).
   ====================================================================== */
function realRoi() {
  let chart = null;
  return {
    initial: 10000, ret: 8, years: 15, months: 0, infl: 3, tax: 15,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Year' },
      { key: 'start', label: 'Starting value', money: true },
      { key: 'growth', label: 'Growth', money: true, cls: 'col-interest' },
      { key: 'endNominal', label: 'Ending value (nominal)', money: true, cls: 'col-end' },
      { key: 'real', label: "Real value (pre-tax, today's $)", money: true }
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'bar',
          data: {
            labels: ['Nominal', 'After tax', 'After tax + inflation'],
            datasets: [{ data: [0, 0, 0], backgroundColor: [C.slate, C.amber, C.emerald], borderRadius: 8, borderWidth: 0 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.y, 0) } } },
            scales: {
              y: { beginAtZero: true, ticks: { callback: (v) => compact(v) }, grid: { color: '#f1f5f9' }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false } }
            }
          }
        });
        this.update();
      });
    },
    setView(v) { this.view = v; if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); }); },
    update() {
      const P = Math.max(this.initial || 0, 0);
      const g = (this.ret || 0) / 100;
      const f = (this.infl || 0) / 100;
      const t = (this.tax || 0) / 100;
      const totalMonths = Math.max(Math.round((this.years || 0) * 12 + (this.months || 0)), 1);
      const y = totalMonths / 12;

      const nominalEnd = P * Math.pow(1 + g, y);
      const gain = Math.max(nominalEnd - P, 0);
      const taxOwed = gain * t;
      const afterTax = nominalEnd - taxOwed;
      const real = afterTax / Math.pow(1 + f, y);

      // Year-by-year trajectory (pre-tax; tax applies once at sale)
      const rows = [];
      const stops = [];
      for (let yy = 1; yy <= Math.floor(y); yy++) stops.push(yy);
      if (y > (stops[stops.length - 1] || 0)) stops.push(y);
      let prev = P;
      stops.forEach((tt) => {
        const endNominal = P * Math.pow(1 + g, tt);
        rows.push({
          period: Number.isInteger(tt) ? `Year ${tt}` : `${Math.floor(tt)}y ${Math.round((tt % 1) * 12)}m`,
          start: prev, growth: endNominal - prev, endNominal, real: endNominal / Math.pow(1 + f, tt)
        });
        prev = endNominal;
      });

      this.rows = rows;
      this.out = {
        nominalEnd, afterTax, real, taxOwed,
        nominalCagr: g,
        afterTaxCagr: Math.pow(afterTax / P, 1 / y) - 1,
        realCagr: Math.pow(real / P, 1 / y) - 1
      };

      if (!chart) return;
      chart.data.datasets[0].data = [nominalEnd, afterTax, real];
      chart.update('none');
    }
  };
}

/* ======================================================================
   9. SALARY <-> HOURLY WAGE CONVERTER
   Table: the same pay figure expressed in every cadence.
   ====================================================================== */
function wage() {
  let chart = null;
  return {
    mode: 'annual',
    annual: 75000, hourly: 36, hoursWeek: 40, daysWeek: 5, weeksYear: 52, ptoWeeks: 2,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Pay period' },
      { key: 'amount', label: 'Gross amount', cls: 'col-end' }   // pre-formatted string (cents where they matter)
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'bar',
          data: {
            labels: ['Hourly', 'Daily', 'Weekly', 'Bi-weekly', 'Monthly'],
            datasets: [{ data: [0, 0, 0, 0, 0], backgroundColor: C.indigo, borderRadius: 8, borderWidth: 0 }]
          },
          options: {
            indexAxis: 'y',
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.parsed.x, 2) } } },
            scales: {
              x: { beginAtZero: true, ticks: { callback: (v) => compact(v) }, grid: { color: '#f1f5f9' }, border: { display: false } },
              y: { grid: { display: false }, border: { display: false } }
            }
          }
        });
        this.update();
      });
    },
    setView(v) { this.view = v; if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); }); },
    update() {
      const hw = Math.max(this.hoursWeek || 0, 1);
      const dw = Math.max(this.daysWeek || 0, 1);
      const weeks = Math.max(this.weeksYear || 52, 1);
      const worked = Math.max(weeks - (this.ptoWeeks || 0), 1);

      const annual = this.mode === 'annual'
        ? Math.max(this.annual || 0, 0)
        : Math.max(this.hourly || 0, 0) * hw * worked;

      const hourly   = annual / (hw * worked);
      const weekly   = annual / weeks;
      const daily    = weekly / dw;
      const biweekly = weekly * 2;
      const monthly  = annual / 12;

      this.out = { annual, hourly, daily, weekly, biweekly, monthly };
      this.rows = [
        { period: 'Hourly (effective)', amount: money(hourly, 2) },
        { period: 'Daily', amount: money(daily, 2) },
        { period: 'Weekly', amount: money(weekly, 2) },
        { period: 'Bi-weekly', amount: money(biweekly, 2) },
        { period: 'Monthly', amount: money(monthly, 2) },
        { period: 'Annual', amount: money(annual, 0) }
      ];

      if (!chart) return;
      chart.data.datasets[0].data = [hourly, daily, weekly, biweekly, monthly];
      chart.update('none');
    }
  };
}

/* ======================================================================
   10. RULE OF 72 / ECONOMIC DOUBLING
   yearsToDouble ≈ rule / ratePercent   |   exact = ln(2) / ln(1 + r)
   Time horizon = Years + Months. Table: value year by year.
   ====================================================================== */
function rule72() {
  let chart = null;
  return {
    growth: 8, rule: 72, start: 10000, horizon: 30, months: 0,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Year' },
      { key: 'start', label: 'Starting value', money: true },
      { key: 'growth', label: 'Growth', money: true, cls: 'col-interest' },
      { key: 'end', label: 'Ending value', money: true, cls: 'col-end' },
      { key: 'multiple', label: '× of start' }
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'line',
          data: { labels: [], datasets: [
            { label: 'Projected value', data: [], borderColor: C.indigo, backgroundColor: C.indigoFill, fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 }
          ] },
          options: lineOpts({
            scales: {
              y: { beginAtZero: true, ticks: { callback: (v) => compact(v) }, grid: { color: '#f1f5f9' }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false }, title: { display: true, text: 'Years' } }
            }
          })
        });
        this.update();
      });
    },
    setView(v) { this.view = v; if (v === 'chart') this.$nextTick(() => { if (chart) chart.resize(); }); },
    update() {
      const gPct = this.growth || 0;
      const r = gPct / 100;
      const S = Math.max(this.start || 0, 0);
      const totalMonths = Math.max(Math.round((this.horizon || 0) * 12 + (this.months || 0)), 1);
      const yTotal = totalMonths / 12;

      const ruleYears  = gPct > 0 ? (this.rule || 72) / gPct : Infinity;
      const exactYears = r > 0 ? Math.log(2) / Math.log(1 + r) : Infinity;

      const labels = [], values = [];
      const rows = [];
      const stops = [];
      for (let y = 0; y <= Math.floor(yTotal); y++) stops.push(y);
      if (yTotal > stops[stops.length - 1]) stops.push(yTotal);

      let prev = S;
      stops.forEach((t, idx) => {
        const v = S * Math.pow(1 + r, t);
        labels.push(Number.isInteger(t) ? String(t) : t.toFixed(1));
        values.push(v);
        if (idx > 0) {
          rows.push({
            period: Number.isInteger(t) ? `Year ${t}` : `${Math.floor(t)}y ${Math.round((t % 1) * 12)}m`,
            start: prev, growth: v - prev, end: v, multiple: (S > 0 ? (v / S) : 0).toFixed(2) + '×'
          });
        }
        prev = v;
      });

      this.rows = rows;
      this.out = {
        ruleYears, exactYears,
        doublings: Number.isFinite(exactYears) ? yTotal / exactYears : 0,
        endValue: S * Math.pow(1 + r, yTotal),
        multiple: Math.pow(1 + r, yTotal)
      };

      if (!chart) return;
      chart.data.labels = labels;
      chart.data.datasets[0].data = values;
      chart.update('none');
    }
  };
}

/* ----------------------------- Sidebar: mark the active page ----------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.querySelectorAll('a.nav-link[data-nav]').forEach((a) => {
    if ((a.getAttribute('href') || '').toLowerCase() === here) {
      a.classList.add('nav-link-active');
      a.setAttribute('aria-current', 'page');
    }
  });
});

/* ----------------------------- Chart re-fit safety net -----------------------------
   Extra resize passes after the async Tailwind CDN styles and web fonts land. */
function refitCharts() {
  document.querySelectorAll('canvas').forEach((c) => {
    const ch = window.Chart && Chart.getChart(c);
    if (ch) ch.resize();
  });
}
window.addEventListener('load', () => { refitCharts(); setTimeout(refitCharts, 250); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(refitCharts);
