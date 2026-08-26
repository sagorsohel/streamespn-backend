const { mysqlTable, serial, varchar, text, integer, boolean, timestamp, mysqlEnum } = require('drizzle-orm/mysql-core');

const users = mysqlTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  role: mysqlEnum('role', ['user', 'admin']).default('user').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

const sportsCategories = mysqlTable('sports_categories', {
  id: serial('id').primaryKey(),
  sportName: varchar('sport_name', { length: 255 }).notNull(),
  sportFormat: varchar('sport_format', { length: 100 }).default('Team'),
  thumbUrl: text('thumb_url'),
  iconUrl: text('icon_url'),
  description: text('description'),
  playerImage: text('player_image'),
  bgImage: text('bg_image'),
  referralLink: text('referral_link'),
  displayOrder: integer('display_order').default(0).notNull(),
  isCustomized: boolean('is_customized').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

module.exports = {
  users,
  sportsCategories,
};
