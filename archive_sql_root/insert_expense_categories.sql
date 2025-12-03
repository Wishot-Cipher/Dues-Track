-- Insert default expense categories
-- Run this in your Supabase SQL Editor

INSERT INTO expense_categories (name, description, icon, color) VALUES
  ('Academic Materials', 'Books, supplies, and learning resources', '📚', '#3B82F6'),
  ('Events & Activities', 'Excursions, social events, celebrations', '🎉', '#8B5CF6'),
  ('Infrastructure', 'Facility improvements and upgrades', '🏢', '#10B981'),
  ('Administrative', 'Office supplies, administrative fees', '💼', '#6366F1'),
  ('Awards & Recognition', 'Prizes, certificates, trophies', '🏆', '#F59E0B'),
  ('Maintenance & Repairs', 'Facility and equipment maintenance', '🔧', '#EF4444'),
  ('Donations & Charity', 'Charitable contributions', '❤️', '#EC4899'),
  ('Technology & Equipment', 'Computers, software, tech gear', '💻', '#06B6D4'),
  ('Refreshments & Catering', 'Food and beverages for events', '☕', '#84CC16'),
  ('Miscellaneous', 'Other expenses not categorized', '📦', '#6B7280')
ON CONFLICT (name) DO NOTHING;
