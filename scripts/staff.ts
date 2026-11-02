// Seed staff roster (PRD §8: 1 owner + 3 mechanics). Passwords are never here:
// they come from the env vars named below (see scripts/generate-credentials.ts).
export interface SeedStaff {
  envKey: string;
  email: string;
  fullName: string;
  role: "owner" | "mechanic";
}

export const SEED_STAFF: readonly SeedStaff[] = [
  { envKey: "SEED_OWNER_PASSWORD", email: "owner@garagedesk.test", fullName: "Ramon Dela Cruz", role: "owner" },
  { envKey: "SEED_MECHANIC_1_PASSWORD", email: "jun@garagedesk.test", fullName: "Jun Reyes", role: "mechanic" },
  { envKey: "SEED_MECHANIC_2_PASSWORD", email: "paolo@garagedesk.test", fullName: "Paolo Mendoza", role: "mechanic" },
  { envKey: "SEED_MECHANIC_3_PASSWORD", email: "arnel@garagedesk.test", fullName: "Arnel Bautista", role: "mechanic" },
];
