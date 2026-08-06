// Fixed list of business categories a store owner can pick for their store.
// Used on registration, profile settings, and the /search + /cluster filters.
// Keep this list flat and short — if it grows past ~25 items, switch to a
// grouped/searchable select instead of a plain dropdown.
const BUSINESS_CATEGORIES = [
  'Electricals',
  'Electronics',
  'Phones & Accessories',
  'Computers & IT',
  'Building Materials',
  'Stationery',
  'Books & Media',
  'Fashion & Apparel',
  'Food & Groceries',
  'Furniture & Home Decor',
  'Kitchen & Household',
  'Health & Beauty',
  'Automotive Parts',
  'Industrial Equipment',
  'Agriculture & Farm Supplies',
  'Jewelry & Accessories',
  'Sports & Outdoor',
  'Toys & Kids',
  'Other'
];

module.exports = { BUSINESS_CATEGORIES };
