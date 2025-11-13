-- DIAGNOSTICS: Copy/paste individual statements into Supabase SQL Editor

-- 1) Exact existence for a reg number (replace value)
SELECT reg_number, full_name, level, department
FROM students
WHERE reg_number = '2024/274872';

-- 2) Find near matches (helps detect hidden spaces/characters)
SELECT reg_number, length(reg_number) AS len
FROM students
WHERE reg_number ILIKE '%274872%';

-- 3) Inspect last character code to detect trailing whitespace
SELECT reg_number,
       length(reg_number) AS len,
       ascii(right(reg_number, 1)) AS last_char_code
FROM students
WHERE reg_number LIKE '2024/%'
ORDER BY reg_number
LIMIT 20;

-- 4) Check level type/value for a sample row
SELECT reg_number, level, pg_typeof(level) AS level_type
FROM students
WHERE reg_number = '2024/274872';

-- 5) Count by level using flexible comparison
-- Works whether level is stored as int 200, text '200', or '200L'
-- Normalize everything to text first, strip non-digits, then compare
SELECT
  COUNT(*) FILTER (
    WHERE regexp_replace(level::text, '[^0-9]', '', 'g') = '200'
  ) AS lvl_200_total,
  COUNT(*) FILTER (WHERE reg_number LIKE '2024/%') AS with_matric,
  COUNT(*) FILTER (WHERE reg_number NOT LIKE '2024/%') AS without_matric
FROM students
WHERE department = 'Electronics & Computer Engineering';

-- 6) Upsert a missing row safely (edit values then run)
INSERT INTO students (reg_number, full_name, level, department, password_hash, force_password_change, is_active)
VALUES ('2024/274872', 'ALOM OBUMNEME WISDOM', 200, 'Electronics & Computer Engineering', crypt('2024/274872', gen_salt('bf', 10)), true, true)
ON CONFLICT (reg_number) DO UPDATE
SET full_name = EXCLUDED.full_name,
    level = EXCLUDED.level,
    department = EXCLUDED.department,
    force_password_change = EXCLUDED.force_password_change,
    is_active = EXCLUDED.is_active;

-- 7) Check if student is active and password hash is correct
SELECT 
  reg_number, 
  full_name,
  is_active,
  force_password_change,
  password_hash IS NOT NULL AS has_password,
  length(password_hash) AS hash_length,
  -- Test if password matches (for a matric student using reg_number as password)
  (password_hash = crypt(reg_number, password_hash)) AS matric_pass_works,
  -- Test if password matches (for temp student using TEMP2024)
  (password_hash = crypt('TEMP2024', password_hash)) AS temp_pass_works
FROM students
WHERE reg_number = '2024/274804'; -- Change this to the reg number you're testing

-- 8) Activate a suspended account
UPDATE students
SET is_active = true
WHERE reg_number = '2024/274804'; -- Change this to the reg number you're testing
