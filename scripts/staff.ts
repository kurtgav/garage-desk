// Seed staff roster (PRD §8: 1 owner + 3 mechanics). Passwords are never here:
// they come from the env vars named below (see scripts/generate-credentials.ts).
// Emails stay stable across demo data changes (e2e and CREDENTIALS.local.md use them).
export interface SeedStaff {
  envKey: string;
  email: string;
  fullName: string;
  role: "owner" | "mechanic";
}

export const SEED_STAFF: readonly SeedStaff[] = [
  { envKey: "SEED_OWNER_PASSWORD", email: "owner@garagedesk.test", fullName: "Georgi Petrov", role: "owner" },
  { envKey: "SEED_MECHANIC_1_PASSWORD", email: "ivan@garagedesk.test", fullName: "Ivan Dimitrov", role: "mechanic" },
  { envKey: "SEED_MECHANIC_2_PASSWORD", email: "nikolay@garagedesk.test", fullName: "Nikolay Stoyanov", role: "mechanic" },
  { envKey: "SEED_MECHANIC_3_PASSWORD", email: "stefan@garagedesk.test", fullName: "Stefan Kolev", role: "mechanic" },
];
