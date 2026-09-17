require('dotenv').config();
const { pool, ensureDatabaseExists } = require('./src/db');
const { repairMatchesMissingSubcategoryCore } = require('./src/controllers/matchesController');

const runRepair = async () => {
  try {
    await ensureDatabaseExists();
    console.log('🚀 [REPAIR SCRIPT] Starting check and repair for matches missing subcategories...');
    const result = await repairMatchesMissingSubcategoryCore();
    console.log(`✅ [REPAIR SCRIPT] Completed! Total matches repaired: ${result.repairedCount}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ [REPAIR SCRIPT] Error during repair:', err);
    process.exit(1);
  }
};

runRepair();
