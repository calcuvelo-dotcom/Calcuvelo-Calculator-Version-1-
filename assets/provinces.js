/* ==========================================================================
   Calcuvelo — Canadian tax & benefit data (ONE place to update each year)
   --------------------------------------------------------------------------
   Every dated number the Canadian calculators use lives in this file.
   Each January: change `year`, then update the numbers below from the sources
   listed beside them. Nothing else in the site needs editing for a new year
   (page text that quotes figures is generated from the worked examples, so
   re-run those after changing numbers).

   To add a province: copy the `ON` block inside `provinces`, change the code,
   name and numbers. The province dropdown on pages that have one builds itself
   from this object.

   Figures below are for the 2026 tax year.
   ========================================================================== */
window.CV_TAX = {
  year: 2026,

  /* Federal — CRA "Tax rates and income brackets (2026)" and "Indexation adjustment" pages */
  federal: {
    brackets: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [Infinity, 0.33]],
    creditRate: 0.14,               // lowest federal rate, used for non-refundable credits — CONFIRMED (owner-verified, Oct 2026)
    bpaMax: 16452,                  // basic personal amount (net income up to the 29% bracket start)
    bpaMin: 14829,                  // basic personal amount (net income at/above the 33% bracket start)
    bpaPhaseStart: 181440,
    bpaPhaseEnd: 258482,
    canadaEmploymentAmount: 1501
  },

  /* CPP / CPP2 — CRA T4032-ON (January 2026) payroll tables */
  cpp: {
    rate: 0.0595,                   // employee rate, base 4.95% + first additional 1.00%
    baseRate: 0.0495,
    ympe: 74600,                    // year's maximum pensionable earnings
    yampe: 85000,                   // year's additional maximum pensionable earnings
    exemption: 3500,
    cpp2Rate: 0.04
  },

  /* EI (outside Quebec) — CRA T4032-ON / ESDC 2026 premium notice */
  ei: { rate: 0.0163, maxInsurable: 68900 },

  /* Registered accounts — CRA 2026 limits */
  registered: {
    rrspPct: 0.18,
    rrspDollarLimit: 33810,         // CONFIRMED (owner-verified, Oct 2026); personal room is on CRA My Account / Notice of Assessment
    tfsaAnnual: 7000
  },

  /* CPP retirement pension — Service Canada */
  cppBenefit: {
    maxAt65: 1507.65,               // maximum monthly amount, January 2026 — CONFIRMED (Canada.ca)
    earlyPerMonth: 0.006,           // reduction for each month before 65 (max 60 months = 36%) — CONFIRMED standard rule
    latePerMonth: 0.007,            // increase for each month after 65 (max 60 months = 42%) — CONFIRMED standard rule
    maxMonthsEitherWay: 60
  },

  /* Student loans — Ontario.ca "Pay back OSAP", Canada.ca RAP page, Canada Student Financial Assistance Regulations */
  osap: {
    graceMonths: 6,
    standardYears: 9.5,             // standard repayment schedule
    maxYears: 14.5,                 // longest standard repayment schedule
    federalInterestRate: 0,         // no interest on the federal portion since April 1, 2023
    ontarioRateOverPrime: 0.01,     // Ontario portion: prime + 1%
    primeRate: 0.0445,              // CONFIRMED (owner-verified): prime 4.45% as of 2026-10-23 (Bank of Canada policy rate 2.25%)
    primeAsOf: 'October 23, 2026',  // -> Ontario OSAP interest = 5.45%. Update both when prime changes.
    /* Announced 2026/27 funding change (check ontario.ca/page/osap): provincial grants capped at 25% of assessed aid for new
       borrowers, so at least 75% is loans; private career college students get no OSAP grants (100% loans). */
    grantCapNewBorrowers: 0.25,
    announcedNote: 'Announced February 2026, for programs starting on or after August 1, 2026',
    /* ILLUSTRATIVE ONLY — not an official figure. The real federal/Ontario split is shown on your OSAP assessment. */
    illustrativeOntarioShareOfLoan: 0.40,
    rapMaxMonthsSinceSchool: 180,   // debt eliminated within 15 years of leaving school
    rapFederalCapOfIncome: 0.10,    // regulation s.19(2): payment never more than 10% of family income
    rapOntarioCapOfIncome: 0.20,    // Ontario.ca states "never more than 20%" for the provincial portion
    rapInterestReliefMonths: 60,
    /* monthly gross family income below which payments may be $0, by family size (1..5+ / 1..7+) */
    rapFederalZeroThreshold: [3866, 4535, 5556, 6412, 7170, 7854, 8483],
    rapOntarioZeroThreshold: [2083, 3254, 4205, 4959, 5652]
  },

  /* Provinces — each needs: name, brackets, creditRate, bpa, and optional surtax / healthPremium / taxReduction */
  provinces: {
    ON: {
      name: 'Ontario',
      /* CRA 2026 rates page + T4032-ON */
      brackets: [[53891, 0.0505], [107785, 0.0915], [150000, 0.1116], [220000, 0.1216], [Infinity, 0.1316]],
      creditRate: 0.0505,
      bpa: 12989,
      surtax: [[5818, 0.20], [7446, 0.36]],      // applied to Ontario tax after credits
      taxReduction: 300,                          // basic reduction amount (low-income Ontario tax reduction)
      /* Ontario Health Premium by taxable income: [from, to, base amount, rate on income over `from`, cap] */
      healthPremium: [
        [20000, 36000, 0, 0.06, 300],
        [36000, 48000, 300, 0.06, 450],
        [48000, 72000, 450, 0.25, 600],
        [72000, 200000, 600, 0.25, 750],
        [200000, Infinity, 750, 0.25, 900]
      ]
    }
  }
};
