export interface CompanyPositionData {
  title: string;
  field: string;
  repMultiplier: number;
  reqdHacking?: number;
  reqdCharisma?: number;
  reqdStrength?: number;
  reqdDefense?: number;
  reqdDexterity?: number;
  reqdAgility?: number;
  reqdReputation?: number;
}

// Software track: Intern → Junior → Senior → Lead → Head of Software → Head of Engineering → VP of Technology → CTO
// IT track:       Intern → Analyst → Manager → SysAdmin → (merges into Head of Engineering from Software track)
// Business track: Intern → Analyst → Manager → Ops Manager → CFO → CEO
//
// Data sourced from bitburner-src/src/Company/data/CompanyPositionsMetadata.ts
// and bitburner-src/src/Work/Enums.ts

export const SOFTWARE_POSITIONS: CompanyPositionData[] = [
  { title: 'Software Engineering Intern', field: 'Software', repMultiplier: 0.9, reqdHacking: 1 },
  { title: 'Junior Software Engineer', field: 'Software', repMultiplier: 1.1, reqdHacking: 51, reqdReputation: 8e3 },
  {
    title: 'Senior Software Engineer',
    field: 'Software',
    repMultiplier: 1.3,
    reqdHacking: 251,
    reqdCharisma: 51,
    reqdReputation: 40e3,
  },
  {
    title: 'Lead Software Developer',
    field: 'Software',
    repMultiplier: 1.5,
    reqdHacking: 401,
    reqdCharisma: 151,
    reqdReputation: 200e3,
  },
  {
    title: 'Head of Software',
    field: 'Software',
    repMultiplier: 1.6,
    reqdHacking: 501,
    reqdCharisma: 251,
    reqdReputation: 400e3,
  },
  {
    title: 'Head of Engineering',
    field: 'Software',
    repMultiplier: 1.6,
    reqdHacking: 501,
    reqdCharisma: 251,
    reqdReputation: 800e3,
  },
  {
    title: 'Vice President of Technology',
    field: 'Software',
    repMultiplier: 1.75,
    reqdHacking: 601,
    reqdCharisma: 401,
    reqdReputation: 1.6e6,
  },
  {
    title: 'Chief Technology Officer',
    field: 'Software',
    repMultiplier: 2.0,
    reqdHacking: 751,
    reqdCharisma: 501,
    reqdReputation: 3.2e6,
  },
];

export const IT_POSITIONS: CompanyPositionData[] = [
  { title: 'IT Intern', field: 'IT', repMultiplier: 0.9, reqdHacking: 1 },
  { title: 'IT Analyst', field: 'IT', repMultiplier: 1.1, reqdHacking: 26, reqdReputation: 7e3 },
  { title: 'IT Manager', field: 'IT', repMultiplier: 1.3, reqdHacking: 151, reqdCharisma: 51, reqdReputation: 35e3 },
  {
    title: 'Systems Administrator',
    field: 'IT',
    repMultiplier: 1.4,
    reqdHacking: 251,
    reqdCharisma: 76,
    reqdReputation: 175e3,
  },
  // IT3 promotes into Software's Head of Engineering (software5)
];

export const BUSINESS_POSITIONS: CompanyPositionData[] = [
  { title: 'Business Intern', field: 'Business', repMultiplier: 0.9, reqdHacking: 1, reqdCharisma: 1 },
  {
    title: 'Business Analyst',
    field: 'Business',
    repMultiplier: 1.1,
    reqdHacking: 6,
    reqdCharisma: 51,
    reqdReputation: 8e3,
  },
  {
    title: 'Business Manager',
    field: 'Business',
    repMultiplier: 1.3,
    reqdHacking: 51,
    reqdCharisma: 101,
    reqdReputation: 40e3,
  },
  {
    title: 'Operations Manager',
    field: 'Business',
    repMultiplier: 1.5,
    reqdHacking: 51,
    reqdCharisma: 226,
    reqdReputation: 200e3,
  },
  {
    title: 'Chief Financial Officer',
    field: 'Business',
    repMultiplier: 1.6,
    reqdHacking: 76,
    reqdCharisma: 501,
    reqdReputation: 800e3,
  },
  {
    title: 'Chief Executive Officer',
    field: 'Business',
    repMultiplier: 1.75,
    reqdHacking: 101,
    reqdCharisma: 751,
    reqdReputation: 3.2e6,
  },
];

export const REP_GRINDING_POSITIONS: CompanyPositionData[] = [...SOFTWARE_POSITIONS, ...IT_POSITIONS].sort(
  (a, b) => b.repMultiplier - a.repMultiplier || (a.reqdReputation ?? 0) - (b.reqdReputation ?? 0),
);
