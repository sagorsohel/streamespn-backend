const bcrypt = require('bcryptjs');
const { eq } = require('drizzle-orm');
const { db, pool, ensureDatabaseExists } = require('./index');
const { users } = require('./schema');

const seedAdmin = async () => {
  try {
    console.log('🌱 Starting admin user seed process...');

    // 1. Ensure database exists
    await ensureDatabaseExists();

    // 2. Ensure users table exists in MySQL database
    const connection = await pool.getConnection();
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(255) NOT NULL,
        \`email\` VARCHAR(255) NOT NULL UNIQUE,
        \`password\` VARCHAR(255) NOT NULL,
        \`role\` ENUM('user', 'admin') NOT NULL DEFAULT 'user',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    connection.release();
    console.log('✅ Database & Users table verified.');

    // Admin Credentials requested by user
    const adminEmail = 'admin@gmail.com';
    const rawPassword = 'sohoj@sohoj';
    const adminName = 'System Admin';

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // Check if admin user already exists
    const existingUsers = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

    if (existingUsers.length > 0) {
      // Update existing admin password and role
      await db
        .update(users)
        .set({
          password: hashedPassword,
          role: 'admin',
        })
        .where(eq(users.email, adminEmail));

      console.log(`✅ Admin user "${adminEmail}" already exists. Credentials updated successfully!`);
    } else {
      // Insert new admin user
      await db.insert(users).values({
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
      });

      console.log(`🎉 Admin user created successfully!`);
    }

    console.log(`
---------------------------------------
👤 Email:    ${adminEmail}
🔑 Password: ${rawPassword}
🛡️ Role:     admin
---------------------------------------
    `);

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
};

seedAdmin();
