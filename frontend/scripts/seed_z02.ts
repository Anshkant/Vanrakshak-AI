import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
  const zoneId = 'Z-02';
  console.log(`📡 Initializing Tactical Uplink for Zone ${zoneId}...`);

  // 1. Seed Cameras
  const cameras = [
    { name: 'CAM-02-ALPHA', location: 'North Ridge Pass', status: 'online', battery: 92, signal_strength: 'Excellent', zone_id: zoneId, latitude: 26.021, longitude: 76.512 },
    { name: 'CAM-02-BRAVO', location: 'East Watering Hole', status: 'online', battery: 78, signal_strength: 'Good', zone_id: zoneId, latitude: 26.018, longitude: 76.505 },
    { name: 'CAM-02-CHARLIE', location: 'Southern Perimeter', status: 'maintenance', battery: 12, signal_strength: 'Weak', zone_id: zoneId, latitude: 26.012, longitude: 76.501 },
  ];

  const { error: camError } = await supabase.from('cameras').upsert(cameras, { onConflict: 'name' });
  if (camError) console.error('❌ Camera Sync Failed:', camError);
  else console.log('✅ Camera Network Integrated.');

  // 2. Seed Alerts (Historical trends for the last 30 days)
  const types = ['tiger', 'leopard', 'human', 'vehicle', 'poacher', 'fire', 'deer'];
  const alerts = [];
  const now = new Date();

  // Create ~25 random alerts for the last 30 days
  for (let i = 0; i < 25; i++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const severity = (type === 'poacher' || type === 'fire' || type === 'human') ? 'critical' : 'low';
    const createdAt = new Date();
    createdAt.setDate(now.getDate() - Math.floor(Math.random() * 30));
    
    alerts.push({
      type,
      location: 'Tactical Sector ' + (Math.floor(Math.random() * 5) + 1),
      severity,
      status: 'detected',
      zone_id: zoneId,
      latitude: 26.01 + (Math.random() * 0.02),
      longitude: 76.50 + (Math.random() * 0.02),
      created_at: createdAt.toISOString()
    });
  }

  const { error: alertError } = await supabase.from('alerts').insert(alerts);
  if (alertError) console.error('❌ Alert Broadcast Failed:', alertError);
  else console.log('✅ Tactical Intelligence Synchronized.');

  console.log('🚀 Zone Z-02 is now FULLY OPERATIONAL.');
}

seed();
