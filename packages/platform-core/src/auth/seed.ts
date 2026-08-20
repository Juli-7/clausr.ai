import { seedSuperadmin } from "./service";

const isMain = process.argv[1]?.includes("seed");
if (isMain) {
  seedSuperadmin().catch((err) => {
    console.error("Seed failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export { seedSuperadmin };
