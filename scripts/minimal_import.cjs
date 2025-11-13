/**
 * MINIMAL STUDENT IMPORT - JUST REG NUMBER & NAME
 * 
 * This script imports students with only reg_number and full_name
 * Other fields (email, phone, etc.) will be filled by students on first login
 * 
 * Usage:
 * 1. Update the students array below with your class list
 * 2. Run: npm install bcryptjs
 * 3. Run: node scripts/minimal_import.js
 * 4. Copy the generated SQL to Supabase
 */

const bcrypt = require('bcryptjs');

// ============================================
// YOUR CLASS LIST - ALL 125 STUDENTS
// ============================================
// Students with incomplete matric numbers use their full name as temporary reg_number
const students = [
    { reg_number: '2024/274804', full_name: 'ADEOGUN ADEBOLA JOHN' },
    { reg_number: 'AGBONARI_TOCHUKWU', full_name: 'AGBONARI TOCHUKWU CHINEMERERM' },
    { reg_number: '2024/274872', full_name: 'ALOM OBUMNEME WISDOM' },
    { reg_number: '2024/275808', full_name: 'ALUMA EMEKA GOODNESS' },
    { reg_number: 'AMAD_VALERIAN', full_name: 'AMAD VALERIAN EBUBECHUKWU' },
    { reg_number: '2024/276129', full_name: 'ANIBUEZE-CYRIL OBINNA EMMANUEL' },
    { reg_number: '2024/275815', full_name: 'ANIDIOBI CHIMAOBI DANIEL' },
    { reg_number: '2024/274545', full_name: 'CHIBUISI PRINCEWILL CHINEMEREM' },
    { reg_number: '2024/274815', full_name: 'CHIBUOKEM MICHAEL CHIEMERIE' },
    { reg_number: '2024/279345', full_name: 'CHIKAONYI CHISOMAGA CALLISTUS' },
    { reg_number: '2024/276959', full_name: 'CHIME SAMUEL CHIDUBEM' },
    { reg_number: '2024/282591', full_name: 'CHINEDU MARTIN CHIEMERIA' },
    { reg_number: '2024/275266', full_name: 'CHUBA CHIDOZIE HENRY' },
    { reg_number: '2024/275703', full_name: 'DAMIAN CHIMBUCHI TESTIMONY' },
    { reg_number: '2024/276960', full_name: 'EDEH KENNETH CHINONSO' },
    { reg_number: '2024/282497', full_name: 'EDWARD HENRY CHINEMELUM' },
    { reg_number: '2024/279601', full_name: 'EGBACHUKWU DAVID KENECHUKWU' },
    { reg_number: '2024/274412', full_name: 'EGBO GODSTIME JOSEPH' },
    { reg_number: '2024/276817', full_name: 'EGBUEH KAOBIMTOCHUKWU LUCILLE' },
    { reg_number: '2024/276914', full_name: 'EJIMMADUEKWU CHRISTABEL EZINNE' },
    { reg_number: '2024/279881', full_name: 'EKWEOGWU CHUKWUDUMEBI ANDREW' },
    { reg_number: '2024/276106', full_name: 'EMEKOWA VICTOR CHINOSO' },
    { reg_number: '2024/275012', full_name: 'EMMANUEL CHIDUBEM CHARLES' },
    { reg_number: 'ENE_SOMADINA', full_name: 'ENE SOMADINA FRANCIS' },
    { reg_number: '2024/278020', full_name: 'EPUNDU VICTOR CHUKWUKA' },
    { reg_number: '2024/281046', full_name: 'EZE CHRISTIAN KELECHUKWU' },
    { reg_number: '2024/276957', full_name: 'EZE CHUKWUMA HALLEL' },
    { reg_number: 'EZE_DAVID', full_name: 'EZE DAVID UCHENNA' },
    { reg_number: '2024/275331', full_name: 'EZE FRANKLYN CHINONSO' },
    { reg_number: '2024/274555', full_name: 'EZE HONOUR EBERECHUKWU' },
    { reg_number: '2024/274828', full_name: 'EZEMA EMMANUEL UCHENNA' },
    { reg_number: '2024/274838', full_name: 'EZEOFOR NAFANNA CONSTANTINE' },
    { reg_number: '2024/274836', full_name: 'EZIGBOGU ZION ENENINACHUKWU' },
    { reg_number: '2024/274833', full_name: 'HUMPHREY JOSEPH CHIMARAOBI' },
    { reg_number: 'IBECHEM_IFEANYI', full_name: 'IBECHEM IFEANYI EMMANUEL' },
    { reg_number: 'IDOKO_JOHN', full_name: 'IDOKO JOHN IDOKO' },
    { reg_number: '2024/274410', full_name: 'IKECHUKWU JOHN MICHAEL' },
    { reg_number: '2024/274839', full_name: 'IKEMEFUNA CHARLES CYPRAIN' },
    { reg_number: '2024/275552', full_name: 'IKONNE DESTINE AMARACHUKWU' },
    { reg_number: '2024/282481', full_name: 'ILOENE EBERECHUKWU ELSIE' },
    { reg_number: '2024/274590', full_name: 'INACHOR CALEB OJOTOGBA' },
    { reg_number: 'IWUCHUKWU_DANIEL', full_name: 'IWUCHUKWU DANIEL CHUKWUBUEZE' },
    { reg_number: '2024/274834', full_name: 'IWUJI NELSON EMENIKE' },
    { reg_number: 'JAMES_WILSON', full_name: 'JAMES WILSON' },
    { reg_number: '2024/274516', full_name: 'JOHN IKECHUKWU MIRACLE' },
    { reg_number: 'KALU_DANIEL', full_name: 'KALU DANIEL OKAFOR' },
    { reg_number: '2024/275549', full_name: 'KANU CHUKWUEBUKA PRAISE' },
    { reg_number: '2024/274417', full_name: 'KELECHI KAMSIYOCHI KELVIN' },
    { reg_number: 'KRISAGBEDO_UCHENNA', full_name: 'KRISAGBEDO UCHENNA ONYEBO' },
    { reg_number: 'MBANEFO_JOHN', full_name: 'MBANEFO JOHN EKENE' },
    { reg_number: '2024/275614', full_name: 'MKPA-EKE DAVE KENECHUKWU' },
    { reg_number: '2024/274979', full_name: 'MUODEBELU JOHN PAUL' },
    { reg_number: 'NANNAIFANNA', full_name: 'NANNAIFANNA CONSTANTINE' },
    { reg_number: '2024/275609', full_name: 'NDU VICTOR CHIMEREMEZE' },
    { reg_number: '2024/276550', full_name: 'NDUAGUBA KEVIN CHIAGOZIEM' },
    { reg_number: '2024/274372', full_name: 'NJOKU COLLINS IKENNA' },
    { reg_number: '2024/279882', full_name: 'NNAEMEKA OKWUKWEDIRE NNAGOZIE' },
    { reg_number: 'NNAJI_GLORY', full_name: 'NNAJI GLORY IKECHUKWU' },
    { reg_number: '2024/279937', full_name: 'NNAMANI PRECIOUS IFEOMA' },
    { reg_number: 'NWABUISIAKU_SOMTOCHUKWU', full_name: 'NWABUISIAKU SOMTOCHUKWU JEREMIAH' },
    { reg_number: '2024/274530', full_name: 'NWACHUKWU CHIMDIYA OLUEBUBE' },
    { reg_number: 'NWACHUKWU_MBANEFUO', full_name: 'NWACHUKWU MBANEFUO' },
    { reg_number: '2024/278030', full_name: 'NWAFOR SHALOM IFUNANYA' },
    { reg_number: '2024/275272', full_name: 'NWAOKOBIA ANTHONY IFECHUKWUDE' },
    { reg_number: 'NWOBODO_CHUKWUBUIKEM', full_name: 'NWOBODO CHUKWUBUIKEM DANIEL' },
    { reg_number: '2024/274785', full_name: 'NWOSU DAISY CHINEMEMMA' },
    { reg_number: '2024/274370', full_name: 'NWUCHE PROMISE OGEMDI' },
    { reg_number: '2024/274807', full_name: 'NZEADIBE DANIEL NNANYEREM' },
    { reg_number: '2024/276173', full_name: 'NZIWUEZE RAPHAEL NNANNA' },
    { reg_number: '2024/277352', full_name: 'OBAJI MICHAEL CHIWETALU' },
    { reg_number: '2024/281047', full_name: 'OBASIDIKE CHIEMEZIEMNWAOBASI ARMSTRONG' },
    { reg_number: 'OBETA_CHIDOZIE', full_name: 'OBETA CHIDOZIE PIUS' },
    { reg_number: '2024/274507', full_name: 'OBI COLLINS CHISOM' },
    { reg_number: '2024/278036', full_name: 'OBIALI AMARACHI DIVINEFAVOUR' },
    { reg_number: '2024/276427', full_name: 'OBIDIKE CHIKADIBIA VICTOR' },
    { reg_number: 'OBIEZUE_CHUKWUDALU', full_name: 'OBIEZUE CHUKWUDALU NWABUEZE' },
    { reg_number: '2024/274620', full_name: 'OBIOMA JOSHUA CHITUO' },
    { reg_number: '2024/276304', full_name: 'OBO ISRAEL AJOGI' },
    { reg_number: 'OBRI_WATCHMAN', full_name: 'OBRI WATCHMAN OTONA' },
    { reg_number: '2024/275713', full_name: 'ODENIGBO MARTIN KOSISOCHUKWU' },
    { reg_number: '2024/277351', full_name: 'ODOH CHIEMERIE JOHNMARTINS' },
    { reg_number: '2024/275180', full_name: 'OFFOR BLESSING CHINAZAMEKPERE' },
    { reg_number: 'OGBONNA_DAVID', full_name: 'OGBONNA DAVID CHINAZA' },
    { reg_number: '2024/275967', full_name: 'OGBONNA JOEL NKEMJIKA' },
    { reg_number: '2024/274403', full_name: 'OGBONNA JUDITH TOOCHI' },
    { reg_number: '2024/274407', full_name: 'OGBONNA TOCHUKWU IHECHUKWU' },
    { reg_number: '2024/281322', full_name: 'OGUADIURU CHUKWUKAIKE CHARLESROYAL' },
    { reg_number: 'OGUAMA_NOBLE', full_name: 'OGUAMA NOBLE EBUBE' },
    { reg_number: '2024/275140', full_name: 'OGUEJIOFOR CHUKWUEMEKA FRANKLIN' },
    { reg_number: '2024/281325', full_name: 'OGUNJOBI PROSPER OLUWADARE' },
    { reg_number: '2024/276699', full_name: 'OHA KAMSIYOCHUKWU BRIGHT' },
    { reg_number: '2024/274798', full_name: 'OJOBO GERALD ARINZE' },
    { reg_number: '2024/276436', full_name: 'OJUU VICTOR OTISI' },
    { reg_number: '2024/274878', full_name: 'OKAFOR CHIMDINDU EMMANUEL' },
    { reg_number: '2024/276585', full_name: 'OKAFOR MICHAEL CHIDUMEBI' },
    { reg_number: 'OKARA_MICHEAL', full_name: 'OKARA MICHEAL' },
    { reg_number: '2024/278350', full_name: 'OKECHUKWU KELECHI JOSEPH' },
    { reg_number: '2024/274544', full_name: 'OKEKE-AGULU KENECHUKWU' },
    { reg_number: '2024/276303', full_name: 'OKOLOIGWE CHIAGOIZE RAPHEAL' },
    { reg_number: '2024/274546', full_name: 'OKONKWO AKACHUKWU GODSON' },
    { reg_number: '2024/275004', full_name: 'OKONOFUA GOODNESS OSEREMEH' },
    { reg_number: '2024/275144', full_name: 'OKOROAFOR IHEOMA PRECIOUS' },
    { reg_number: '2024/284890', full_name: 'OKOYE ONOCHIE CLARENCE' },
    { reg_number: '2024/276816', full_name: 'OKUMA RUDOLPH CHUKWUBUIKEM' },
    { reg_number: '2024/274539', full_name: 'OKWOSHA MEANIM MEANIM' },
    { reg_number: '2024/276999', full_name: 'OMOHA DANIEL CHINECHEREM' },
    { reg_number: '2024/279890', full_name: 'ONOJAH DANIEL CHIEMERIE' },
    { reg_number: 'ONWURAH_CHUKWUEMEKA', full_name: 'ONWURAH CHUKWUEMEKA JOHNPAUL' },
    { reg_number: '2024/282482', full_name: 'ONYEISI KENECHI WISLON' },
    { reg_number: 'OSAMEZU_DESTINY', full_name: 'OSAMEZU DESTINY IFEAKACHUKWU' },
    { reg_number: '2024/274605', full_name: 'OSILIKE CHUKWUBUIKEM CHIDIMMA' },
    { reg_number: '2024/275795', full_name: 'OSUJI CHIMAOBI PETER' },
    { reg_number: '2024/275308', full_name: 'OWOW PROSPER MOSES' },
    { reg_number: '2024/275760', full_name: 'RUFUS JUSTIN SOCHIMAOBI' },
    { reg_number: '2024/274399', full_name: 'SAMPSON PROSPER CHUKWUMA' },
    { reg_number: '2024/278351', full_name: 'TOBECHUKWU VICTOR MOUNACHUKWU' },
    { reg_number: '2024/275605', full_name: 'UBONISRAEL ODUDUABASI EMMANUEL' },
    { reg_number: 'UDEH_EMMANUEL', full_name: 'UDEH EMMANUEL UDEHCHUKWU' },
    { reg_number: '2024/275663', full_name: 'UGWU ANGELA EBUBECHI' },
    { reg_number: 'UGWU_LOUIS', full_name: 'UGWU LOUIS NDUBISI' },
    { reg_number: '2024/274502', full_name: 'UKO WISDOM IHEANYI' },
    { reg_number: '2024/276990', full_name: 'UKWUANI BRUNO CHINAEMELUM' },
    { reg_number: 'UZODINMA_CHIAGOZIE', full_name: 'UZODINMA CHIAGOZIE VALENTINE' },
    { reg_number: '2024/274908', full_name: 'UZUAGU CHIKAMSO LIVINUS' },
    { reg_number: '2024/274525', full_name: 'VITUS JOSHUA ONYEDIKACHI' },
];

// ============================================
// CONFIGURATION
// ============================================
const SALT_ROUNDS = 10;
const DEFAULT_LEVEL = '200L'; // Second year students
const DEFAULT_DEPARTMENT = 'Electronics & Computer Engineering';

// ============================================
// GENERATE SQL
// ============================================
async function generateMinimalImport() {
    console.log('🔐 Generating minimal student import...\n');
    console.log(`Total students: ${students.length}`);
    console.log(`Default level: ${DEFAULT_LEVEL}`);
    console.log(`Default department: ${DEFAULT_DEPARTMENT}\n`);
    
    const sqlStatements = [];
    
    for (const student of students) {
        // Password = student's reg_number
        const password = student.reg_number;
        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Escape single quotes in names
        const fullName = student.full_name.replace(/'/g, "''");
        
        // Minimal insert - only reg_number, full_name, level, department, password_hash
        const sql = `('${student.reg_number}', '${fullName}', '${DEFAULT_LEVEL}', '${DEFAULT_DEPARTMENT}', '${hash}', true, true)`;
        
        sqlStatements.push(sql);
        
        console.log(`✓ ${student.reg_number} - ${student.full_name}`);
        console.log(`  Password: ${password}\n`);
    }
    
    // Generate final SQL
    console.log('\n' + '='.repeat(80));
    console.log('📋 COPY THIS SQL TO SUPABASE:');
    console.log('='.repeat(80) + '\n');
    
    const finalSQL = `-- Minimal Student Import - Generated on ${new Date().toISOString()}
-- Total students: ${students.length}
-- Level: ${DEFAULT_LEVEL}
-- Department: ${DEFAULT_DEPARTMENT}
-- Password: Each student's reg_number

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
    is_active,
    force_password_change
FROM students
ORDER BY reg_number;

-- Check counts
SELECT 
    level,
    COUNT(*) as total_students,
    COUNT(email) as with_email,
    COUNT(phone) as with_phone
FROM students
GROUP BY level;
`;
    
    console.log(finalSQL);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ IMPORT READY!');
    console.log('='.repeat(80));
    console.log('\n🔐 LOGIN INSTRUCTIONS FOR STUDENTS:');
    console.log('  Username: Your registration number (e.g., CS/2021/001)');
    console.log('  Password: Your registration number (same as username)');
    console.log('\n📝 ON FIRST LOGIN:');
    console.log('  1. Students will be forced to change their password');
    console.log('  2. Students should complete their profile:');
    console.log('     - Add email address');
    console.log('     - Add phone number');
    console.log('     - Update section if needed');
    console.log('\n⚠️  Fields left as NULL:');
    console.log('  - email (student will add)');
    console.log('  - phone (student will add)');
    console.log('  - section (student will add)');
    console.log('  - profile_photo (optional)');
    console.log('\n✓ Fields auto-populated:');
    console.log(`  - level: ${DEFAULT_LEVEL}`);
    console.log(`  - department: ${DEFAULT_DEPARTMENT}`);
    console.log('  - password_hash: Generated from reg_number');
    console.log('  - force_password_change: true');
    console.log('  - is_active: true\n');
}

// ============================================
// RUN
// ============================================
generateMinimalImport().catch(console.error);
