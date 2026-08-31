// Chart and content data constants — extracted from original CIM.html

export const BENGALURU_DATA = {
  labels: ["New Pickup & Inward Requests", "Retrieval & Secure Destruction"],
  values: [600, 800]
};

export const PAN_INDIA_DATA = [
  { location: "Bhubaneswar", emails: 15, newReq: 5, followUp: 1 },
  { location: "Chennai", emails: 90, newReq: 1, followUp: 7 },
  { location: "Ahmedabad", emails: 70, newReq: 0, followUp: 2 },
  { location: "Coimbatore", emails: 20, newReq: 0, followUp: 0 },
  { location: "Ludhiana", emails: 10, newReq: 2, followUp: 10 },
  { location: "Delhi", emails: 120, newReq: 3, followUp: 10 },
  { location: "Chandigarh", emails: 25, newReq: 1.5, followUp: 9 },
  { location: "Kolkata", emails: 120, newReq: 5, followUp: 1 },
  { location: "Hyderabad", emails: 9.5, newReq: 1.5, followUp: 1.5 },
  { location: "Indore", emails: 4.5, newReq: 1, followUp: 0 },
  { location: "Mumbai", emails: 250, newReq: 3.5, followUp: 50 },
  { location: "Pune", emails: 65, newReq: 12.5, followUp: 7.5 }
];

export const ASTRA_DATA = {
  labels: ["Malaysia", "Philippines"],
  values: [90, 50],
  notes: ["90% client migration to Astra", "50% of email-based clients migrated"]
};

// Project Two data
export const INDUSTRY_DATA = [
  { label: "Banking & Financial Services", value: 12 },
  { label: "Manufacturing – Food, Beverage & Tobacco", value: 6 },
  { label: "Hospital & Health Services", value: 3 },
  { label: "Computer Hardware & Network Infra.", value: 3 },
  { label: "Manufacturing – Consumer Goods", value: 2 },
  { label: "Aerospace", value: 2 },
  { label: "Advertising & Market Research", value: 2 },
  { label: "Art, Entertainment & Mass Media", value: 2 },
  { label: "Logistics, Warehousing & Freight", value: 2 },
  { label: "Others (Heavy Industry, IT, Pharma, Education)", value: 4 }
];

export const TECH_ADOPTION_DATA = [
  { label: "ERP Adoption", value: 81.6 },
  { label: "DMS Adoption", value: 78.9 },
  { label: "CRM Adoption", value: 13.2 }
];

export const SERVICES_DATA = [
  { label: "EffiDocs Pro", value: 21 },
  { label: "FAMS", value: 20 },
  { label: "Escrow", value: 20 },
  { label: "DART", value: 18 },
  { label: "Visio", value: 17 },
  { label: "EffiDocs Plus", value: 14 },
  { label: "EffiDocs Lite", value: 2 }
];

// Chart colors
export const CHART_COLORS = {
  teal: '#194045',
  rust: '#a8432f',
  gold: '#b98a34',
  ok: '#3d6b4c',
  grid: '#e4dcc6',
  ink: '#211d16',
  inkSoft: '#57503f'
};

// CK Groups for admin editor
export const CK_GROUPS = {
  overview: 'Overview',
  phase1: 'Phase 1 · Bengaluru',
  phase2: 'Phase 2 · Pan-India',
  astra: 'Astra & Findings',
  incentive: 'Incentive Plan',
  roadmap: 'Automation Roadmap',
  report: 'Download Report',
  footer: 'Footer',
  p2: 'Project Two · Entire Visitor Interface',
  overviewUI: 'Project Selector · Visitor Interface',
  gateUI: 'Entry Screen · Visitor Interface',
  loginUI: 'Visitor Login · Visitor Interface',
  feedbackUI: 'Feedback · Visitor Interface',
  dashboardUI: 'Project One · Remaining Visitor Interface'
};