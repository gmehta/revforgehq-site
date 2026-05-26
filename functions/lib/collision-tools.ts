import type { Sql } from "./db.js";
import { findSiblingCampaigns, lookupNlPhrases } from "./audience-tools.js";
import type { CollisionScenario } from "./collision-scenarios.js";

export interface ProposedAudience {
  criteria: string[];
  traits: string[];
  expression: string;
  estimatedSize: number;
  productHint: string;
}

export interface CollisionRow {
  campaignId: string;
  elmId: string | null;
  name: string | null;
  campaignSize: number;
  overlapCount: number;
  overlapPct: number;
  jaccard: number;
  destinations: string[];
  traits: string[];
  activationStart: string;
  activationEnd: string;
}

export interface CollisionVisualization {
  proposedSize: number;
  uniqueSize: number;
  totalOverlapEstimate: number;
  collisions: CollisionRow[];
  primaryPair: {
    proposed: { label: string; size: number };
    topCollision: CollisionRow | null;
  };
}

function parseCriteria(text: string): string[] {
  return text
    .split(/\n|[;,]/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function traitOverlapRatio(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection += 1;
  }
  return intersection / Math.min(a.size, b.size);
}

function buildExpression(traits: string[]): string {
  if (!traits.length) return "(no traits resolved)";
  return traits.map((t) => `${t} = true`).join(" AND ");
}

export async function resolveCriteriaTraits(
  sql: Sql,
  scenario: CollisionScenario,
): Promise<{ traits: string[]; nlMappings: { criterion: string; matches: Record<string, unknown>[] }[] }> {
  const criteria = scenario.criteria;
  const traitSet = new Set<string>();
  const nlMappings: { criterion: string; matches: Record<string, unknown>[] }[] = [];

  for (const criterion of criteria) {
    const matches = await lookupNlPhrases(sql, criterion, "segment_cdp");
    nlMappings.push({ criterion, matches: matches as Record<string, unknown>[] });
    for (const m of matches.slice(0, 2)) {
      const name = (m.system_name as string) || (m.spec_name as string);
      if (name) traitSet.add(name);
    }
  }

  const siblings = await findSiblingCampaigns(sql, {
    productKeyword: scenario.productHint,
    limit: 15,
  });

  for (const row of siblings.siblings) {
    const attrs = (row.attributes as string[]) || [];
    for (const trait of attrs.slice(0, 8)) {
      traitSet.add(trait);
    }
  }

  const topSiblingTraits = Object.entries(siblings.traitFrequency)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
    .map(([trait]) => trait);

  for (const t of topSiblingTraits) {
    traitSet.add(t);
  }

  return { traits: [...traitSet].slice(0, 20), nlMappings };
}

export async function estimateCohortSize(
  sql: Sql,
  proposedTraits: string[],
  defaultSize: number,
): Promise<number> {
  if (!proposedTraits.length) return defaultSize;

  const rows = await sql`
    SELECT size_estimate, attributes
    FROM audience_specs
    WHERE cardinality(attributes) > 0
      AND size_estimate IS NOT NULL
      AND size_estimate > 0
    LIMIT 200
  `;

  const proposedSet = new Set(proposedTraits);
  const sizes: number[] = [];

  for (const row of rows) {
    const attrs = new Set((row.attributes as string[]) || []);
    if (traitOverlapRatio(proposedSet, attrs) >= 0.5) {
      sizes.push(Number(row.size_estimate));
    }
  }

  if (!sizes.length) return defaultSize;
  sizes.sort((a, b) => a - b);
  return Math.round(sizes[Math.floor(sizes.length / 2)]);
}

export async function findActiveCampaignAudiences(
  sql: Sql,
  startDate: string,
  endDate: string,
) {
  return sql`
    SELECT
      c.id AS campaign_id,
      c.elm_id,
      c.name,
      c.products,
      s.id AS spec_id,
      s.attributes,
      s.audience_name,
      s.size_estimate,
      w.activation_start,
      w.activation_end,
      COALESCE(
        array_agg(DISTINCT d.destination_name) FILTER (WHERE d.destination_name IS NOT NULL),
        '{}'
      ) AS destinations
    FROM campaign_activation_windows w
    JOIN campaigns c ON c.id = w.campaign_id
    JOIN audience_specs s ON s.campaign_id = c.id
    LEFT JOIN audience_destinations d ON d.audience_spec_id = s.id
    WHERE w.activation_start <= ${endDate}::date
      AND w.activation_end >= ${startDate}::date
      AND cardinality(s.attributes) > 0
    GROUP BY c.id, c.elm_id, c.name, c.products, s.id, s.attributes,
             s.audience_name, s.size_estimate, w.activation_start, w.activation_end
    ORDER BY s.size_estimate DESC NULLS LAST
    LIMIT 80
  `;
}

export function computeCollisions(
  proposed: ProposedAudience,
  activeAudiences: Record<string, unknown>[],
): CollisionVisualization {
  const proposedSet = new Set(proposed.traits);
  const proposedSize = proposed.estimatedSize;

  const collisions: CollisionRow[] = [];

  for (const row of activeAudiences) {
    const campaignTraits = new Set((row.attributes as string[]) || []);
    const jac = jaccard(proposedSet, campaignTraits);
    const campaignSize = Math.max(1, Number(row.size_estimate) || 1000);
    const overlapCount = Math.round(Math.min(proposedSize, campaignSize) * jac);
    const overlapPct = proposedSize > 0 ? overlapCount / proposedSize : 0;

    if (overlapCount <= 0 && jac <= 0) continue;

    collisions.push({
      campaignId: row.campaign_id as string,
      elmId: (row.elm_id as string) ?? null,
      name: (row.name as string) ?? (row.audience_name as string) ?? null,
      campaignSize,
      overlapCount,
      overlapPct,
      jaccard: jac,
      destinations: ((row.destinations as string[]) ?? []).filter(Boolean),
      traits: [...campaignTraits].slice(0, 12),
      activationStart: String(row.activation_start).slice(0, 10),
      activationEnd: String(row.activation_end).slice(0, 10),
    });
  }

  collisions.sort((a, b) => b.overlapCount - a.overlapCount);

  const totalOverlapEstimate = Math.min(
    proposedSize,
    collisions.reduce((sum, c) => sum + c.overlapCount, 0),
  );
  const uniqueSize = Math.max(0, proposedSize - totalOverlapEstimate);
  const topCollision = collisions[0] ?? null;

  return {
    proposedSize,
    uniqueSize,
    totalOverlapEstimate,
    collisions,
    primaryPair: {
      proposed: { label: "Proposed audience", size: proposedSize },
      topCollision,
    },
  };
}

export async function buildProposedAudience(
  sql: Sql,
  scenario: CollisionScenario,
): Promise<{ proposed: ProposedAudience; nlMappings: { criterion: string; matches: Record<string, unknown>[] }[] }> {
  const { traits, nlMappings } = await resolveCriteriaTraits(sql, scenario);
  const estimatedSize = await estimateCohortSize(sql, traits, scenario.defaultSize);

  const proposed: ProposedAudience = {
    criteria: scenario.criteria,
    traits,
    expression: buildExpression(traits),
    estimatedSize,
    productHint: scenario.productHint,
  };

  return { proposed, nlMappings };
}

export function parseCriteriaLines(criteria: string[] | string): string[] {
  if (Array.isArray(criteria)) return criteria;
  return parseCriteria(criteria);
}
