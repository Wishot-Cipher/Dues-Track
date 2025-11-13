-- Simple fix: Just ensure the bucket exists and is public
-- Run this in your Supabase SQL Editor

-- Create or update the bucket to be public
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Verify it worked
SELECT id, name, public 
FROM storage.buckets 
WHERE name = 'payment-receipts';
