"use strict";
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const EmploymentType = require('../models/EmploymentType');

dotenv.config();

async function seedEmploymentTypes() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/biztech-ats');
    console.log('[EmploymentTypes] Connected to MongoDB');

    // Check if already seeded
    const count = await EmploymentType.countDocuments();
    if (count > 0) {
      console.log('[EmploymentTypes] Employment types already exist. Skipping seed.');
      await mongoose.disconnect();
      return;
    }

    const employmentTypes = [
      {
        name: 'Full-Time',
        label: 'Full Time',
        isActive: true,
        isPrefixBased: false,
        prefix: null,
        sortOrder: 1,
        description: 'Standard full-time employment',
        isDefault: true
      },
      {
        name: 'Part-Time',
        label: 'Part Time',
        isActive: true,
        isPrefixBased: false,
        prefix: null,
        sortOrder: 2,
        description: 'Part-time employment',
        isDefault: false
      },
      {
        name: 'Contract',
        label: 'Contractual',
        isActive: true,
        isPrefixBased: false,
        prefix: null,
        sortOrder: 3,
        description: 'Contract-based employment',
        isDefault: false
      },
      {
        name: 'Internship',
        label: 'Internship',
        isActive: true,
        isPrefixBased: false,
        prefix: null,
        sortOrder: 4,
        description: 'Internship positions',
        isDefault: false
      },
      {
        name: 'FREELANCE CODING',
        label: 'Freelance Coding',
        isActive: true,
        isPrefixBased: true,
        prefix: 'F',
        sortOrder: 5,
        description: 'Freelance coding assignments (role codes starting with F)',
        isDefault: false
      },
      {
        name: 'Medical Hiring',
        label: 'Medical Hiring',
        isActive: true,
        isPrefixBased: true,
        prefix: 'M',
        sortOrder: 6,
        description: 'Medical and healthcare hiring (role codes starting with M)',
        isDefault: false
      }
    ];

    await EmploymentType.insertMany(employmentTypes);
    console.log('[EmploymentTypes] Seeded default employment types:', employmentTypes.length);
    await mongoose.disconnect();
  } catch (error) {
    console.error('[EmploymentTypes] Failed to seed employment types:', error);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

seedEmploymentTypes();