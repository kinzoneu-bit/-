const SUPABASE_URL = 'https://hsyuopmmndpcabhegics.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeXVvcG1tbmRwY2FiaGVnaWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwNDg5NDUsImV4cCI6MjA4MjYyNDk0NX0.q9MI7lqtHnO_c1-32QVTJtcXOoPC5fvJaMhDUQXcNDc';
async function run() {
  const url = `${SUPABASE_URL}/rest/v1/rpc/check_enum`;
  // 没有 rpc 的话直接 SQL 查询
  // 用 pg_query 接口
  const res = await fetch(`${SUPABASE_URL}/rest/v1/shelf_cats?select=st&limit=1`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  console.log('test:', await res.text());
}
run();
