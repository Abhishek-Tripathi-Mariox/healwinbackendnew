/**
 * Bulk employee import, against the real handler and database.
 *
 * The cases that matter are the ones a real spreadsheet produces: day-first
 * dates, quoted addresses with commas, duplicate emails, department names that
 * don't exist, and a dry run that must write nothing at all.
 *
 * Usage: npm run e2e:employee-import
 */
import mongoose from "mongoose";
import { Types } from "mongoose";
import config from "../config";
import HrEmployee from "../models/hr-employee.model";
import Department from "../models/department.model";
import { importEmployees } from "../controllers/admin/hr-employee-import.controller";

const TAG = "E2E-IMP";
let pass = 0, fail = 0;
const failures: string[] = [];
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; failures.push(l); console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

/** Drive the controller the way the route does. */
const runImport = async (csv: string, dryRun: boolean) => {
  const req: any = {
    body: { csv, dryRun: String(dryRun) },
    adminId: new Types.ObjectId(),
  };
  await importEmployees(req, {} as any, (() => undefined) as any);
  return { data: req.rData, code: req.rCode };
};

const countTagged = () =>
  HrEmployee.countDocuments({ fullName: new RegExp(`^${TAG}`) });

const cleanup = async () => {
  await HrEmployee.deleteMany({ fullName: new RegExp(`^${TAG}`) });
  await Department.deleteMany({ name: `${TAG} Critical Care` });
};

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log(`\n🔎 ${TAG} — bulk employee import\n`);
  await cleanup();

  const dept: any = await Department.create({ name: `${TAG} Critical Care` });

  const HEAD = "Full Name,Joining Date,Email,Phone,Gender,Department,Address,Annual CTC";

  section("Dry run");
  const good =
    `${HEAD}\n` +
    `${TAG} Ravi Kumar,2026-01-15,${TAG.toLowerCase()}.ravi@x.com,9876500011,male,${TAG} Critical Care,"12, MG Road, Noida",480000\n` +
    `${TAG} Sunita Devi,15/02/2026,${TAG.toLowerCase()}.sunita@x.com,9876500012,female,${TAG} Critical Care,,520000\n`;

  const dry = await runImport(good, true);
  ok("dry run reports both rows as importable", dry.data?.wouldCreate === 2, JSON.stringify(dry.data?.errors));
  ok("dry run writes nothing", (await countTagged()) === 0);

  section("Committing the import");
  const real = await runImport(good, false);
  ok("creates both employees", real.data?.created === 2, JSON.stringify(real.data?.errors));
  ok("they exist in the database", (await countTagged()) === 2);

  const ravi: any = await HrEmployee.findOne({ fullName: `${TAG} Ravi Kumar` }).lean();
  ok("auto-assigns an employee code", !!ravi?.employeeCode?.startsWith("HWE-"), ravi?.employeeCode);
  ok("keeps the comma inside the quoted address", ravi?.address === "12, MG Road, Noida", ravi?.address);
  ok("resolves the department by name", String(ravi?.departmentId) === String(dept._id));
  ok("reads an ISO joining date", new Date(ravi?.joiningDate).getMonth() === 0 && new Date(ravi?.joiningDate).getDate() === 15);
  ok("stores the annual CTC", ravi?.salaryStructure?.ctcAnnual === 480000, String(ravi?.salaryStructure?.ctcAnnual));

  const sunita: any = await HrEmployee.findOne({ fullName: `${TAG} Sunita Devi` }).lean();
  // 15/02/2026 is day-first; read as month-first it would be an invalid date.
  ok(
    "reads a day-first date as 15 February",
    new Date(sunita?.joiningDate).getMonth() === 1 && new Date(sunita?.joiningDate).getDate() === 15,
    String(sunita?.joiningDate),
  );

  section("Rows that must be rejected");
  const bad =
    `${HEAD}\n` +
    `,2026-01-15,a@x.com,,male,,,\n` +                                  // no name
    `${TAG} No Date,,b@x.com,,male,,,\n` +                              // no joining date
    `${TAG} Bad Date,31/02/2026,c@x.com,,male,,,\n` +                   // 31 February
    `${TAG} Dup Email,2026-01-15,${TAG.toLowerCase()}.ravi@x.com,,male,,,\n` + // already exists
    `${TAG} No Dept,2026-01-15,d@x.com,,male,Nonexistent Dept,,\n` +    // unknown department
    `${TAG} Bad Gender,2026-01-15,e@x.com,,alien,,,\n` +                // bad gender
    `${TAG} Bad CTC,2026-01-15,f@x.com,,male,,,abc\n`;                  // CTC not a number

  const rejected = await runImport(bad, true);
  ok("all seven bad rows are rejected", rejected.data?.failed === 7, `failed=${rejected.data?.failed}`);
  ok("none would be created", rejected.data?.wouldCreate === 0);
  const msgs = JSON.stringify(rejected.data?.errors || []);
  ok("says which row each problem is on", /"row":2/.test(msgs) && /"row":8/.test(msgs));
  ok("explains the missing department", /does not exist/.test(msgs));
  ok("explains the duplicate email", /already exists/.test(msgs));
  ok("rejects 31 February rather than rolling it to March", /not a date/.test(msgs), msgs.slice(0, 200));

  section("Duplicates inside one file");
  const dupInFile =
    `${HEAD}\n` +
    `${TAG} A,2026-01-15,${TAG.toLowerCase()}.same@x.com,,male,,,\n` +
    `${TAG} B,2026-01-15,${TAG.toLowerCase()}.same@x.com,,male,,,\n`;
  const dupRes = await runImport(dupInFile, true);
  ok("catches an email repeated within the file", dupRes.data?.failed === 1, JSON.stringify(dupRes.data?.errors));

  section("Malformed files");
  const noRows = await runImport("Full Name,Joining Date\n", true);
  ok("a header-only file is refused", noRows.code === 0);
  const missingCol = await runImport("Col1,Col2\nRavi,2026-01-15\n", true);
  ok("a file missing required columns is refused", missingCol.code === 0);
  ok(
    "and names every missing column",
    /Full Name/.test(JSON.stringify(missingCol.data)) &&
      /Joining Date/.test(JSON.stringify(missingCol.data)),
    JSON.stringify(missingCol.data),
  );

  section("Header aliases");
  // People type the heading they think of, not the one on the template.
  const aliased =
    `Name,DOJ,Email ID,Mobile,CTC\n` +
    `${TAG} Alias Test,2026-04-01,${TAG.toLowerCase()}.alias@x.com,9876500013,600000\n`;
  const aliasRes = await runImport(aliased, false);
  ok("accepts Name / DOJ / Email ID / Mobile / CTC", aliasRes.data?.created === 1,
    JSON.stringify(aliasRes.data?.errors));
  const aliasEmp: any = await HrEmployee.findOne({ fullName: `${TAG} Alias Test` }).lean();
  ok("maps the aliased CTC to the salary structure",
    aliasEmp?.salaryStructure?.ctcAnnual === 600000, String(aliasEmp?.salaryStructure?.ctcAnnual));
  ok("maps the aliased phone", aliasEmp?.phone === "9876500013", aliasEmp?.phone);

  section("Partial import");
  const mixed =
    `${HEAD}\n` +
    `${TAG} Valid One,2026-03-01,${TAG.toLowerCase()}.v1@x.com,,male,,,\n` +
    `${TAG} Broken,notadate,${TAG.toLowerCase()}.v2@x.com,,male,,,\n`;
  const partial = await runImport(mixed, false);
  ok("writes the good row and reports the bad one", partial.data?.created === 1 && partial.data?.failed === 1,
    JSON.stringify(partial.data));
  ok("the good row is really there", !!(await HrEmployee.findOne({ fullName: `${TAG} Valid One` }).lean()));

  await cleanup();
  await mongoose.disconnect();
  console.log(`\n${"─".repeat(46)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  if (fail) failures.forEach((f) => console.log(`   • ${f}`));
  console.log(`${"─".repeat(46)}\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("\n💥 crashed:", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
