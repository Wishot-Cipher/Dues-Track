-- FIND MISSING STUDENT: 2024/274872 (ALOM OBUMNEME WISDOM)

-- 1) Exact match search
SELECT reg_number, full_name, level, department, is_active
FROM students
WHERE reg_number = '2024/274872';

-- 2) Fuzzy search - maybe spacing or special characters
SELECT reg_number, full_name, level, department, is_active,
       length(reg_number) AS reg_len,
       ascii(substring(reg_number, 1, 1)) AS first_char_code,
       ascii(substring(reg_number, -1)) AS last_char_code
FROM students
WHERE reg_number ILIKE '%274872%';

-- 3) Search by name
SELECT reg_number, full_name, level, department, is_active
FROM students
WHERE full_name ILIKE '%ALOM%'
   OR full_name ILIKE '%OBUMNEME%'
   OR full_name ILIKE '%WISDOM%';

-- 4) Check if it was inserted then deleted (check total count)
SELECT COUNT(*) AS total_students FROM students;

-- 5) Count 200L ECE students
SELECT COUNT(*) AS ece_200_count
FROM students
WHERE department = 'Electronics & Computer Engineering'
  AND regexp_replace(level::text, '[^0-9]', '', 'g') = '200';

-- 6) List all 200L ECE students with matric numbers starting 2024/274
SELECT reg_number, full_name, level, is_active
FROM students
WHERE department = 'Electronics & Computer Engineering'
  AND reg_number LIKE '2024/274%'
  AND regexp_replace(level::text, '[^0-9]', '', 'g') = '200'
ORDER BY reg_number;

-- 7) Re-insert the student (upsert - won't duplicate if exists)
INSERT INTO students (reg_number, full_name, level, department, password_hash, force_password_change, is_active)
VALUES ('2024/274872', 'ALOM OBUMNEME WISDOM', 200, 'Electronics & Computer Engineering', crypt('2024/274872', gen_salt('bf', 10)), true, true)
ON CONFLICT (reg_number) DO UPDATE
SET full_name = EXCLUDED.full_name,
    level = EXCLUDED.level,
    department = EXCLUDED.department,
    password_hash = EXCLUDED.password_hash,
    force_password_change = EXCLUDED.force_password_change,
    is_active = EXCLUDED.is_active
RETURNING reg_number, full_name, is_active;

-- 8) Verify the student now exists and can log in
SELECT 
  reg_number,
  full_name,
  is_active,
  force_password_change,
  -- Test if login would work
  (password_hash = crypt('2024/274872', password_hash)) AS password_matches,
  password_hash IS NOT NULL AS has_password
FROM students
WHERE reg_number = '2024/274872';
