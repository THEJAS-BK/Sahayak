import axios from 'axios';
import logger from '../utils/logger';

/**
 * Setup test data in backend database
 * Run this once before demo
 */
async function setupTestData(): Promise<void> {
  const backendUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';

  try {
    console.log('Setting up test data in backend...\n');

    // Register test senior
    const seniorPayload = {
      phone_number: '+919999999999',
      name: 'Grandma Lakshmi',
      age: 72,
      preferred_language: 'kannada',
      address: 'Shirva Village, Udupi',
      medical_conditions: ['Hypertension'],
      standing_medications: ['Blood pressure medication'],
    };

    console.log('📝 Registering test senior...');
    console.log(`Phone: ${seniorPayload.phone_number}`);
    console.log(`Name: ${seniorPayload.name}`);

    try {
      const seniorRes = await axios.post(`${backendUrl}/api/registrations`, seniorPayload);
      console.log('✅ Senior registered\n');
    } catch (err: any) {
      if (err.response?.status === 409) {
        console.log('⚠️  Senior already exists\n');
      } else {
        throw err;
      }
    }

    // Register test volunteer
    const volunteerPayload = {
      phone_number: '+918888888888',
      name: 'Volunteer Raj',
      preferred_language: 'kannada',
      location: 'Shirva',
      availability: 'available',
    };

    console.log('📝 Registering test volunteer...');
    console.log(`Phone: ${volunteerPayload.phone_number}`);
    console.log(`Name: ${volunteerPayload.name}`);

    try {
      const volRes = await axios.post(`${backendUrl}/api/registrations`, volunteerPayload);
      console.log('✅ Volunteer registered\n');
    } catch (err: any) {
      if (err.response?.status === 409) {
        console.log('⚠️  Volunteer already exists\n');
      } else {
        throw err;
      }
    }

    console.log('═══════════════════════════════════════');
    console.log('✅ Test data setup complete!');
    console.log('═══════════════════════════════════════\n');
    console.log('Now run: npm run demo:local\n');
  } catch (error) {
    console.error('❌ Failed to setup test data');
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  setupTestData();
}

export { setupTestData };