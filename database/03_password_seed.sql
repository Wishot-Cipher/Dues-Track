-- Normalize initial passwords to match login policy
-- Run this AFTER importing students

-- 1) For students with matric numbers (format like 2024/274804): password = reg_number
UPDATE students
SET password_hash = crypt(reg_number, gen_salt('bf', 10))
WHERE reg_number LIKE '2024/%';

-- 2) For students without matric numbers: password = 'TEMP2024'
UPDATE students
SET password_hash = crypt('TEMP2024', gen_salt('bf', 10))
WHERE reg_number NOT LIKE '2024/%';

-- Optional checks
SELECT COUNT(*) FILTER (WHERE reg_number LIKE '2024/%') AS with_matric,
       COUNT(*) FILTER (WHERE reg_number NOT LIKE '2024/%') AS without_matric
FROM students;