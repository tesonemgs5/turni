import fs from 'fs';

const envContent = fs.readFileSync('./.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

async function main() {
  const url = `${env.VITE_SUPABASE_URL}/rest/v1/?apikey=${env.VITE_SUPABASE_ANON_KEY}`;
  console.log("Fetching OpenAPI spec from:", url);
  const res = await fetch(url);
  const doc = await res.json();
  
  console.log("Definitions keys:", Object.keys(doc.definitions || {}));
  
  if (doc.paths && doc.paths['/rpc/get_user_data']) {
    console.log("Found /rpc/get_user_data spec:");
    console.log(JSON.stringify(doc.paths['/rpc/get_user_data'], null, 2));
  } else {
    console.log("No spec found for /rpc/get_user_data");
  }
  
  const modelsDef = doc.definitions && (doc.definitions.modelli || doc.definitions.models);
  if (modelsDef) {
    console.log("Found modelli definition properties:", Object.keys(modelsDef.properties || {}));
  }
}

main().catch(err => console.error("Unhandled error:", err));
