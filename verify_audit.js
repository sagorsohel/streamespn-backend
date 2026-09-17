const { db } = require('./src/db');
const { matches, sportsCategories, sportsSubcategories } = require('./src/db/schema');

async function audit() {
  console.log('🔍 [AUDIT] Running deep database integrity check...');

  const allCats = await db.select().from(sportsCategories);
  const allSubs = await db.select().from(sportsSubcategories);
  const allMatches = await db.select().from(matches);

  console.log(`Totals: ${allCats.length} Categories, ${allSubs.length} Subcategories, ${allMatches.length} Matches`);

  const catMap = new Map(allCats.map(c => [c.id, c]));
  const subMap = new Map(allSubs.map(s => [s.id, s]));

  let orphanSubcategories = 0;
  for (const s of allSubs) {
    if (!catMap.has(s.categoryId)) {
      console.error(`❌ Orphan Subcategory: ID ${s.id} (${s.name}) points to non-existent categoryId ${s.categoryId}`);
      orphanSubcategories++;
    }
  }

  let orphanMatches = 0;
  let nullSubcatMatches = 0;
  let categoryMismatchMatches = 0;

  for (const m of allMatches) {
    if (!catMap.has(m.categoryId)) {
      console.error(`❌ Match ID ${m.id} points to non-existent categoryId ${m.categoryId}`);
      orphanMatches++;
    }

    if (!m.subcategoryId) {
      nullSubcatMatches++;
    } else {
      const sub = subMap.get(m.subcategoryId);
      if (!sub) {
        console.error(`❌ Match ID ${m.id} points to non-existent subcategoryId ${m.subcategoryId}`);
        orphanMatches++;
      } else if (sub.categoryId !== m.categoryId) {
        console.error(`❌ MISMATCH! Match ID ${m.id} has categoryId ${m.categoryId} (${catMap.get(m.categoryId)?.sportName}), but its subcategory ID ${sub.id} (${sub.name}) belongs to categoryId ${sub.categoryId} (${catMap.get(sub.categoryId)?.sportName})!`);
        categoryMismatchMatches++;
      }
    }
  }

  // Cross-sport keyword leak audit
  console.log('\n--- 🔍 Checking Cross-Sport Keyword Contamination ---');
  let contaminatedSubs = 0;
  for (const s of allSubs) {
    const cat = catMap.get(s.categoryId);
    const catName = cat?.sportName?.toLowerCase() || '';
    const subName = s.name.toLowerCase();

    // Check baseball in soccer
    if (catName === 'soccer' && subName.includes('baseball')) {
      console.error(`❌ Contamination: Baseball league "${s.name}" found in Soccer!`);
      contaminatedSubs++;
    }
    // Check hockey in soccer
    if (catName === 'soccer' && (subName.includes('hockey') || subName.includes('khl') || subName.includes('nhl'))) {
      console.error(`❌ Contamination: Hockey league "${s.name}" found in Soccer!`);
      contaminatedSubs++;
    }
    // Check soccer in hockey
    if (catName === 'hockey' && (subName.includes('premier league') && !subName.includes('hockey') && !subName.includes('ice'))) {
      console.error(`❌ Contamination: Soccer league "${s.name}" found in Hockey!`);
      contaminatedSubs++;
    }
  }

  console.log('\n--- 📋 Complete Audit Summary ---');
  console.log(`1. Orphan Subcategories: ${orphanSubcategories}`);
  console.log(`2. Orphan Matches: ${orphanMatches}`);
  console.log(`3. Matches with NULL subcategory: ${nullSubcatMatches}`);
  console.log(`4. Category vs Subcategory MISMATCH: ${categoryMismatchMatches}`);
  console.log(`5. Cross-Sport Contaminated Leagues: ${contaminatedSubs}`);

  if (orphanSubcategories === 0 && orphanMatches === 0 && nullSubcatMatches === 0 && categoryMismatchMatches === 0 && contaminatedSubs === 0) {
    console.log('✅ PERFECT 100%: ZERO mismatches found across the entire database!');
  } else {
    console.log('⚠️ Some issues found, see details above.');
  }

  process.exit(0);
}

audit();
