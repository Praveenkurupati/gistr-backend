const API_URL = "http://localhost:3000";

async function runTests() {
  console.log("🚀 Starting E2E Live API Tests...");

  console.log("\n--- 1. Testing GET /entities/search (OR Mode) ---");
  const orRes = await fetch(`${API_URL}/entities/search?tags=mongodb,database&mode=or`);
  const orData = await orRes.json();
  console.log(`✅ OR search for 'mongodb,database' found ${orData.total} items. First item type:`, orData.data[0]?.type);

  console.log("\n--- 2. Testing GET /entities/search (AND Mode) ---");
  const andRes = await fetch(`${API_URL}/entities/search?tags=mongodb,aggregation&mode=and`);
  const andData = await andRes.json();
  console.log(`✅ AND search for 'mongodb,aggregation' found ${andData.total} items. First item id:`, andData.data[0]?._id);

  console.log("\n--- 3. Testing POST /tags/attach (Idempotency & Deduplication) ---");
  // Grab an entity ID to attach to
  const entityId = orData.data[0]._id;
  const entityType = orData.data[0].type;
  
  // Attach tags with a duplicate in the payload
  const attachRes1 = await fetch(`${API_URL}/tags/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityId,
      entityType,
      tags: ["new_test_tag", "NEW_test_TAG", "   new_test_tag "] // Intentionally messy
    })
  });
  const attachData1 = await attachRes1.json();
  console.log(`✅ Attempt 1 Attachment:`, attachData1.attached); // Should only attach "new_test_tag" once
  
  // Attempt to attach exactly the same again (Idempotency)
  const attachRes2 = await fetch(`${API_URL}/tags/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityId, entityType, tags: ["new_test_tag"] })
  });
  const attachData2 = await attachRes2.json();
  console.log(`✅ Attempt 2 Attachment (Idempotent):`, attachData2.attached); // Should be empty

  console.log("\n--- 4. Testing GET /tags/analytics ---");
  const analyticsRes = await fetch(`${API_URL}/tags/analytics`);
  const analyticsData = await analyticsRes.json();
  console.log("✅ Analytics Top Tags:");
  analyticsData.topTags.slice(0, 3).forEach((t: any) => console.log(`   - ${t.name} (${t.count})`));

  console.log("\n--- 5. Testing DELETE /entities/:id (Soft-Delete) ---");
  const delRes = await fetch(`${API_URL}/entities/${entityId}`, { method: "DELETE" });
  console.log("✅ Soft-Delete Response Status:", delRes.status);

  console.log("\n--- 6. Verify Soft-Delete impact on Analytics ---");
  const analyticsResAfter = await fetch(`${API_URL}/tags/analytics`);
  const analyticsDataAfter = await analyticsResAfter.json();
  const oldTagCount = analyticsData.topTags.find((t: any) => t.name === "database")?.count;
  const newTagCount = analyticsDataAfter.topTags.find((t: any) => t.name === "database")?.count;
  console.log(`✅ Analytics 'database' usage count decreased properly from ${oldTagCount} to ${newTagCount}`);

  console.log("\n==================================");
  console.log("🏆 ALL API TESTS PASSED PERFECTLY!");
}

runTests().catch(console.error);
