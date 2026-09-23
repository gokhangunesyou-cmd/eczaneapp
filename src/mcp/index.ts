#!/usr/bin/env node

/**
 * Model Context Protocol (MCP) Server for Nöbetçi Eczane (Duty Pharmacy)
 * Enables AI models to query duty pharmacy information and navigation links by city and district.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import {
  fetchDutyPharmacies,
  fetchCities,
  fetchDistricts,
  resolveCityCode,
  CITIES_MAP,
} from './pharmacy-service';

const server = new Server(
  {
    name: 'nobetci-eczane-mcp',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// ─── TOOL DEFINITIONS ────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, () => {
  return {
    tools: [
      {
        name: 'get_duty_pharmacies',
        description:
          "Türkiye'deki il ve ilçe bazında o günün nöbetçi eczanelerini getirir. Telefon, açık adres, nöbet saatleri ve harita/yol tarifi (Google Maps, Apple Maps, Yandex) linklerini içerir.",
        inputSchema: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description:
                'İl adı (örn. "İstanbul", "Antalya", "Ankara") veya plaka kodu (örn. "34", "07", 7). Varsayılan: 7 (Antalya).',
            },
            district: {
              type: 'string',
              description:
                'İlçe adı (örn. "Muratpaşa", "Kadıköy", "Çankaya") veya TÜİK ilçe kodu (örn. "0715").',
            },
            limit: {
              type: 'number',
              description: 'Getirilecek azami eczane sayısı (1-50, varsayılan 20).',
              minimum: 1,
              maximum: 50,
              default: 20,
            },
            includeExpired: {
              type: 'boolean',
              description: 'Nöbeti bitmiş (kapanmış) eczaneleri de listeye ekler.',
              default: false,
            },
          },
        },
      },
      {
        name: 'get_cities',
        description:
          'Desteklenen 81 Türkiye ilinin listesini, plaka kodlarını ve ilçe sayılarını getirir.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_districts',
        description:
          'Belirtilen bir ile ait tüm ilçeleri ve o ilçedeki aktif nöbetçi eczane sayısını getirir.',
        inputSchema: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: 'İl adı (örn. "İstanbul", "Antalya") veya plaka kodu (örn. "34", 7).',
            },
          },
          required: ['city'],
        },
      },
    ],
  };
});

// ─── TOOL HANDLERS ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'get_duty_pharmacies': {
        const cityInput = (args.city as string | number | undefined) ?? '7';
        const districtInput = args.district as string | undefined;
        const limit = typeof args.limit === 'number' ? args.limit : 20;
        const includeExpired = Boolean(args.includeExpired);

        const result = await fetchDutyPharmacies({
          city: cityInput,
          district: districtInput,
          limit,
          includeExpired,
        });

        const formattedSummary = formatPharmaciesMarkdown(result);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
            {
              type: 'text',
              text: formattedSummary,
            },
          ],
        };
      }

      case 'get_cities': {
        const cities = await fetchCities();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(cities, null, 2),
            },
          ],
        };
      }

      case 'get_districts': {
        if (!args.city) {
          throw new McpError(ErrorCode.InvalidParams, 'city parametresi zorunludur.');
        }
        const cityInput = args.city as string | number;
        const districts = await fetchDistricts(cityInput);
        const cityCode = resolveCityCode(cityInput);
        const cityName = CITIES_MAP[cityCode]?.name || `İl #${cityCode}`;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ cityCode, cityName, districts }, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Bilinmeyen tool: ${name}`);
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Hata: ${errorMessage}`,
        },
      ],
    };
  }
});

// ─── MARKDOWN FORMATTER ──────────────────────────────────────────────────────

function formatPharmaciesMarkdown(result: Awaited<ReturnType<typeof fetchDutyPharmacies>>): string {
  const header = `### 🏥 Nöbetçi Eczaneler: ${result.cityName || 'İl #' + result.cityCode}${
    result.districtName ? ' / ' + result.districtName : ''
  } (${result.count} Eczane)`;

  if (result.count === 0) {
    return `${header}\n\nBelirtilen bölgede bugün nöbetçi eczane bulunamadı veya henüz veri çekilmedi.`;
  }

  const itemsMd = result.items
    .map((p, idx) => {
      const statusBadge = p.status === 'open' ? '🟢 Açık' : '🔴 Kapalı';
      return `**${idx + 1}. ${p.name}** (${statusBadge})
📍 **Adres:** ${p.address} (${p.districtName})
📞 **Telefon:** [${p.phone}](${p.callUrl})
⏰ **Nöbet Saatleri:** ${p.dutyStart} – ${p.dutyEnd}
🗺️ **Yol Tarifi Linkleri:**
- 🚗 [Google Maps Yol Tarifi](${p.directions.googleMaps})
- 🍏 [Apple Maps Yol Tarifi](${p.directions.appleMaps})
- 🧭 [Yandex Navigasyon Linki](${p.directions.yandexMaps})`;
    })
    .join('\n\n---\n\n');

  return `${header}\n\n${itemsMd}`;
}

// ─── SERVER LAUNCH ───────────────────────────────────────────────────────────

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Nöbetçi Eczane MCP Server stdio modunda çalışıyor.');
}

run().catch((error) => {
  console.error('MCP Server hatası:', error);
  process.exit(1);
});
