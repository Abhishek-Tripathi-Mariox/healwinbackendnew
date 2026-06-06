/**
 * Seed script to initialize default roles and create a Super Admin user
 * Run this script once to set up the initial admin user and roles
 *
 * Usage: npx ts-node src/scripts/seed-roles.ts
 */

import mongoose from "mongoose";
import * as bcrypt from "bcryptjs";
import config from "../config";
import { Role, DEFAULT_ROLES } from "../models/role.model";
import { Admin } from "../models/admin.model";

const seedRolesAndAdmin = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = config.database.url;
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Seed default roles
    console.log("\n📋 Seeding default roles...");
    const roleIds: { [key: string]: mongoose.Types.ObjectId } = {};

    // Convert DEFAULT_ROLES object to array
    const rolesArray = Object.values(DEFAULT_ROLES);

    for (const roleData of rolesArray) {
      const existingRole = await Role.findOne({ name: roleData.name });
      if (existingRole) {
        // Sync permissions so newly-added modules (HR, catalog, …) reach the
        // existing system roles instead of staying stale from first seed.
        existingRole.permissions = roleData.permissions as string[];
        existingRole.description = roleData.description;
        await existingRole.save();
        console.log(`  🔄 Synced role: ${roleData.name} (${roleData.permissions.length} perms)`);
        roleIds[roleData.name] = existingRole._id;
      } else {
        const role = await Role.create(roleData);
        console.log(`  ✅ Created role: ${roleData.name}`);
        roleIds[roleData.name] = role._id;
      }
    }

    // Check if Super Admin user exists
    console.log("\n👤 Checking for Super Admin user...");
    const superAdminRole = await Role.findOne({ name: "Super Admin" });
    if (!superAdminRole) {
      console.log("❌ Super Admin role not found!");
      process.exit(1);
    }

    const existingAdmin = await Admin.findOne({ email: "admin@healwin.com" });
    if (existingAdmin) {
      console.log("  ⏭️  Super Admin user already exists");
      console.log(`     Email: ${existingAdmin.email}`);
    } else {
      // Create Super Admin user
      const password = "Admin@123"; // Default password - should be changed after first login
      const hashedPassword = await bcrypt.hash(password, 12);

      const superAdmin = await Admin.create({
        fullName: "Super Admin",
        email: "admin@healwin.com",
        phone: "+919999999999",
        password: hashedPassword,
        roleId: superAdminRole._id,
        roleName: "Super Admin",
        permissions: superAdminRole.permissions,
        isActive: true,
        isDeleted: false,
      });

      console.log("  ✅ Created Super Admin user");
      console.log(`     Email: admin@healwin.com`);
      console.log(`     Password: ${password}`);
      console.log("     ⚠️  Please change the password after first login!");
    }

    // Summary
    console.log("\n📊 Summary:");
    console.log(`   Total Roles: ${await Role.countDocuments()}`);
    console.log(`   Total Staff: ${await Admin.countDocuments()}`);

    // List all roles
    console.log("\n📋 Available Roles:");
    const allRoles = await Role.find().select("name permissions isSystem");
    for (const role of allRoles) {
      console.log(
        `   - ${role.name} (${role.permissions.length} permissions)${role.isSystem ? " [System]" : ""}`,
      );
    }

    console.log("\n✅ Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
};

// Run the seed function
seedRolesAndAdmin();
