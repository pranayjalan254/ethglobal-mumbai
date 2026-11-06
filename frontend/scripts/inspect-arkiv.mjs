import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { defineSchema, str, dec, i32, addr } from "@arkiv-network/sdk/schema";
import { http } from "viem";

const accessKey = process.env.VITE_ARKIV_ACCESS_KEY || "ark_live_FkBVVU1GhNDlAKQwhXeZSxI5gs6BI7dR";

export const ServicesSchema = defineSchema("slotpay.services.v1", {
  title: str().indexed(),
  category: str().indexed(),
  skills: str().indexed(),
  providerType: str().indexed(),
  providerName: str(),
  providerWallet: addr().indexed(),
  price: dec().indexed(),
  currency: str().indexed(),
  durationMin: i32().indexed(),
  description: str(),
  nextSlot: str().indexed(),
  rating: dec().indexed(),
});

async function main() {
  console.log("=================================================");
  console.log("       Arkiv Rabdi Testnet Database Inspector     ");
  console.log("=================================================");
  console.log("Target Network: Rabdi (Chain ID: 7794095)");
  console.log("Schema:         slotpay.services.v1");
  console.log("Access Key:    ", accessKey);

  const client = createPublicClient({
    chain: rabdi({ accessKey }),
    transport: http(undefined, { timeout: 10000 }),
  });

  try {
    const block = await client.getBlockNumber();
    console.log(`Current Rabdi Block Number: ${block.toString()}\n`);

    console.log("Querying Arkiv database: client.select().from(ServicesSchema).withCount().fetch()...");
    const result = await client.select().from(ServicesSchema).withCount().limit(25).fetch();

    console.log(`\nResults returned from Arkiv (slotpay.services.v1):`);
    console.log(`- Entities found: ${result.entities.length}`);
    console.log(`- Total matching on-chain: ${result.count?.toString() ?? result.entities.length}`);
    console.log(`- Skipped for mismatch: ${result.skipped ?? 0}`);

    if (result.entities.length === 0) {
      console.log("\n[Notice] No direct listings created under 'slotpay.services.v1' yet.");
    } else {
      console.log("\nLive Service Entities on Arkiv:");
      result.entities.forEach((entity, idx) => {
        console.log(`\n--- Service #${idx + 1} ---`);
        console.log(`Key:        ${entity.$key}`);
        console.log(`Owner:      ${entity.$owner}`);
        console.log(`Title:      ${entity.title?.value}`);
        console.log(`Price:      ${entity.price?.value} ${entity.currency?.value}`);
      });
    }

    // Also inspect availability entities
    const rawAvail = await client.request({
      method: "arkiv_query",
      params: [
        "arkiv.schema = str('slotpay.availability.v1')",
        { select: { key: true, owner: true, expiresAt: true, attributes: true }, limit: "0x14" }
      ]
    });
    const availEntities = rawAvail.data || [];
    console.log(`\nResults returned from Arkiv (slotpay.availability.v1):`);
    console.log(`- Entities found: ${availEntities.length}`);
    availEntities.forEach((entity, idx) => {
      const attrs = Object.fromEntries((entity.attributes || []).map(a => [a.name, a.value]));
      console.log(`\n--- Availability Entity #${idx + 1} ---`);
      console.log(`Key:        ${entity.key}`);
      console.log(`Owner:      ${entity.owner}`);
      console.log(`Provider:   ${attrs.providerName} (${attrs.providerWallet})`);
      console.log(`Next Slot:  ${attrs.nextSlot}`);
      console.log(`DayHour:    ${attrs.dayHour}`);
      if (attrs.swarmRef || attrs.swarm_ref) {
        console.log(`Swarm Ref:  bzz://${attrs.swarmRef || attrs.swarm_ref}`);
      }
    });
  } catch (err) {
    console.error("Failed to query Arkiv database:", err);
  }
}

main();

