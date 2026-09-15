import { stableId } from "../ids";

export const CLIENTS = [
  {
    id: stableId("client", "vedanta"),
    name: "Vedanta",
    industry: "Metals & mining",
    hqCountry: "India",
    countriesCount: 4,
    headcount: 65000,
    currentHrms: "SAP SuccessFactors + legacy payroll",
    groupStructure: {
      entities: ["Multiple group companies and business units", "Unionised workmen at plant locations"],
      note: "Group-wide HR transformation; harmonisation of core structures across entities.",
    },
    notes: "Large multi-entity group; compensation and payroll harmonisation are central themes.",
  },
  {
    id: stableId("client", "apex-manufacturing"),
    name: "Apex Manufacturing (demo)",
    industry: "Industrial manufacturing",
    hqCountry: "India",
    countriesCount: 2,
    headcount: 8200,
    currentHrms: "Homegrown + spreadsheets",
    groupStructure: {
      entities: ["Apex Industries Ltd", "Apex Components Pvt Ltd"],
      note: "Demerger of the components business planned for next financial year.",
    },
    notes: "Seeded demo client used to show the workspace before a real RFP is uploaded.",
  },
] as const;
