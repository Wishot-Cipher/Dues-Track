/**
 * CSV MINIMAL IMPORT - JUST REG NUMBER & NAME
 * 
 * CSV Format (2 columns only):
 * reg_number,full_name
 * CS/2021/001,John Doe
 * CS/2021/002,Jane Smith
 * 
 * Usage:
 * 1. Create students_minimal.csv with just reg_number and full_name
 * 2. Run: npm install bcryptjs csv-parser
 * 3. Run: node scripts/minimal_csv_import.js
 * 4. Copy generated SQL to Supabase
 */

const fs = require('fs');
const csv = require('csv-parser');
const bcrypt = require('bcryptjs');

// ============================================
// CONFIGURATION
// ============================================
const CSV_FILE = 'students_minimal.csv';
const SALT_ROUNDS = 10;
const DEFAULT_LEVEL = '200L'; // Change this to match your class
const DEFAULT_DEPARTMENT = 'Computer Science'; // Change this if needed

// ============================================
// PROCESS CSV
// ============================================
const students = [];

console.log('📂 Reading CSV file...\n');

fs.createReadStream(CSV_FILE)
    .pipe(csv())
    .on('data', (row) => {
        students.push({
            reg_number: row.reg_number.trim(),
            full_name: row.full_name.trim()
        });
    })
    .on('end', async () => {
        console.log(`✓ Found ${students.length} students in CSV\n`);
        await generateSQL();
    })
    .on('error', (error) => {
        console.error('❌ Error reading CSV:', error.message);
        console.log('\nCreate students_minimal.csv with this format:');
        console.log('reg_number,full_name');
        console.log('CS/2021/001,John Doe');
        console.log('CS/2021/002,Jane Smith');
    });

// ============================================
// GENERATE SQL WITH HASHES
// ============================================
async function generateSQL() {
    console.log('🔐 Generating password hashes...\n');
    
    const sqlStatements = [];
    let successCount = 0;
    
    for (const student of students) {
        try {
            // Password = student's reg_number
            const password = student.reg_number;
            const hash = await bcrypt.hash(password, SALT_ROUNDS);
            
            // Escape single quotes
            const fullName = student.full_name.replace(/'/g, "''");
            
            const sql = `('${student.reg_number}', '${fullName}', '${DEFAULT_LEVEL}', '${DEFAULT_DEPARTMENT}', '${hash}', true, true)`;
            
            sqlStatements.push(sql);
            successCount++;
            
            console.log(`✓ ${student.reg_number} - ${student.full_name}`);
        } catch (error) {
            console.error(`✗ Failed: ${student.reg_number} - ${error.message}`);
        }
    }
    
    // Generate final SQL
    console.log('\n' + '='.repeat(80));
    console.log('📋 GENERATED SQL:');
    console.log('='.repeat(80) + '\n');
    
    const finalSQL = `-- Minimal Import - Generated on ${new Date().toISOString()}
-- Source: ${CSV_FILE}
-- Total students: ${successCount}/${students.length}
-- Level: ${DEFAULT_LEVEL}
-- Department: ${DEFAULT_DEPARTMENT}

INSERT INTO students (
    reg_number, 
    full_name, 
    level,
    department,
    password_hash,
    force_password_change,
    is_active
) VALUES
${sqlStatements.join(',\n')}
ON CONFLICT (reg_number) DO NOTHING;

-- Verify import
SELECT 
    reg_number,
    full_name,
    level,
    department,
    email,
    phone,
    section,
    is_active
FROM students
WHERE email IS NULL OR phone IS NULL
ORDER BY reg_number;

-- Summary
SELECT 
    COUNT(*) as total_students,
    COUNT(email) as has_email,
    COUNT(phone) as has_phone,
    COUNT(section) as has_section,
    COUNT(*) - COUNT(email) as missing_email,
    COUNT(*) - COUNT(phone) as missing_phone
FROM students;
`;
    
    console.log(finalSQL);
    
    // Save to file
    fs.writeFileSync('generated_minimal_import.sql', finalSQL);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ SAVED TO: generated_minimal_import.sql');
    console.log('='.repeat(80));
    console.log(`\nSuccessfully processed: ${successCount}/${students.length} students`);
    console.log('\n🔐 LOGIN CREDENTIALS:');
    console.log('  Username: Registration number');
    console.log('  Password: Registration number (same)');
    console.log('  Example: CS/2021/001 / CS/2021/001');
    console.log('\n📝 STUDENTS WILL BE PROMPTED TO:');
    console.log('  1. Change their password (mandatory)');
    console.log('  2. Complete their profile:');
    console.log('     ✓ Add email address');
    console.log('     ✓ Add phone number');
    console.log('     ✓ Select section (A/B/C)');
    console.log('\n⚠️  NULL fields in database:');
    console.log('  - email, phone, section, profile_photo');
    console.log(`\n✓ Pre-filled fields:`);
    console.log(`  - level: ${DEFAULT_LEVEL}`);
    console.log(`  - department: ${DEFAULT_DEPARTMENT}\n`);
}
