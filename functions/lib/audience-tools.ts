import type { Sql } from "./db.js";

export async function getCampaignContext(sql: Sql, elmId: string) {
  const normalized = elmId.toUpperCase().startsWith("ELM-") ? elmId.toUpperCase() : `ELM-${elmId}`;

  const campaigns = await sql`
    SELECT c.id, c.elm_id, c.name, c.business_unit, c.campaign_goal,
           c.campaign_type, c.products, c.channels, c.sot_main_audience, c.status
    FROM campaigns c
    WHERE c.elm_id = ${normalized} OR c.id = ${normalized.toLowerCase().replace("elm-", "elm-")}
    LIMIT 1
  `;

  if (!campaigns.length) {
    return { found: false, elmId: normalized };
  }

  const campaign = campaigns[0];
  const specs = await sql`
    SELECT id, source, audience_name, attributes, audience_criteria, size_estimate, platform, status
    FROM audience_specs
    WHERE campaign_id = ${campaign.id}
    ORDER BY updated_at DESC
  `;

  const criteria = await sql`
    SELECT criterion_text, concept_keywords, criterion_type, sort_order
    FROM audience_criteria
    WHERE campaign_id = ${campaign.id}
    ORDER BY sort_order
  `;

  return { found: true, campaign, specs, criteria };
}

export async function findSiblingCampaigns(
  sql: Sql,
  params: {
    campaignGoal?: string;
    productKeyword?: string;
    businessUnit?: string;
    excludeCampaignId?: string;
    limit?: number;
  },
) {
  const limit = params.limit ?? 20;
  const goal = params.campaignGoal ?? null;
  const product = params.productKeyword ?? null;
  const bu = params.businessUnit ?? null;
  const exclude = params.excludeCampaignId ?? null;

  const rows = await sql`
    SELECT c.id, c.elm_id, c.name, c.campaign_goal, c.products,
           s.attributes, s.audience_criteria, s.size_estimate
    FROM campaigns c
    JOIN audience_specs s ON s.campaign_id = c.id
    WHERE cardinality(s.attributes) > 3
      AND s.status IN ('approved', 'built', 'draft')
      AND (${goal}::text IS NULL OR c.campaign_goal = ${goal})
      AND (${bu}::text IS NULL OR c.business_unit = ${bu})
      AND (${exclude}::text IS NULL OR c.id <> ${exclude})
      AND (
        ${product}::text IS NULL
        OR EXISTS (SELECT 1 FROM unnest(c.products) p WHERE p ILIKE ${"%" + (product ?? "") + "%"})
      )
    ORDER BY c.target_launch_date DESC NULLS LAST
    LIMIT ${limit}
  `;

  const traitFreq: Record<string, { count: number; campaigns: string[] }> = {};
  for (const row of rows) {
    const attrs = (row.attributes as string[]) || [];
    for (const trait of attrs) {
      if (!traitFreq[trait]) traitFreq[trait] = { count: 0, campaigns: [] };
      traitFreq[trait].count += 1;
      if (row.elm_id && !traitFreq[trait].campaigns.includes(row.elm_id as string)) {
        traitFreq[trait].campaigns.push(row.elm_id as string);
      }
    }
  }

  return { siblings: rows, traitFrequency: traitFreq };
}

export async function getPredecessorAudiences(sql: Sql, campaignId: string) {
  return sql`
    SELECT c.elm_id, c.name, s.audience_name, s.attributes, s.audience_criteria
    FROM campaign_connections cc
    JOIN campaigns c ON c.id = cc.to_campaign_id
    JOIN audience_specs s ON s.campaign_id = c.id
    WHERE cc.from_campaign_id = ${campaignId}
      AND cc.connection_type = 'depends_on'
      AND cardinality(s.attributes) > 0
  `;
}

export async function lookupNlPhrases(sql: Sql, criterionText: string, targetSystem?: string) {
  const system = targetSystem ?? null;

  const rows = await sql`
    SELECT am.id, am.system_name, am.system, am.nl_operator, am.spec_name,
           np.phrase,
           cardinality(np.validated_by_campaign_ids) AS validation_count,
           similarity(np.phrase, ${criterionText}) AS phrase_score
    FROM nl_phrases np
    JOIN attribute_mappings am ON am.id = np.mapping_id
    WHERE np.phrase % ${criterionText}
      AND am.status = 'active'
      AND (${system}::text IS NULL OR am.system = ${system})
    ORDER BY phrase_score DESC, validation_count DESC
    LIMIT 5
  `;

  return rows.map((r) => ({
    ...r,
    weighted_score: (r.phrase_score as number) * (1 + (r.validation_count as number)),
  }));
}

export async function getExpectedOutcome(sql: Sql, campaignId: string) {
  const rows = await sql`
    SELECT manifest_json, segment_expression, expected_size, resolution_summary
    FROM ground_truth_manifests
    WHERE campaign_id = ${campaignId}
       OR campaign_id = ${campaignId.toLowerCase()}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listSegmentTraits(sql: Sql, search?: string, limit = 50) {
  if (search) {
    return sql`
      SELECT trait_key, usage_count
      FROM segment_traits
      WHERE trait_key ILIKE ${"%" + search + "%"}
      ORDER BY usage_count DESC
      LIMIT ${limit}
    `;
  }
  return sql`
    SELECT trait_key, usage_count
    FROM segment_traits
    ORDER BY usage_count DESC
    LIMIT ${limit}
  `;
}
