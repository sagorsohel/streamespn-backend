const { mysqlTable, serial, varchar, text, int, boolean, timestamp, mysqlEnum } = require('drizzle-orm/mysql-core');

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
  displayOrder: int('display_order').default(0).notNull(),
  isCustomized: boolean('is_customized').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

const sportsSubcategories = mysqlTable('sports_subcategories', {
  id: serial('id').primaryKey(),
  categoryId: int('category_id').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  logoUrl: text('logo_url'),
  status: boolean('status').default(false).notNull(), // Default OFF (false)
  isTrending: boolean('is_trending').default(false).notNull(), // Default OFF (false)
  displayOrder: int('display_order').default(0).notNull(),
  isCustomized: boolean('is_customized').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

const matches = mysqlTable('matches', {
  id: serial('id').primaryKey(),
  sportsdbEventId: varchar('sportsdb_event_id', { length: 100 }),
  categoryId: int('category_id').notNull(),
  subcategoryId: int('subcategory_id'),
  matchType: mysqlEnum('match_type', ['team_vs_team', 'title_event']).default('team_vs_team').notNull(),
  slug: varchar('slug', { length: 255 }),
  title: varchar('title', { length: 255 }),
  homeTeam: varchar('home_team', { length: 255 }),
  homeTeamLogo: text('home_team_logo'),
  awayTeam: varchar('away_team', { length: 255 }),
  awayTeamLogo: text('away_team_logo'),
  homeScore: varchar('home_score', { length: 50 }),
  awayScore: varchar('away_score', { length: 50 }),
  matchTime: timestamp('match_time'),
  status: mysqlEnum('status', ['upcoming', 'live', 'finished']).default('upcoming').notNull(),
  venue: varchar('venue', { length: 255 }),
  playerImage: text('player_image'),
  bgImage: text('bg_image'),
  referralLink: text('referral_link'),
  displayOrder: int('display_order').default(0).notNull(),
  isCustomized: boolean('is_customized').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

const adsSettings = mysqlTable('ads_settings', {
  id: serial('id').primaryKey(),
  headAds: text('head_ads'),
  navAds: text('nav_ads'),
  modalSignupAds: text('modal_signup_ads'),
  footerAds: text('footer_ads'),
  floatMobileAds: text('float_mobile_ads'),
  floatDesktopAds: text('float_desktop_ads'),
  histatsScript: text('histats_script'),
  membershipReferralLink: text('membership_referral_link'),
  globalSignInReferralLink: text('global_sign_in_referral_link'),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow().notNull(),
});

module.exports = {
  users,
  sportsCategories,
  sportsSubcategories,
  matches,
  adsSettings,
};
