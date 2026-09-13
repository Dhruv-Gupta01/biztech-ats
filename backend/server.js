require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const candidateRoutes = require('./routes/candidateRoutes');
const roleRoutes = require('./routes/roleRoutes');
const slackRoutes = require('./routes/slackRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const outreachRoutes = require('./routes/outreachRoutes');
const emailTemplateRoutes = require('./routes/emailTemplateRoutes');
const cron = require('node-cron');
const retentionRoutes = require('./routes/retentionRoutes');
const etlRoutes = require('./routes/etlRoutes');
const formSyncRoutes = require('./routes/formSyncRoutes');
const { runRetentionCleanup } = require('./services/retentionService');
const { runNaukriEtl } = require('./services/naukriEtlService');

const app = express();

connectDB();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/candidates', candidateRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/slack-mappings', slackRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/outreach', outreachRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/retention', retentionRoutes);
app.use('/api/etl', etlRoutes);
app.use('/api/form-sync', formSyncRoutes);

app.get('/', (req, res) => res.send('BizTech ATS API is running'));
// Daily retention sweep at 2 AM server time. Safe to leave running even when
// RETENTION_ENABLED=false — runRetentionCleanup() itself no-ops and just logs why.
cron.schedule('0 2 * * *', async () => {
  try {
    const result = await runRetentionCleanup();
    console.log('[Retention] Daily sweep:', result);
  } catch (err) {
    console.error('[Retention] Daily sweep failed:', err);
  }
});

// Daily Naukri CSV import at 9 AM server time — fetches the newest CSV from
// the shared Drive folder, inserts clean candidates, flags the rest into the
// Import Review queue. Safe to leave running even when ETL_ENABLED=false —
// runNaukriEtl() itself no-ops and just logs why.
cron.schedule('0 9 * * *', async () => {
  try {
    const result = await runNaukriEtl({ triggeredBy: 'cron' });
    console.log('[NaukriEtl] Daily 9am run:', result);
  } catch (err) {
    console.error('[NaukriEtl] Daily 9am run failed:', err);
  }
});

// Global error handler — must be defined AFTER all routes/middleware above.
// Catches Multer errors (file too large, wrong file type) and any other
// uncaught error, and always responds with clean JSON instead of a raw stack trace.
const multer = require('multer');
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'File is too large. Please check the size limit for this upload and try a smaller file.' });
    }
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  if (err && (err.message === 'ONLY_PDF_ALLOWED' || err.message === 'ONLY_CSV_ALLOWED')) {
    return res.status(400).json({ success: false, message: err.message === 'ONLY_PDF_ALLOWED' ? 'Only PDF files are allowed.' : 'Only CSV files are allowed.' });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ success: false, message: 'Unexpected server error.' });
});

const PORT = process.env.PORT || 5004;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));