import Dexie from 'dexie';

// Initialize the local database
export const localDB = new Dexie('AttendanceLocalDB');

// Define the schema
// 'member_id' is our primary key.
localDB.version(1).stores({
  syncQueue: 'member_id, event_id, action, time, retries'
});