import 'dotenv/config';
import { db, migrate } from './client';
import { hashPassword } from '../lib/auth';

migrate();

const RESTAURANTS = [
  {
    id: 'res_dhaba',
    name: 'Sharma Da Dhaba',
    description: 'Punjabi comfort food — the kind that shows up in your dreams before an exam.',
    cuisine: 'Punjabi · North Indian',
    minimumOrder: 150,
    sharedDeliveryMinimum: 80,
    status: 'open',
    etaMinutes: 25,
    rating: 4.6,
  },
  {
    id: 'res_momo',
    name: 'Spice Route Momos',
    description: 'Steamed, fried, or drowning in schezwan — momos for every mood.',
    cuisine: 'Tibetan · Chinese',
    minimumOrder: 120,
    sharedDeliveryMinimum: 60,
    status: 'open',
    etaMinutes: 18,
    rating: 4.4,
  },
  {
    id: 'res_rolls',
    name: 'Rolls & Bowls',
    description: 'Kathi rolls big enough to justify skipping the mess queue.',
    cuisine: 'Rolls · Wraps',
    minimumOrder: 100,
    sharedDeliveryMinimum: 60,
    status: 'open',
    etaMinutes: 15,
    rating: 4.3,
  },
  {
    id: 'res_brew',
    name: 'Campus Brew Café',
    description: 'Filter coffee, cold brews, and the sandwiches that get you through 8 AM labs.',
    cuisine: 'Café · Snacks',
    minimumOrder: 150,
    sharedDeliveryMinimum: 90,
    status: 'busy',
    etaMinutes: 20,
    rating: 4.5,
  },
  {
    id: 'res_tiffin',
    name: 'Southern Tiffin Co.',
    description: 'Dosas, idlis, and filter kaapi — a proper tiffin, no compromises.',
    cuisine: 'South Indian',
    minimumOrder: 130,
    sharedDeliveryMinimum: 70,
    status: 'open',
    etaMinutes: 22,
    rating: 4.7,
  },
  {
    id: 'res_pizza',
    name: 'Firangi Pizza Point',
    description: 'Wood-fired-ish pizza for group study sessions that became group orders.',
    cuisine: 'Pizza · Italian',
    minimumOrder: 199,
    sharedDeliveryMinimum: 100,
    status: 'open',
    etaMinutes: 28,
    rating: 4.2,
  },
] as const;

const MENU_CATEGORIES = [
  { id: 'cat_dhaba_mains', restaurantId: 'res_dhaba', name: 'Mains' },
  { id: 'cat_dhaba_breads', restaurantId: 'res_dhaba', name: 'Breads' },
  { id: 'cat_dhaba_drinks', restaurantId: 'res_dhaba', name: 'Drinks' },
  { id: 'cat_momo_steamed', restaurantId: 'res_momo', name: 'Steamed' },
  { id: 'cat_momo_fried', restaurantId: 'res_momo', name: 'Fried & Gravy' },
  { id: 'cat_rolls_veg', restaurantId: 'res_rolls', name: 'Veg Rolls' },
  { id: 'cat_rolls_nonveg', restaurantId: 'res_rolls', name: 'Non-Veg Rolls' },
  { id: 'cat_brew_coffee', restaurantId: 'res_brew', name: 'Coffee' },
  { id: 'cat_brew_snacks', restaurantId: 'res_brew', name: 'Snacks' },
  { id: 'cat_tiffin_breakfast', restaurantId: 'res_tiffin', name: 'Tiffin' },
  { id: 'cat_tiffin_drinks', restaurantId: 'res_tiffin', name: 'Filter Kaapi' },
  { id: 'cat_pizza_classic', restaurantId: 'res_pizza', name: 'Classic' },
  { id: 'cat_pizza_loaded', restaurantId: 'res_pizza', name: 'Loaded' },
];

const MENU_ITEMS = [
  { id: 'itm_dal_makhani', restaurantId: 'res_dhaba', categoryId: 'cat_dhaba_mains', name: 'Dal Makhani', description: 'Slow-cooked black lentils, finished with cream.', price: 160 },
  { id: 'itm_paneer_tikka', restaurantId: 'res_dhaba', categoryId: 'cat_dhaba_mains', name: 'Paneer Tikka Masala', description: 'Char-grilled paneer in a smoky tomato gravy.', price: 190 },
  { id: 'itm_rajma_chawal', restaurantId: 'res_dhaba', categoryId: 'cat_dhaba_mains', name: 'Rajma Chawal', description: 'Kidney bean curry with steamed rice.', price: 130 },
  { id: 'itm_butter_naan', restaurantId: 'res_dhaba', categoryId: 'cat_dhaba_breads', name: 'Butter Naan', description: 'Tandoor-fresh, brushed with ghee.', price: 45 },
  { id: 'itm_lassi', restaurantId: 'res_dhaba', categoryId: 'cat_dhaba_drinks', name: 'Sweet Lassi', description: 'Thick, chilled, and non-negotiable.', price: 70 },
  { id: 'itm_veg_momo', restaurantId: 'res_momo', categoryId: 'cat_momo_steamed', name: 'Veg Steamed Momos (8 pc)', description: 'Cabbage, carrot, and spring onion filling.', price: 90 },
  { id: 'itm_chicken_momo', restaurantId: 'res_momo', categoryId: 'cat_momo_steamed', name: 'Chicken Steamed Momos (8 pc)', description: 'Hand-minced chicken, lightly spiced.', price: 120 },
  { id: 'itm_fried_momo', restaurantId: 'res_momo', categoryId: 'cat_momo_fried', name: 'Fried Momos (8 pc)', description: 'Crisp shells, served with three chutneys.', price: 110 },
  { id: 'itm_gravy_momo', restaurantId: 'res_momo', categoryId: 'cat_momo_fried', name: 'Gravy Momos', description: 'Momos swimming in schezwan gravy.', price: 130 },
  { id: 'itm_paneer_roll', restaurantId: 'res_rolls', categoryId: 'cat_rolls_veg', name: 'Paneer Kathi Roll', description: 'Grilled paneer, onions, mint chutney.', price: 90 },
  { id: 'itm_egg_roll', restaurantId: 'res_rolls', categoryId: 'cat_rolls_nonveg', name: 'Egg Roll', description: 'Double egg, classic masala.', price: 70 },
  { id: 'itm_chicken_roll', restaurantId: 'res_rolls', categoryId: 'cat_rolls_nonveg', name: 'Chicken Seekh Roll', description: 'Char-grilled seekh kebab, rolled tight.', price: 110 },
  { id: 'itm_cold_coffee', restaurantId: 'res_brew', categoryId: 'cat_brew_coffee', name: 'Iced Cold Coffee', description: 'House blend, condensed milk, ice.', price: 90 },
  { id: 'itm_filter_coffee_brew', restaurantId: 'res_brew', categoryId: 'cat_brew_coffee', name: 'South Indian Filter Coffee', description: 'Strong, frothy, served in a davara.', price: 60 },
  { id: 'itm_club_sandwich', restaurantId: 'res_brew', categoryId: 'cat_brew_snacks', name: 'Club Sandwich', description: 'Triple-decker, grilled, loaded.', price: 140 },
  { id: 'itm_maggi', restaurantId: 'res_brew', categoryId: 'cat_brew_snacks', name: 'Masala Maggi', description: 'The unofficial fuel of every hostel.', price: 60 },
  { id: 'itm_masala_dosa', restaurantId: 'res_tiffin', categoryId: 'cat_tiffin_breakfast', name: 'Masala Dosa', description: 'Crisp dosa, spiced potato filling, two chutneys.', price: 110 },
  { id: 'itm_idli_sambar', restaurantId: 'res_tiffin', categoryId: 'cat_tiffin_breakfast', name: 'Idli Sambar (4 pc)', description: 'Soft idlis, sambar, coconut chutney.', price: 80 },
  { id: 'itm_filter_kaapi', restaurantId: 'res_tiffin', categoryId: 'cat_tiffin_drinks', name: 'Filter Kaapi', description: 'The real thing.', price: 40 },
  { id: 'itm_margherita', restaurantId: 'res_pizza', categoryId: 'cat_pizza_classic', name: 'Margherita (9")', description: 'Tomato, mozzarella, basil.', price: 199 },
  { id: 'itm_paneer_tikka_pizza', restaurantId: 'res_pizza', categoryId: 'cat_pizza_loaded', name: 'Paneer Tikka Pizza (9")', description: 'Tandoori paneer, onions, capsicum.', price: 259 },
  { id: 'itm_garlic_bread', restaurantId: 'res_pizza', categoryId: 'cat_pizza_classic', name: 'Cheese Garlic Bread', description: 'Six pieces, extra cheese pull.', price: 129 },
];

const insertRestaurant = db.prepare(`
  INSERT OR REPLACE INTO restaurants (id, name, description, cuisine, minimum_order, shared_delivery_minimum, status, eta_minutes, rating)
  VALUES (@id, @name, @description, @cuisine, @minimumOrder, @sharedDeliveryMinimum, @status, @etaMinutes, @rating)
`);
const insertCategory = db.prepare(`
  INSERT OR REPLACE INTO menu_categories (id, restaurant_id, name) VALUES (@id, @restaurantId, @name)
`);
const insertMenuItem = db.prepare(`
  INSERT OR REPLACE INTO menu_items (id, restaurant_id, category_id, name, description, price, available)
  VALUES (@id, @restaurantId, @categoryId, @name, @description, @price, 1)
`);

const seedTx = db.transaction(() => {
  for (const r of RESTAURANTS) insertRestaurant.run(r);
  for (const c of MENU_CATEGORIES) insertCategory.run(c);
  for (const m of MENU_ITEMS) insertMenuItem.run(m);
});
seedTx();

// --- Demo accounts -----------------------------------------------------
// Two students in the same hostel (A Hostel) so a Shared Delivery match can be
// tested for real between two logged-in sessions, plus one in a different
// hostel (B Hostel) to confirm matches never cross hostels (BR-017/BR-022).

interface DemoStudent {
  id: string;
  fullName: string;
  rollNumber: string;
  email: string;
  password: string;
  hostel: string;
  roomNumber: string;
}

const DEMO_STUDENTS: DemoStudent[] = [
  { id: 'stu_asha', fullName: 'Asha Mehta', rollNumber: '102203045', email: 'asha@thapar.edu', password: 'password123', hostel: 'A Hostel', roomNumber: 'A-214' },
  { id: 'stu_rohan', fullName: 'Rohan Verma', rollNumber: '102203071', email: 'rohan@thapar.edu', password: 'password123', hostel: 'A Hostel', roomNumber: 'A-108' },
  { id: 'stu_priya', fullName: 'Priya Nair', rollNumber: '102203099', email: 'priya@thapar.edu', password: 'password123', hostel: 'B Hostel', roomNumber: 'B-302' },
];

const insertStudent = db.prepare(`
  INSERT OR REPLACE INTO students (id, full_name, roll_number, email, phone, password_hash, hostel, room_number, reliability_score)
  VALUES (@id, @fullName, @rollNumber, @email, @phone, @passwordHash, @hostel, @roomNumber, 96)
`);

for (const s of DEMO_STUDENTS) {
  insertStudent.run({
    id: s.id,
    fullName: s.fullName,
    rollNumber: s.rollNumber,
    email: s.email,
    phone: '+91 98xxxxxx21',
    passwordHash: hashPassword(s.password),
    hostel: s.hostel,
    roomNumber: s.roomNumber,
  });
}

const insertOwner = db.prepare(`
  INSERT OR REPLACE INTO restaurant_owners (id, full_name, email, password_hash, restaurant_id)
  VALUES (@id, @fullName, @email, @passwordHash, @restaurantId)
`);
insertOwner.run({
  id: 'owner_dhaba',
  fullName: 'Balvinder Sharma',
  email: 'owner@sharmadadhaba.com',
  passwordHash: hashPassword('password123'),
  restaurantId: 'res_dhaba',
});
insertOwner.run({
  id: 'owner_momo',
  fullName: 'Tenzin Dolma',
  email: 'owner@spiceroutemomos.com',
  passwordHash: hashPassword('password123'),
  restaurantId: 'res_momo',
});

// --- Super Admin -------------------------------------------------------
// Thapar Bites ships with exactly one administrator: the platform Super
// Admin. No generic or demo admin accounts exist, and every further admin
// is created from the Admin Dashboard by this account.

// Credentials come from the environment. SUPER_ADMIN_* is the preferred
// naming; the legacy CAMPUS_BITES_SUPER_ADMIN_* names still work so existing
// deployments keep seeding without changes. Nothing is hardcoded except the
// default email address.
const DEFAULT_SUPER_ADMIN_EMAIL = 'adityakumarkaushal07@gmail.com';

const superAdminEmail =
  process.env.SUPER_ADMIN_EMAIL?.trim() ||
  process.env.CAMPUS_BITES_SUPER_ADMIN_EMAIL?.trim() ||
  DEFAULT_SUPER_ADMIN_EMAIL;

const superAdminPassword =
  process.env.SUPER_ADMIN_PASSWORD?.trim() ||
  process.env.CAMPUS_BITES_SUPER_ADMIN_PASSWORD?.trim();

if (!superAdminPassword || superAdminPassword.length < 12) {
  throw new Error(
    'SUPER_ADMIN_PASSWORD (or legacy CAMPUS_BITES_SUPER_ADMIN_PASSWORD) must be set to a password of at least 12 characters before seeding.',
  );
}

const SUPER_ADMIN = {
  id: 'admin_super',
  fullName: 'Aditya Kumar',
  email: superAdminEmail,
  phone: null as string | null,
  password: superAdminPassword,
};

const seedSuperAdmin = db.transaction(() => {
  // Any previously seeded admin (including older demo accounts) is removed so
  // the Super Admin is the only administrator on the platform.
  db.prepare('DELETE FROM admins WHERE id != ?').run(SUPER_ADMIN.id);
  db.prepare(
    `INSERT OR REPLACE INTO admins (id, full_name, email, phone, password_hash, role, status)
     VALUES (@id, @fullName, @email, @phone, @passwordHash, 'super_admin', 'active')`,
  ).run({
    id: SUPER_ADMIN.id,
    fullName: SUPER_ADMIN.fullName,
    email: SUPER_ADMIN.email,
    phone: SUPER_ADMIN.phone,
    passwordHash: hashPassword(SUPER_ADMIN.password),
  });
});
seedSuperAdmin();

console.log('Seed complete.');
console.log('');
console.log('Restaurants, menus, and student/restaurant test accounts are ready.');
console.log('One Super Admin account exists. Sign in with the credentials issued to you.');
