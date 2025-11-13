-- ============================================
-- CREATE STUDENTS WITH REG_NUMBER AS PASSWORD
-- ============================================
-- This script creates students in both auth.users and students table
-- Password = reg_number for each student
-- Email = reg_number@student.com
-- ============================================

-- IMPORTANT: Run this in Supabase SQL Editor
-- Make sure pgcrypto extension is enabled first
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 1: Add your students here (edit the data below)
DO $$
DECLARE
  student_record RECORD;
  new_user_id uuid;
  user_email text;
  user_password text;
  student_data JSONB := '[
    {
      "reg_number": "ECE/2024/999",
      "full_name": "Test Student",
      "phone": "+2348012345678",
      "level": 200
    }
  ]'::jsonb;
BEGIN
  RAISE NOTICE 'Starting student import...';
  RAISE NOTICE '';
  
  -- Loop through each student
  FOR student_record IN SELECT * FROM jsonb_array_elements(student_data)
  LOOP
    user_email := (student_record.value->>'reg_number') || '@student.com';
    user_password := student_record.value->>'reg_number';
    
    BEGIN
      -- Check if user already exists
      SELECT id INTO new_user_id FROM auth.users WHERE email = user_email;
      
      IF new_user_id IS NOT NULL THEN
        RAISE NOTICE '⚠️  User already exists: % (ID: %)', user_email, new_user_id;
        
        -- Update student record if exists
        UPDATE students 
        SET 
          full_name = student_record.value->>'full_name',
          reg_number = student_record.value->>'reg_number',
          phone = student_record.value->>'phone',
          level = (student_record.value->>'level')::integer
        WHERE id = new_user_id;
        
      ELSE
        -- Generate new user ID
        new_user_id := gen_random_uuid();
        
        -- Create auth user
        INSERT INTO auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          confirmation_sent_at,
          confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at,
          is_super_admin,
          phone,
          phone_confirmed_at
        )
        VALUES (
          '00000000-0000-0000-0000-000000000000',
          new_user_id,
          'authenticated',
          'authenticated',
          user_email,
          crypt(user_password, gen_salt('bf')),
          NOW(),
          NOW(),
          NOW(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object(
            'full_name', student_record.value->>'full_name',
            'reg_number', student_record.value->>'reg_number'
          ),
          NOW(),
          NOW(),
          false,
          student_record.value->>'phone',
          NULL
        );
        
        -- Create identity record
        INSERT INTO auth.identities (
          id,
          user_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        )
        VALUES (
          new_user_id,
          new_user_id,
          jsonb_build_object(
            'sub', new_user_id::text,
            'email', user_email
          ),
          'email',
          NOW(),
          NOW(),
          NOW()
        );
        
        -- Create student record
        INSERT INTO students (
          id,
          email,
          full_name,
          reg_number,
          phone,
          level,
          department,
          is_active
        )
        VALUES (
          new_user_id,
          user_email,
          student_record.value->>'full_name',
          student_record.value->>'reg_number',
          student_record.value->>'phone',
          (student_record.value->>'level')::integer,
          'Electrical and Computer Engineering',
          true
        );
        
        RAISE NOTICE '✅ Created: % | Email: % | Password: %',
          student_record.value->>'full_name',
          user_email,
          user_password;
      END IF;
        
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '❌ Failed to create %: %', 
        student_record.value->>'reg_number',
        SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Student Import Complete!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'LOGIN CREDENTIALS:';
  RAISE NOTICE '  Format: REG_NUMBER@student.com / REG_NUMBER';
  RAISE NOTICE '';
  RAISE NOTICE 'Examples:';
  RAISE NOTICE '  Email: ECE/2024/001@student.com';
  RAISE NOTICE '  Password: ECE/2024/001';
  RAISE NOTICE '========================================';
END $$;

-- Verify students were created
SELECT 
  s.reg_number,
  s.full_name,
  s.email,
  s.level,
  s.is_active,
  au.email as auth_email,
  au.email_confirmed_at IS NOT NULL as email_confirmed,
  COUNT(p.id) as payment_count
FROM students s
LEFT JOIN auth.users au ON s.id = au.id
LEFT JOIN payments p ON s.id = p.student_id
WHERE s.email LIKE '%@student.com'
GROUP BY s.id, s.reg_number, s.full_name, s.email, s.level, s.is_active, au.email, au.email_confirmed_at
ORDER BY s.reg_number;

-- Check if auth users exist
SELECT 
  id,
  email,
  email_confirmed_at IS NOT NULL as confirmed,
  created_at
FROM auth.users 
WHERE email LIKE '%@student.com'
ORDER BY email;
