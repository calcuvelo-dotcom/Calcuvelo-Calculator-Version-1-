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

/* ======================================================================
   11. HIGH-INTEREST DEBT CONSOLIDATION CALCULATOR
   Compares a 0% intro-APR balance-transfer card against a 401(k) loan
   for paying off an existing high-APR credit-card balance.
   ====================================================================== */
function debtConsolidation() {
  return {
    debt: 10000, apr: 24, transferFee: 3, promoMonths: 18, payoffMonths: 12,
    loanAvailable: 53000, k401Rate: 8.5, k401Term: 24, originationFee: 1, scoreImpact: 15,
    out: {},
    // simulate a fixed equal payment over `months`, 0% for the first `promo` months then `goToApr`
    simulateCard(principal, months, promo, goToApr) {
      const payment = months > 0 ? principal / months : 0;
      let bal = principal, interest = 0;
      for (let m = 1; m <= months && bal > 0.005; m++) {
        const rate = (m <= promo) ? 0 : (goToApr / 100 / 12);
        const charge = bal * rate;
        interest += charge;
        bal = bal + charge - payment;
      }
      return { payment, interest, totalPaid: principal + interest };
    },
    update() {
      const debt = Math.max(this.debt || 0, 0);
      const months = Math.max(Math.round(this.payoffMonths || 1), 1);
      const promo = Math.max(Math.round(this.promoMonths || 0), 0);

      // Option 1: 0% APR balance-transfer card
      const fee = debt * (this.transferFee || 0) / 100;
      const principal1 = debt + fee;
      const c1 = this.simulateCard(principal1, months, promo, this.apr || 0);

      // Option 2: 401(k) loan
      const i2 = (this.k401Rate || 0) / 100 / 12;
      const n2 = Math.max(Math.round(this.k401Term || 1), 1);
      const originationAmt = debt * (this.originationFee || 0) / 100;
      const M2 = i2 > 0 ? debt * i2 * Math.pow(1 + i2, n2) / (Math.pow(1 + i2, n2) - 1) : debt / n2;
      const interest2 = M2 * n2 - debt;
      const totalPaid2 = M2 * n2 + originationAmt;
      const loanFeasible = (this.loanAvailable || 0) >= debt;

      const cheaper = totalPaid2 < c1.totalPaid ? 'k401' : 'card';

      this.out = {
        fee, principal1, payment1: c1.payment, interest1: c1.interest, totalPaid1: c1.totalPaid,
        payment2: M2, interest2, totalPaid2, originationAmt, loanFeasible, n2,
        cheaper, diff: Math.abs(c1.totalPaid - totalPaid2)
      };
    }
  };
}

/* ======================================================================
   12. PAYOFF VS. INTEREST (AUTO LOAN) CALCULATOR
   Pay off a car loan today vs. keep riding the existing payment schedule,
   with an optional "what if I invested the lump sum instead" comparison.
   ====================================================================== */
function payoffVsInterest() {
  let chart = null;
  return {
    balance: 14000, apr: 7.5, payment: 420, carValue: 16000, altReturn: 4.5,
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
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'bar',
          data: {
            labels: ['Pay off today', 'Keep riding'],
            datasets: [{ label: 'Total cost', data: [0, 0], backgroundColor: [C.emerald, C.rose], borderRadius: 8, borderWidth: 0 }]
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
      const B = Math.max(this.balance || 0, 0);
      const i = (this.apr || 0) / 100 / 12;
      const P = this.payment || 0;
      const feasible = P > B * i;

      let months = 0, interest = 0, bal = B;
      const rows = [];
      if (feasible) {
        while (bal > 0.005 && months < 600) {
          const charge = bal * i;
          const applied = Math.min(P, bal + charge);
          const startBal = bal;
          interest += charge;
          bal = bal + charge - applied;
          if (bal < 0) bal = 0;
          months++;
          rows.push({ period: `Month ${months}`, start: startBal, interest: charge, payment: applied, end: bal });
        }
      }
      const totalPaidRiding = B + (feasible ? interest : 0);

      const payoffDate = new Date();
      payoffDate.setMonth(payoffDate.getMonth() + months);

      const altRate = (this.altReturn || 0) / 100 / 12;
      const fv = B * Math.pow(1 + altRate, feasible ? months : 0);
      const investGain = fv - B;
      const investmentWins = feasible && investGain > interest;

      this.rows = rows;
      this.out = {
        feasible, months, interest, totalPaidRiding,
        payoffAmount: B, savings: feasible ? interest : 0,
        equity: (this.carValue || 0) - B,
        investGain, investmentWins,
        payoffDate: feasible ? payoffDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'
      };

      if (!chart) return;
      chart.data.datasets[0].data = [B, totalPaidRiding];
      chart.update('none');
    }
  };
}

/* ======================================================================
   13. MORTGAGE AFFORDABILITY CALCULATOR
   Standard front-end (housing ÷ income) and back-end (total debt ÷ income)
   ratio test against conventional lending guidelines (28% / 36%–43%).
   ====================================================================== */
function mortgageAffordability() {
  return {
    income: 160000, otherDebt: 715, savings: 70000,
    homePrice: 650000, downPct: 20, rate: 6.5, amortYears: 30,
    propTaxPct: 1.1, insuranceAnnual: 2000, hoaMonthly: 0, closingCostPct: 3,
    out: {},
    update() {
      const price = Math.max(this.homePrice || 0, 0);
      const down = price * (this.downPct || 0) / 100;
      const loan = Math.max(price - down, 0);
      const i = (this.rate || 0) / 100 / 12;
      const n = Math.max(Math.round(this.amortYears || 1) * 12, 1);
      const M = i > 0 ? loan * i * Math.pow(1 + i, n) / (Math.pow(1 + i, n) - 1) : loan / n;

      const mTax = price * (this.propTaxPct || 0) / 100 / 12;
      const mIns = (this.insuranceAnnual || 0) / 12;
      const mHoa = this.hoaMonthly || 0;
      const totalHousing = M + mTax + mIns + mHoa;

      const monthlyIncome = Math.max(this.income || 0, 0) / 12;
      const frontEnd = monthlyIncome > 0 ? totalHousing / monthlyIncome : Infinity;
      const backEnd = monthlyIncome > 0 ? (totalHousing + (this.otherDebt || 0)) / monthlyIncome : Infinity;

      const closingCosts = price * (this.closingCostPct || 0) / 100;
      const cashNeeded = down + closingCosts;
      const cashShortfall = cashNeeded - (this.savings || 0);

      let verdict, verdictTone;
      if (frontEnd <= 0.28 && backEnd <= 0.36 && cashShortfall <= 0) {
        verdict = 'Yes — comfortably within standard affordability guidelines.'; verdictTone = 'pos';
      } else if (backEnd <= 0.43 && cashShortfall <= 0) {
        verdict = 'Borderline — within the maximum guideline lenders typically allow, but with little room to spare.'; verdictTone = 'warn';
      } else {
        const reasons = [];
        if (frontEnd > 0.28) reasons.push('housing costs exceed 28% of income');
        if (backEnd > 0.43) reasons.push('total debt exceeds 43% of income');
        if (cashShortfall > 0) reasons.push('available savings fall short of the cash needed');
        verdict = 'Likely not affordable right now — ' + reasons.join('; ') + '.'; verdictTone = 'neg';
      }

      this.out = { down, loan, payment: M, mTax, mIns, mHoa, totalHousing, frontEnd, backEnd, closingCosts, cashNeeded, cashShortfall, verdict, verdictTone };
    }
  };
}

/* ======================================================================
   14. ROTH 401(k) SPLIT DISTRIBUTION STRESS RELIEF CALCULATOR
   Models cashing out part of an old 401(k) (taxed + penalized) while
   rolling the rest tax-free into a new plan, then measures how many
   months of expenses the net cash cushion covers.
   ====================================================================== */
function k401SplitDistribution() {
  return {
    distribution: 20942.85, remaining: 38779.65,
    penaltyPct: 10, taxRatePct: 24, processingFee: 75,
    monthlyIncome: 7800, mortgage: 1515, insurance: 323, otherDebt: 715, otherExpenses: 0,
    emergencyFund: 0, checkingSavings: 0,
    out: {},
    update() {
      const dist = Math.max(this.distribution || 0, 0);
      const remain = Math.max(this.remaining || 0, 0);
      const haircut = (this.taxRatePct || 0) + (this.penaltyPct || 0);
      const fee = Math.max(this.processingFee || 0, 0);

      const netDistribution = Math.max(dist * (1 - haircut / 100) - fee, 0);
      const netRemaining = Math.max(remain - fee, 0); // rollover: no tax/penalty, just an admin fee

      const totalMonthlyExpenses = Math.max(this.mortgage || 0, 0) + Math.max(this.insurance || 0, 0)
        + Math.max(this.otherDebt || 0, 0) + Math.max(this.otherExpenses || 0, 0);
      const netCashFlow = (this.monthlyIncome || 0) - totalMonthlyExpenses;

      const cushion = netDistribution + Math.max(this.emergencyFund || 0, 0) + Math.max(this.checkingSavings || 0, 0);
      const runwayMonths = totalMonthlyExpenses > 0 ? cushion / totalMonthlyExpenses : Infinity;

      let stressLabel;
      if (!Number.isFinite(runwayMonths) || runwayMonths >= 6) stressLabel = 'Comfortable cushion';
      else if (runwayMonths >= 3) stressLabel = 'Moderate cushion';
      else if (runwayMonths >= 1) stressLabel = 'High stress';
      else stressLabel = 'Critical — less than one month covered';

      const stressReliefScore = Math.min(Math.max(runwayMonths / 6, 0), 1) * 100;

      this.out = {
        netDistribution, netRemaining, taxAndPenaltyPaid: dist - (netDistribution + fee),
        totalMonthlyExpenses, netCashFlow, cushion, runwayMonths, stressLabel, stressReliefScore
      };
    }
  };
}

/* ======================================================================
   15. DEBT SNOWBALL AND EMERGENCY FUND CALCULATOR
   Baby-steps style simulation: a $1,000 starter emergency fund first,
   then every spare dollar snowballs the smallest debt balance first
   (rolling each freed-up minimum payment into the next target), then —
   once debt-free — the full freed-up cash builds the emergency fund goal.
   ====================================================================== */
function debtSnowball() {
  let chart = null;
  return {
    income: 7200, expenses: 3400,
    ccBalance: 6500, ccApr: 23, ccMinPay: 150,
    k401Balance: 4000, k401Apr: 9, k401MinPay: 120,
    carBalance: 11000, carApr: 6.5, carMinPay: 310,
    giftAmount: 0, efGoal: 10000, efCurrent: 0,
    view: 'chart',
    out: {},
    rows: [],
    tableCols: [
      { key: 'period', label: 'Month' },
      { key: 'debtBalance', label: 'Debt remaining', money: true, cls: 'col-neg' },
      { key: 'efBalance', label: 'Emergency fund', money: true, cls: 'col-end' }
    ],
    init() {
      this.$nextTick(() => {
        chart = new Chart(this.$refs.cv, {
          type: 'line',
          data: {
            labels: [],
            datasets: [
              { label: 'Total debt remaining', data: [], borderColor: C.rose, backgroundColor: C.roseFill, fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 },
              { label: 'Emergency fund balance', data: [], borderColor: C.emerald, backgroundColor: C.emeraldFill, fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2 }
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
      const STARTER_EF = 1000;
      let debts = [
        { name: 'Credit card', bal: Math.max(this.ccBalance || 0, 0), apr: this.ccApr || 0, min: Math.max(this.ccMinPay || 0, 0) },
        { name: '401(k) loan', bal: Math.max(this.k401Balance || 0, 0), apr: this.k401Apr || 0, min: Math.max(this.k401MinPay || 0, 0) },
        { name: 'Car loan', bal: Math.max(this.carBalance || 0, 0), apr: this.carApr || 0, min: Math.max(this.carMinPay || 0, 0) }
      ].filter(d => d.bal > 0);
      const payoffOrder = [...debts].sort((a, b) => a.bal - b.bal).map(d => d.name);

      const baseMinTotal = debts.reduce((s, d) => s + d.min, 0);
      const disposable = Math.max((this.income || 0) - (this.expenses || 0) - baseMinTotal, 0);
      const feasible = (this.income || 0) - (this.expenses || 0) - baseMinTotal >= 0 || debts.length === 0;

      let ef = Math.max(this.efCurrent || 0, 0);
      let gift = Math.max(this.giftAmount || 0, 0);
      // apply the one-time gift to the starter emergency fund first, then to debt
      let giftToEf = Math.min(gift, Math.max(STARTER_EF - ef, 0));
      ef += giftToEf;
      let giftToDebt = gift - giftToEf;

      let totalInterest = 0;
      let monthsToDebtFree = 0;
      let monthsToEfGoal = (ef >= (this.efGoal || 0)) ? 0 : null;
      const labels = ['0']; const debtSeries = []; const efSeries = [ef];
      let debtTotal0 = debts.reduce((s, d) => s + d.bal, 0);
      debtSeries.push(debtTotal0);

      debts = debts.map(d => ({ ...d }));
      // apply any leftover gift straight onto the smallest-balance debt
      if (giftToDebt > 0) {
        debts.sort((a, b) => a.bal - b.bal);
        for (const d of debts) { if (giftToDebt <= 0) break; const pay = Math.min(giftToDebt, d.bal); d.bal -= pay; giftToDebt -= pay; }
      }

      let m = 0;
      const maxMonths = 600;
      while (m < maxMonths && (debts.some(d => d.bal > 0.005) || (ef < (this.efGoal || 0)))) {
        m++;
        debts.sort((a, b) => a.bal - b.bal);

        // accrue interest, then pay the minimum on every open debt
        for (const d of debts) {
          if (d.bal <= 0.005) continue;
          const charge = d.bal * (d.apr / 100 / 12);
          totalInterest += charge;
          d.bal += charge;
          d.bal = Math.max(d.bal - Math.min(d.min, d.bal), 0);
        }

        // cascade the disposable pool through debts smallest-balance-first,
        // rolling any leftover (because a debt cleared mid-month) to the next one
        let pool = disposable;
        for (const d of debts) {
          if (pool <= 0) break;
          if (d.bal <= 0.005) continue;
          const pay = Math.min(pool, d.bal);
          d.bal -= pay;
          pool -= pay;
        }

        const stillOwed = debts.reduce((s, d) => s + d.bal, 0);
        if (stillOwed <= 0.005 && monthsToDebtFree === 0) monthsToDebtFree = m;

        // once every debt is clear, every dollar that used to service debt goes to the EF
        if (stillOwed <= 0.005) {
          ef += baseMinTotal + disposable;
          if (monthsToEfGoal === null && ef >= (this.efGoal || 0)) monthsToEfGoal = m;
        }

        labels.push(String(m));
        debtSeries.push(stillOwed);
        efSeries.push(ef);
      }

      const rows = labels.map((l, idx) => ({ period: `Month ${l}`, debtBalance: debtSeries[idx], efBalance: efSeries[idx] })).slice(1);

      this.rows = rows;
      this.out = {
        feasible, disposable, payoffOrder, totalInterest,
        monthsToDebtFree: monthsToDebtFree || m, monthsToEfGoal: monthsToEfGoal === null ? m : monthsToEfGoal,
        giftToEf, starterEfMet: ef >= STARTER_EF
      };

      if (!chart) return;
      chart.data.labels = labels;
      chart.data.datasets[0].data = debtSeries;
      chart.data.datasets[1].data = efSeries;
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
